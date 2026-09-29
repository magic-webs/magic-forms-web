import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ActionCtx, httpAction } from "./_generated/server";
import { sha256 } from "./lib/crypto";
import { ALL_EVENTS, WebhookEvent } from "./lib/events";
import {
  buildPrefillParams,
  isValidExternalRef,
  LINK_PARAM,
  PrefillField,
  toQueryString,
} from "./lib/prefill";
import { appBaseUrl } from "./lib/submissionText";

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
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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

// ---------------------------------------------------------------------------
// Prefilled links
// ---------------------------------------------------------------------------

/**
 * Resolves the API key on a request to the workspace it belongs to.
 * Returns a `Response` to send back when the key is missing or rejected.
 */
async function requireApiKey(
  ctx: ActionCtx,
  request: Request,
): Promise<
  | { ok: true; workspaceId: Id<"workspaces">; apiKeyId: Id<"apiKeys"> }
  | { ok: false; response: Response }
> {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented.startsWith("mf_live_")) {
    return {
      ok: false,
      response: json(
        { error: "Provide an API key as `Authorization: Bearer mf_live_...`." },
        401,
      ),
    };
  }
  const resolved = await ctx.runQuery(internal.apiKeys.resolveKey, {
    keyHash: await sha256(presented),
  });
  if (!resolved) {
    return {
      ok: false,
      response: json({ error: "Invalid or revoked API key." }, 401),
    };
  }
  await ctx.runMutation(internal.apiKeys.touchKey, {
    apiKeyId: resolved.apiKeyId,
  });
  return { ok: true, ...resolved };
}

/**
 * Reads `{ data: {...}, ref?: "..." }`, or the values as a bare object, off a
 * request body. `ref` is always the caller's reference and never a value —
 * bare form included — so a field keyed `ref` is prefilled through `data`.
 */
async function readLinkBody(
  request: Request,
): Promise<{ data: Record<string, unknown>; ref: unknown } | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const nested = record.data;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    return { data: nested as Record<string, unknown>, ref: record.ref };
  }
  const { ref, ...bare } = record;
  return { data: bare, ref };
}

const REF_RULE = "`ref` must be 1-128 characters of A-Z, a-z, 0-9, _ or -.";

/** The caller's `ref`: `undefined` when none was sent, `null` when unusable. */
function readRef(raw: unknown): string | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  return typeof raw === "string" && isValidExternalRef(raw) ? raw : null;
}

/**
 * `GET  /api/v1/links/form/{workspaceSlug}/{formSlug}` — the link, and every
 *       field a link may fill in.
 * `POST /api/v1/links/form/{workspaceSlug}/{formSlug}` — the same link with
 *       values applied: `{ "data": { "full_name": "Asha Menon" } }`. Add
 *       `"ref": "..."` and the link also carries an `mf_link` token, so the
 *       response it produces comes back with `externalRef` set to that ref.
 *
 * Both require `Authorization: Bearer mf_live_...`.
 */
const formLinkHandler = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname
    .replace("/api/v1/links/form/", "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2) {
    return json({ error: "Use /api/v1/links/form/{workspace}/{form}." }, 400);
  }

  const auth = await requireApiKey(ctx, request);
  if (!auth.ok) return auth.response;

  const target = await ctx.runQuery(internal.api.formLinkForApi, {
    workspaceId: auth.workspaceId,
    formSlug: parts[1],
  });
  // The workspace in the path is checked against the key's own workspace, so a
  // key cannot reach across workspaces by naming someone else's slug.
  if (!target || target.workspace.slug !== parts[0]) {
    return json({ error: "Form not found in this workspace." }, 404);
  }

  const base =
    appBaseUrl() + "/f/" + target.workspace.slug + "/" + target.form.slug;

  if (request.method === "GET") {
    return json({
      form: target.form,
      url: base,
      prefill: {
        accepts: target.fields,
        notPrefillable: target.notPrefillable,
        example:
          base +
          toQueryString(
            target.fields
              .slice(0, 2)
              .map((f) => [f.key, f.options?.[0]?.value ?? "value"] as [string, string]),
          ),
      },
    });
  }

  const body = await readLinkBody(request);
  if (!body) return json({ error: "Request body must be a JSON object." }, 400);
  const ref = readRef(body.ref);
  if (ref === null) return json({ error: REF_RULE }, 400);

  const { params, issues } = buildPrefillParams(target.fields, body.data);
  if (issues.length > 0) {
    return json({ error: "Could not build the link.", issues }, 422);
  }

  // The ref itself never goes in the URL — only a token that points at it.
  const link: [string, string][] =
    ref === undefined
      ? []
      : [
          [
            LINK_PARAM,
            await ctx.runMutation(internal.api.createFormLink, {
              workspaceId: auth.workspaceId,
              formId: target.form.id,
              externalRef: ref,
            }),
          ],
        ];

  return json({
    form: target.form,
    url: base + toQueryString([...params, ...link]),
    prefilled: params.map(([key]) => key),
    /** A draft form has no live link yet — the URL is right, the form is not. */
    warning:
      target.form.status === "published"
        ? undefined
        : "This form is " + target.form.status + ", so the link will not accept answers yet.",
  });
});

http.route({ pathPrefix: "/api/v1/links/form/", method: "GET", handler: formLinkHandler });
http.route({ pathPrefix: "/api/v1/links/form/", method: "POST", handler: formLinkHandler });
http.route({ pathPrefix: "/api/v1/links/form/", method: "OPTIONS", handler: preflight() });

/**
 * `GET  /api/v1/links/group/{workspaceSlug}/{groupSlug}` — the group link, and
 *       the prefillable fields of every published form behind it.
 * `POST /api/v1/links/group/{workspaceSlug}/{groupSlug}` — the same link with
 *       values applied; they follow whichever form the visitor picks. A `ref`
 *       works as it does on a form link, for whichever form is submitted.
 *
 * Both require `Authorization: Bearer mf_live_...`.
 */
const groupLinkHandler = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname
    .replace("/api/v1/links/group/", "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2) {
    return json({ error: "Use /api/v1/links/group/{workspace}/{group}." }, 400);
  }

  const auth = await requireApiKey(ctx, request);
  if (!auth.ok) return auth.response;

  const target = await ctx.runQuery(internal.api.groupLinkForApi, {
    workspaceId: auth.workspaceId,
    groupSlug: parts[1],
  });
  if (!target || target.workspace.slug !== parts[0]) {
    return json({ error: "Group not found in this workspace." }, 404);
  }

  const base =
    appBaseUrl() + "/g/" + target.workspace.slug + "/" + target.group.slug;

  /**
   * A key is offered for the group when any form behind it has that key. Its
   * `appliesTo` says which, because a chooser's forms rarely ask the same
   * questions and a caller needs to know what will actually land.
   */
  const shared = new Map<string, PrefillField & { appliesTo: string[] }>();
  for (const form of target.forms) {
    for (const field of form.fields) {
      const existing = shared.get(field.key);
      if (existing) existing.appliesTo.push(form.slug);
      else shared.set(field.key, { ...field, appliesTo: [form.slug] });
    }
  }
  const accepts = [...shared.values()];

  if (request.method === "GET") {
    return json({
      group: target.group,
      url: base,
      forms: target.forms.map((form) => ({
        title: form.title,
        slug: form.slug,
        url: appBaseUrl() + "/f/" + target.workspace.slug + "/" + form.slug,
        prefill: form.fields,
      })),
      prefill: {
        accepts,
        example:
          base +
          toQueryString(
            accepts
              .slice(0, 2)
              .map((f) => [f.key, f.options?.[0]?.value ?? "value"] as [string, string]),
          ),
      },
    });
  }

  const body = await readLinkBody(request);
  if (!body) return json({ error: "Request body must be a JSON object." }, 400);
  const ref = readRef(body.ref);
  if (ref === null) return json({ error: REF_RULE }, 400);

  const { params, issues } = buildPrefillParams(accepts, body.data);
  if (issues.length > 0) {
    return json({ error: "Could not build the link.", issues }, 422);
  }

  // One token for the whole group: it rides through the chooser, and is also
  // on every direct link below, so whichever form is submitted claims the ref.
  const link: [string, string][] =
    ref === undefined
      ? []
      : [
          [
            LINK_PARAM,
            await ctx.runMutation(internal.api.createFormLink, {
              workspaceId: auth.workspaceId,
              groupId: target.groupId,
              externalRef: ref,
            }),
          ],
        ];

  const query = toQueryString([...params, ...link]);
  return json({
    group: target.group,
    url: base + query,
    prefilled: params.map(([key]) => key),
    // The same values, already pointed at each form, for a caller that would
    // rather skip the chooser.
    forms: target.forms.map((form) => ({
      title: form.title,
      slug: form.slug,
      url:
        appBaseUrl() +
        "/f/" +
        target.workspace.slug +
        "/" +
        form.slug +
        toQueryString([
          ...params.filter(([key]) => form.fields.some((f) => f.key === key)),
          ...link,
        ]),
    })),
    warning: target.group.publicPage
      ? undefined
      : "This group's public link is switched off, so the group URL will not resolve.",
  });
});

http.route({ pathPrefix: "/api/v1/links/group/", method: "GET", handler: groupLinkHandler });
http.route({ pathPrefix: "/api/v1/links/group/", method: "POST", handler: groupLinkHandler });
http.route({ pathPrefix: "/api/v1/links/group/", method: "OPTIONS", handler: preflight() });

// ---------------------------------------------------------------------------
// The key's own workspace — what an integration connects with
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/me` — the workspace an API key belongs to. The cheapest way for
 * an integration to check a key before it saves it.
 */
http.route({
  path: "/api/v1/me",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await requireApiKey(ctx, request);
    if (!auth.ok) return auth.response;

    const workspace = await ctx.runQuery(internal.api.workspaceForApi, {
      workspaceId: auth.workspaceId,
    });
    if (!workspace) return json({ error: "Workspace not found." }, 404);
    return json({ workspace });
  }),
});

http.route({ path: "/api/v1/me", method: "OPTIONS", handler: preflight() });

/**
 * `GET /api/v1/forms` — every published form in the key's workspace, with the
 * link to each and the keys that link may prefill (the same list as
 * `prefill.accepts` on the link endpoint).
 */
http.route({
  path: "/api/v1/forms",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await requireApiKey(ctx, request);
    if (!auth.ok) return auth.response;

    const forms = await ctx.runQuery(internal.api.formsForApi, {
      workspaceId: auth.workspaceId,
    });
    if (!forms) return json({ error: "Workspace not found." }, 404);
    return json({ forms });
  }),
});

http.route({ path: "/api/v1/forms", method: "OPTIONS", handler: preflight() });

function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && (ALL_EVENTS as string[]).includes(value);
}

/**
 * `POST /api/v1/webhooks` — subscribe a URL to events in the key's workspace:
 *       `{ "url": "https://...", "events": ["submission.created"],
 *          "name"?: "...", "formId"?: "..." }`.
 *       The signing secret is returned here, once.
 *
 * Requires `Authorization: Bearer mf_live_...`.
 */
http.route({
  path: "/api/v1/webhooks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await requireApiKey(ctx, request);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ error: "Request body must be a JSON object." }, 400);
    }
    const { url, events, name, formId } = body as Record<string, unknown>;

    if (typeof url !== "string" || url.trim() === "") {
      return json({ error: "`url` is required." }, 400);
    }
    const available = "Available: " + ALL_EVENTS.join(", ") + ".";
    if (!Array.isArray(events) || events.length === 0) {
      return json({ error: "`events` must be a non-empty list. " + available }, 400);
    }
    const unknown = events.filter((event) => !isWebhookEvent(event));
    if (unknown.length > 0) {
      return json(
        { error: "Unknown event: " + unknown.map(String).join(", ") + ". " + available },
        400,
      );
    }
    if (name !== undefined && name !== null && typeof name !== "string") {
      return json({ error: "`name` must be a string." }, 400);
    }
    if (formId !== undefined && formId !== null && typeof formId !== "string") {
      return json({ error: "`formId` must be a string." }, 400);
    }

    const result = await ctx.runMutation(internal.api.createWebhookForApi, {
      workspaceId: auth.workspaceId,
      url,
      events: [...new Set(events.filter(isWebhookEvent))],
      name: typeof name === "string" ? name : undefined,
      formId: typeof formId === "string" && formId !== "" ? formId : undefined,
    });
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ webhook: result.webhook }, 201);
  }),
});

/**
 * `DELETE /api/v1/webhooks/{id}` — remove a webhook from the key's workspace.
 * Requires `Authorization: Bearer mf_live_...`.
 */
http.route({
  pathPrefix: "/api/v1/webhooks/",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const parts = new URL(request.url).pathname
      .replace("/api/v1/webhooks/", "")
      .split("/")
      .filter(Boolean);
    if (parts.length !== 1) {
      return json({ error: "Use /api/v1/webhooks/{id}." }, 400);
    }

    const auth = await requireApiKey(ctx, request);
    if (!auth.ok) return auth.response;

    const removed = await ctx.runMutation(internal.api.removeWebhookForApi, {
      workspaceId: auth.workspaceId,
      webhookId: parts[0],
    });
    if (!removed) return json({ error: "Webhook not found in this workspace." }, 404);
    return json({ ok: true });
  }),
});

http.route({ path: "/api/v1/webhooks", method: "OPTIONS", handler: preflight() });
http.route({ pathPrefix: "/api/v1/webhooks/", method: "OPTIONS", handler: preflight() });

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
