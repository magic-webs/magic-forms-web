import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireWorkspaceAccess } from "./lib/authz";
import { randomToken, sha256 } from "./lib/crypto";

export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, "admin");
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);
    return keys.map((key) => ({
      _id: key._id,
      name: key.name,
      prefix: key.prefix,
      revoked: key.revoked,
      lastUsedAt: key.lastUsedAt ?? null,
      createdAt: key._creationTime,
    }));
  },
});

export const insertKey = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    prefix: v.string(),
    keyHash: v.string(),
    createdBy: v.id("users"),
  },
  returns: v.id("apiKeys"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("apiKeys", {
      workspaceId: args.workspaceId,
      name: args.name,
      prefix: args.prefix,
      keyHash: args.keyHash,
      createdBy: args.createdBy,
      revoked: false,
    });
  },
});

export const assertCanManageKeys = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccess(ctx, args.workspaceId, "admin");
    return user._id;
  },
});

/**
 * Mints a read API key. The plaintext is returned exactly once — only its
 * SHA-256 digest is stored, so a leaked database cannot be used to call the API.
 */
export const create = action({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  returns: v.object({ apiKey: v.string(), prefix: v.string() }),
  handler: async (ctx, args): Promise<{ apiKey: string; prefix: string }> => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.apiKeys.assertCanManageKeys,
      { workspaceId: args.workspaceId },
    );

    const apiKey = "mf_live_" + randomToken(24);
    const prefix = apiKey.slice(0, 16);
    await ctx.runMutation(internal.apiKeys.insertKey, {
      workspaceId: args.workspaceId,
      name: args.name.trim() || "API key",
      prefix,
      keyHash: await sha256(apiKey),
      createdBy: userId,
    });
    return { apiKey, prefix };
  },
});

export const revoke = mutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get("apiKeys", args.apiKeyId);
    if (!key) return null;
    await requireWorkspaceAccess(ctx, key.workspaceId, "admin");
    await ctx.db.patch("apiKeys", args.apiKeyId, { revoked: true });
    return null;
  },
});

export const remove = mutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get("apiKeys", args.apiKeyId);
    if (!key) return null;
    await requireWorkspaceAccess(ctx, key.workspaceId, "admin");
    await ctx.db.delete("apiKeys", args.apiKeyId);
    return null;
  },
});

/** Resolves a presented key to its workspace. Used by the HTTP API only. */
export const resolveKey = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!key || key.revoked) return null;
    return { apiKeyId: key._id, workspaceId: key.workspaceId };
  },
});

export const touchKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("apiKeys", args.apiKeyId, { lastUsedAt: Date.now() });
    return null;
  },
});
