#!/usr/bin/env node
/**
 * The Magic Forms MCP server.
 *
 *   node mcp/server.mjs          # speak MCP over stdio (what a client runs)
 *   node mcp/server.mjs --list   # print the tools this account can use, and exit
 *
 * It signs in as one Magic Forms account and exposes that account's abilities
 * as tools, so an AI agent can create a company, stand up a workspace, build
 * and publish forms, manage members and read responses without touching the UI.
 *
 * Which tools exist depends on who it signed in as: an account with the
 * platform `admin` role also gets the `admin_*` provisioning and moderation
 * tools. That is a convenience for the agent — Convex re-checks the role on
 * every call, so hiding a tool is never what keeps it from being used.
 *
 * Required environment (also read from `.env.local` at the repo root):
 *   MAGIC_FORMS_EMAIL, MAGIC_FORMS_PASSWORD   the account to act as
 *   NEXT_PUBLIC_CONVEX_URL                    the deployment to talk to
 * Optional:
 *   MAGIC_FORMS_APP_URL                       where the web app is served
 *   NEXT_PUBLIC_CONVEX_SITE_URL               the REST API host, for links
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Session, describeError } from "./convex.mjs";
import { adminTools } from "./tools/admin.mjs";
import { formTools } from "./tools/forms.mjs";
import { integrationTools } from "./tools/integrations.mjs";
import { workspaceTools } from "./tools/workspace.mjs";

const ALL_TOOLS = [
  ...workspaceTools,
  ...formTools,
  ...integrationTools,
  ...adminTools,
];

// stdout carries the JSON-RPC stream — anything else written there corrupts it,
// so every human-readable line goes to stderr.
const log = (message) => process.stderr.write(message + "\n");

function fail(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function buildServer(session, account, tools) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server(
    { name: "magic-forms", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      // An admin tool called by a company account lands here, which is the
      // clearest place to say why it is missing rather than merely unknown.
      const known = ALL_TOOLS.some((t) => t.name === request.params.name);
      return fail(
        known
          ? request.params.name +
              " needs the platform administrator role, and this server is " +
              "signed in as " +
              account.email +
              "."
          : "No such tool: " + request.params.name + ".",
      );
    }

    const args = request.params.arguments ?? {};
    const missing = (tool.input.required ?? []).filter(
      (key) => args[key] === undefined || args[key] === null,
    );
    if (missing.length > 0) {
      return fail("Missing required argument(s): " + missing.join(", ") + ".");
    }

    try {
      const result = await tool.run(session, args);
      return {
        content: [
          { type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) },
        ],
      };
    } catch (error) {
      // A refused call is a fact the agent should read and act on, not a
      // transport failure — report it as tool output with isError set.
      return fail(describeError(error));
    }
  });

  return server;
}

async function main() {
  const session = new Session();
  const account = await session.authenticate();
  const isAdmin = session.isPlatformAdmin();
  const tools = ALL_TOOLS.filter((tool) => tool.scope !== "admin" || isAdmin);
  const who = account.email + (isAdmin ? " (platform admin)" : "");

  if (process.argv.includes("--list")) {
    log("Signed in as " + who + " — " + tools.length + " tools:");
    for (const tool of tools) log("  " + tool.scope.padEnd(8) + tool.name);
    return;
  }

  await buildServer(session, account, tools).connect(new StdioServerTransport());
  log("Magic Forms MCP ready — " + who + ", " + tools.length + " tools.");
}

try {
  await main();
} catch (error) {
  // Bad credentials or a missing deployment URL — say which, and stop. Setting
  // the code rather than calling process.exit lets the HTTP client's socket
  // close on its own, which Node on Windows is particular about.
  log("Magic Forms MCP: " + describeError(error));
  process.exitCode = 1;
}
