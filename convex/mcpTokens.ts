import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
} from "./_generated/server";
import { mintAccessToken } from "./auth";
import { requireAdmin, requireUser, requireWorkspaceAccess } from "./lib/authz";
import { randomToken, sha256 } from "./lib/crypto";

/**
 * Tokens for the hosted MCP endpoint at `/api/mcp/{token}`.
 *
 * A token stands in for the account that created it: redeeming one mints the
 * same short-lived access token a sign-in would, so every downstream call is
 * checked by the ordinary `requireWorkspaceAccess` path and an agent can never
 * reach further than the person who created its token. Only a SHA-256 digest is
 * stored, so the endpoint URL cannot be recovered from the database.
 */

export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccess(ctx, args.workspaceId);
    const tokens = await ctx.db
      .query("mcpTokens")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);

    return await Promise.all(
      tokens.map(async (token) => {
        const owner = await ctx.db.get("users", token.userId);
        return {
          _id: token._id,
          name: token.name,
          prefix: token.prefix,
          revoked: token.revoked,
          lastUsedAt: token.lastUsedAt ?? null,
          createdAt: token._creationTime,
          ownerName: owner?.name ?? "Unknown",
          ownerEmail: owner?.email ?? "",
          // A token carries its owner's access, so only the owner can be sure
          // what it is able to do.
          isYours: token.userId === user._id,
        };
      }),
    );
  },
});

export const assertMember = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccess(ctx, args.workspaceId);
    return user._id;
  },
});

export const insertToken = internalMutation({
  args: {
    userId: v.id("users"),
    /** Absent for a platform token minted from the admin console. */
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    prefix: v.string(),
    tokenHash: v.string(),
  },
  returns: v.id("mcpTokens"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("mcpTokens", {
      userId: args.userId,
      workspaceId: args.workspaceId,
      name: args.name.trim() || "Agent",
      prefix: args.prefix,
      tokenHash: args.tokenHash,
      revoked: false,
    });
  },
});

/**
 * Mints a token for the caller. The plaintext is returned exactly once — the
 * caller composes the endpoint URL from it, since Convex does not know which
 * origin the web app is served from.
 */
export const create = action({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  returns: v.object({ token: v.string(), prefix: v.string() }),
  handler: async (ctx, args): Promise<{ token: string; prefix: string }> => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.mcpTokens.assertMember,
      { workspaceId: args.workspaceId },
    );

    const token = "mf_mcp_" + randomToken(24);
    const prefix = token.slice(0, 15);
    await ctx.runMutation(internal.mcpTokens.insertToken, {
      userId,
      workspaceId: args.workspaceId,
      name: args.name,
      prefix,
      tokenHash: await sha256(token),
    });
    return { token, prefix };
  },
});

/**
 * Someone other than the token's owner needs standing to touch it: a workspace
 * admin where the token was created, or platform staff. A platform token
 * belongs to no workspace, so only staff qualify.
 */
async function requireTokenControl(
  ctx: MutationCtx,
  token: Doc<"mcpTokens">,
): Promise<void> {
  const user = await requireUser(ctx);
  if (token.userId === user._id) return;
  if (token.workspaceId === undefined) {
    await requireAdmin(ctx);
    return;
  }
  await requireWorkspaceAccess(ctx, token.workspaceId, "admin");
}

/** The owner of a token can always revoke it; so can a workspace admin. */
export const revoke = mutation({
  args: { tokenId: v.id("mcpTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get("mcpTokens", args.tokenId);
    if (!token) return null;
    await requireTokenControl(ctx, token);
    await ctx.db.patch("mcpTokens", args.tokenId, { revoked: true });
    return null;
  },
});

export const remove = mutation({
  args: { tokenId: v.id("mcpTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get("mcpTokens", args.tokenId);
    if (!token) return null;
    await requireTokenControl(ctx, token);
    await ctx.db.delete("mcpTokens", args.tokenId);
    return null;
  },
});

export const resolveToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token || token.revoked) return null;
    const user = await ctx.db.get("users", token.userId);
    if (!user || user.disabled) return null;
    return { tokenId: token._id, user };
  },
});

export const touchToken = internalMutation({
  args: { tokenId: v.id("mcpTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("mcpTokens", args.tokenId, { lastUsedAt: Date.now() });
    return null;
  },
});

const exchangeResult = v.object({
  accessToken: v.string(),
  expiresAt: v.number(),
  user: v.object({
    _id: v.id("users"),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  }),
});

/**
 * Redeems a token for a short-lived access token. Public by necessity — this is
 * what the hosted endpoint calls before it can do anything, exactly as
 * `auth:signIn` is public. It reveals nothing without a valid token.
 */
export const exchange = action({
  args: { token: v.string() },
  returns: v.union(v.null(), exchangeResult),
  handler: async (ctx, args): Promise<typeof exchangeResult.type | null> => {
    const presented = args.token.trim();
    if (!presented.startsWith("mf_mcp_")) return null;

    const resolved: { tokenId: Id<"mcpTokens">; user: Doc<"users"> } | null =
      await ctx.runQuery(internal.mcpTokens.resolveToken, {
        tokenHash: await sha256(presented),
      });
    if (!resolved) return null;

    const access = await mintAccessToken(resolved.user._id, resolved.user.role);
    await ctx.runMutation(internal.mcpTokens.touchToken, {
      tokenId: resolved.tokenId,
    });

    return {
      accessToken: access.token,
      expiresAt: access.expiresAt,
      user: {
        _id: resolved.user._id,
        email: resolved.user.email,
        name: resolved.user.name,
        role: resolved.user.role,
      },
    };
  },
});
