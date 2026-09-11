/**
 * The Convex connection every MCP tool runs on.
 *
 * The server signs in as a real Magic Forms account and holds that session, so
 * the tools are bounded by exactly the same authorization as the web app: an
 * agent signed in as a workspace editor cannot invite members, and one signed
 * in as staff sees the platform console. No tool ever takes a user id — who the
 * caller is comes from the token, never from an argument.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./api.mjs";

export { api };

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Access tokens last 30 minutes; renew a minute early rather than on failure. */
const RENEW_MARGIN_MS = 60_000;

/**
 * MCP clients launch the server with their own environment, which usually has
 * none of the project's variables in it, so `.env.local` is read as a fallback.
 */
function readEnvFile() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const fileEnv = readEnvFile();

function env(...names) {
  for (const name of names) {
    const value = process.env[name] ?? fileEnv[name];
    if (value) return value.trim();
  }
  return "";
}

/** Convex delivers `userError` messages as ConvexError data — unwrap those. */
export function describeError(error) {
  const data = error?.data;
  if (typeof data === "string") return data;
  if (data && typeof data.message === "string") return data.message;
  return error?.message ?? String(error);
}

export class Session {
  constructor() {
    const url = env("MAGIC_FORMS_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL");
    if (!url) {
      throw new Error(
        "No Convex URL. Set MAGIC_FORMS_CONVEX_URL, or run the server from a " +
          "checkout whose .env.local has NEXT_PUBLIC_CONVEX_URL.",
      );
    }
    this.email = env("MAGIC_FORMS_EMAIL");
    this.password = env("MAGIC_FORMS_PASSWORD");
    if (!this.email || !this.password) {
      throw new Error(
        "Set MAGIC_FORMS_EMAIL and MAGIC_FORMS_PASSWORD to the account this " +
          "server should act as.",
      );
    }

    // Where a form is served from, for the links the tools hand back. The web
    // app and the REST API live on different hosts.
    this.appUrl = (env("MAGIC_FORMS_APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
    this.siteUrl = env("NEXT_PUBLIC_CONVEX_SITE_URL").replace(/\/+$/, "");

    this.client = new ConvexHttpClient(url);
    this.refreshToken = null;
    this.expiresAt = 0;
    this.user = null;
  }

  /** Every address a published form answers on. */
  links(workspaceSlug, formSlug) {
    const path = "/" + workspaceSlug + "/" + formSlug;
    return {
      publicForm: this.appUrl + "/f" + path,
      workspaceDirectory: this.appUrl + "/w/" + workspaceSlug,
      schemaEndpoint: this.siteUrl ? this.siteUrl + "/api/v1/forms" + path : null,
      submitEndpoint: this.siteUrl ? this.siteUrl + "/api/v1/submit" + path : null,
    };
  }

  /** Signs in once, then keeps the access token fresh for the process's life. */
  async authenticate() {
    if (this.refreshToken && Date.now() < this.expiresAt - RENEW_MARGIN_MS) {
      return this.user;
    }

    if (this.refreshToken) {
      const renewed = await this.client.action(api.auth.refresh, {
        refreshToken: this.refreshToken,
      });
      if (renewed) {
        this.client.setAuth(renewed.accessToken);
        this.expiresAt = renewed.accessTokenExpiresAt;
        this.user = renewed.user;
        return this.user;
      }
      // The refresh token expired or was revoked — fall through and sign in.
      this.refreshToken = null;
    }

    const result = await this.client.action(api.auth.signIn, {
      email: this.email,
      password: this.password,
      userAgent: "magic-forms-mcp",
    });
    this.client.setAuth(result.accessToken);
    this.refreshToken = result.refreshToken;
    this.expiresAt = result.accessTokenExpiresAt;
    this.user = result.user;
    return this.user;
  }

  async query(reference, args = {}) {
    await this.authenticate();
    return await this.client.query(reference, args);
  }

  async mutation(reference, args = {}) {
    await this.authenticate();
    return await this.client.mutation(reference, args);
  }

  async action(reference, args = {}) {
    await this.authenticate();
    return await this.client.action(reference, args);
  }

  /** True when this server is signed in as Magic Forms staff. */
  isPlatformAdmin() {
    return this.user?.role === "admin";
  }
}
