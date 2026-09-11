import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import { adminTools } from "@/mcp/tools/admin.mjs";
import { formTools } from "@/mcp/tools/forms.mjs";
import { integrationTools } from "@/mcp/tools/integrations.mjs";
import { workspaceTools } from "@/mcp/tools/workspace.mjs";

/**
 * The hosted MCP endpoint: `POST /api/mcp/{token}`.
 *
 * Same tools as the stdio server in `mcp/`, reachable by any MCP client that
 * speaks HTTP — no checkout, no Node, nothing to install. The token in the path
 * is redeemed for the short-lived access token a sign-in would produce, so
 * every call underneath is authorised as the account that created the token and
 * an agent can never reach past its owner.
 *
 * The token sits in the URL because that is what MCP clients accept as a bare
 * endpoint; `Authorization: Bearer <token>` is honoured too, and is the better
 * choice where the client supports headers, since URLs end up in logs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tool = {
  name: string;
  scope: "company" | "admin";
  description: string;
  input: { type: "object"; required?: string[] };
  run: (session: Session, args: Record<string, unknown>) => Promise<unknown>;
};

const ALL_TOOLS = [
  ...workspaceTools,
  ...formTools,
  ...integrationTools,
  ...adminTools,
] as Tool[];

const PROTOCOL_VERSION = "2025-06-18";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
};

type ExchangedUser = { _id: string; email: string; name: string; role: string };

/**
 * A warm instance reuses a minted access token rather than re-signing on every
 * JSON-RPC message. Held for a minute at most, not for the access token's full
 * 30 minutes: nothing re-checks the MCP token while it is cached, so this
 * window is exactly how long a revoked token keeps working.
 */
const CACHE_TTL_MS = 60_000;

const cache = new Map<
  string,
  { accessToken: string; expiresAt: number; user: ExchangedUser }
>();

/** What the tool modules expect to be handed. */
class Session {
  client: ConvexHttpClient;
  user: ExchangedUser;
  appUrl: string;
  siteUrl: string;

  constructor(accessToken: string, user: ExchangedUser, appUrl: string) {
    this.client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    this.client.setAuth(accessToken);
    this.user = user;
    this.appUrl = appUrl.replace(/\/+$/, "");
    this.siteUrl = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  }

  async authenticate() {
    return this.user;
  }

  isPlatformAdmin() {
    return this.user.role === "admin";
  }

  links(workspaceSlug: string, formSlug: string) {
    const path = "/" + workspaceSlug + "/" + formSlug;
    return {
      publicForm: this.appUrl + "/f" + path,
      workspaceDirectory: this.appUrl + "/w/" + workspaceSlug,
      schemaEndpoint: this.siteUrl ? this.siteUrl + "/api/v1/forms" + path : null,
      submitEndpoint: this.siteUrl ? this.siteUrl + "/api/v1/submit" + path : null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(reference: any, args: Record<string, unknown> = {}) {
    return this.client.query(reference, args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation(reference: any, args: Record<string, unknown> = {}) {
    return this.client.mutation(reference, args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action(reference: any, args: Record<string, unknown> = {}) {
    return this.client.action(reference, args);
  }
}

function describeError(error: unknown): string {
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  if (data && typeof (data as { message?: string }).message === "string") {
    return (data as { message: string }).message;
  }
  return (error as Error)?.message ?? String(error);
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function resolveSession(token: string, appUrl: string) {
  const cached = cache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return new Session(cached.accessToken, cached.user, appUrl);
  }

  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const exchanged = await client.action(api.mcpTokens.exchange, { token });
  if (!exchanged) {
    cache.delete(token);
    return null;
  }

  cache.set(token, {
    accessToken: exchanged.accessToken,
    expiresAt: Math.min(exchanged.expiresAt, Date.now() + CACHE_TTL_MS),
    user: exchanged.user,
  });
  return new Session(exchanged.accessToken, exchanged.user, appUrl);
}

/** Handles one JSON-RPC message. Returns null for notifications. */
async function handleMessage(
  message: { id?: unknown; method?: string; params?: Record<string, unknown> },
  session: Session,
  tools: Tool[],
) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion:
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "magic-forms", version: "1.0.0" },
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input,
        })),
      });

    case "tools/call": {
      const name = params?.name as string;
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) {
        const known = ALL_TOOLS.some((candidate) => candidate.name === name);
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: known
                ? name +
                  " needs the platform administrator role, and this token acts as " +
                  session.user.email + "."
                : "No such tool: " + name + ".",
            },
          ],
          isError: true,
        });
      }

      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      const missing = (tool.input.required ?? []).filter(
        (key) => args[key] === undefined || args[key] === null,
      );
      if (missing.length > 0) {
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: "Missing required argument(s): " + missing.join(", ") + ".",
            },
          ],
          isError: true,
        });
      }

      try {
        const result = await tool.run(session, args);
        return rpcResult(id, {
          content: [
            { type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) },
          ],
        });
      } catch (error) {
        // A refused call is a fact the agent should act on, not a transport
        // failure, so it comes back as tool output rather than an RPC error.
        return rpcResult(id, {
          content: [{ type: "text", text: describeError(error) }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(id, -32601, "Unknown method: " + String(method));
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const fromPath = (await params).token;
  const fromHeader = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const token = (fromHeader || fromPath || "").trim();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Request body must be JSON."), 400);
  }

  const session = await resolveSession(token, new URL(request.url).origin);
  if (!session) {
    // 401 rather than an RPC error: the client should stop and re-authorise
    // rather than retry the call.
    return json(
      rpcError(null, -32001, "Unknown, revoked or expired MCP token."),
      401,
    );
  }

  const tools = ALL_TOOLS.filter(
    (tool) => tool.scope !== "admin" || session.isPlatformAdmin(),
  );

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const message of messages) {
    const response = await handleMessage(message, session, tools);
    if (response) responses.push(response);
  }

  // Every message was a notification — nothing to answer with.
  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? responses : responses[0]);
}

export async function GET() {
  return json(
    {
      error:
        "This endpoint speaks MCP over HTTP. POST JSON-RPC to it, or point an " +
        "MCP client at this URL.",
    },
    405,
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
