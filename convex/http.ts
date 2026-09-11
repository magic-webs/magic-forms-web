import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { sha256 } from "./lib/crypto";

const http = httpRouter();

// ---------------------------------------------------------------------------
// Identity provider endpoints
//
// Convex verifies our own access tokens by discovering these two documents,
// which is what makes `ctx.auth.getUserIdentity()` work without a third party.
// ---------------------------------------------------------------------------

http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () => {
    const issuer = process.env.CONVEX_SITE_URL;
    return new Response(
      JSON.stringify({
        issuer,
        jwks_uri: issuer + "/.well-known/jwks.json",
        authorization_endpoint: issuer + "/oauth/authorize",
        response_types_supported: ["id_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async () => {
    const jwks = process.env.JWKS;
    if (!jwks) return new Response("JWKS not configured", { status: 500 });
    return new Response(jwks, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=15, must-revalidate",
      },
    });
  }),
});

// ---------------------------------------------------------------------------
// Public REST API
// ---------------------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function preflight() {
  return httpAction(async () => new Response(null, { status: 204, headers: CORS }));
}

/** `GET /api/v1/forms/:workspaceSlug/:formSlug` — the form definition. */
http.route({
  pathPrefix: "/api/v1/forms/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const parts = new URL(request.url).pathname
      .replace("/api/v1/forms/", "")
      .split("/")
      .filter(Boolean);

    if (parts.length === 1) {
      const directory = await ctx.runQuery(internal.api.workspaceFormsBySlug, {
        workspaceSlug: parts[0],
      });
      if (!directory) return json({ error: "Workspace not found." }, 404);
      return json(directory);
    }
    if (parts.length !== 2) {
      return json(
        { error: "Use /api/v1/forms/{workspace}/{form}." },
        400,
      );
    }

    const schema = await ctx.runQuery(internal.api.formSchemaBySlug, {
      workspaceSlug: parts[0],
      formSlug: parts[1],
    });
    if (!schema) return json({ error: "Form not found or not published." }, 404);
    return json(schema);
  }),
});

http.route({ pathPrefix: "/api/v1/forms/", method: "OPTIONS", handler: preflight() });

/**
 * `POST /api/v1/submit/:workspaceSlug/:formSlug` — create a submission.
 *
 * Open by design, exactly like the hosted form link. Values may be sent as
 * strings, numbers, booleans or arrays; everything is normalised to the string
 * form the validator expects.
 */
http.route({
  pathPrefix: "/api/v1/submit/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const parts = new URL(request.url).pathname
      .replace("/api/v1/submit/", "")
      .split("/")
      .filter(Boolean);
    if (parts.length !== 2) {
      return json({ error: "Use /api/v1/submit/{workspace}/{form}." }, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ error: "Request body must be a JSON object." }, 400);
    }

    // Accept either a bare object or `{ data: { ... } }`.
    const source = (body as Record<string, unknown>).data;
    const raw: Record<string, unknown> =
      typeof source === "object" && source !== null && !Array.isArray(source)
        ? (source as Record<string, unknown>)
        : (body as Record<string, unknown>);

    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        data[key] = JSON.stringify(value.map((item) => String(item)));
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        data[key] = String(value);
      } else {
        return json(
          { error: 'Field "' + key + '" must be a string, number, boolean or array.' },
          400,
        );
      }
    }

    const result = await ctx.runMutation(internal.api.submitViaApi, {
      workspaceSlug: parts[0],
      formSlug: parts[1],
      data,
      userAgent: request.headers.get("user-agent") ?? undefined,
      referrer: request.headers.get("referer") ?? undefined,
    });

    if (result === null) return json({ error: "Form not found." }, 404);
    if (!result.ok) return json({ error: "Validation failed.", issues: result.issues }, 422);
    return json(
      {
        ok: true,
        submissionId: result.submissionId,
        message: result.successMessage,
      },
      201,
    );
  }),
});

http.route({ pathPrefix: "/api/v1/submit/", method: "OPTIONS", handler: preflight() });

/**
 * `GET /api/v1/submissions?form=slug&limit=50` — read stored responses.
 * Requires `Authorization: Bearer mf_live_...`.
 */
http.route({
  path: "/api/v1/submissions",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const header = request.headers.get("authorization") ?? "";
    const presented = header.replace(/^Bearer\s+/i, "").trim();
    if (!presented.startsWith("mf_live_")) {
      return json(
        { error: "Provide an API key as `Authorization: Bearer mf_live_...`." },
        401,
      );
    }

    const resolved = await ctx.runQuery(internal.apiKeys.resolveKey, {
      keyHash: await sha256(presented),
    });
    if (!resolved) return json({ error: "Invalid or revoked API key." }, 401);

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 50, 1),
      200,
    );

    const submissions = await ctx.runQuery(internal.api.submissionsForApi, {
      workspaceId: resolved.workspaceId,
      formSlug: url.searchParams.get("form") ?? undefined,
      limit,
    });
    if (submissions === null) return json({ error: "Form not found." }, 404);

    await ctx.runMutation(internal.apiKeys.touchKey, {
      apiKeyId: resolved.apiKeyId,
    });
    return json({ count: submissions.length, submissions });
  }),
});

http.route({ path: "/api/v1/submissions", method: "OPTIONS", handler: preflight() });

export default http;
