import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import { userError } from "./lib/errors";

/** Platform-wide numbers for the admin console. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    const workspaces = await ctx.db.query("workspaces").take(1000);
    const forms = await ctx.db.query("forms").take(1000);
    const webhooks = await ctx.db.query("webhooks").take(1000);

    return {
      userCount: users.length,
      adminCount: users.filter((u) => u.role === "admin").length,
      workspaceCount: workspaces.filter((w) => !w.archived).length,
      formCount: forms.length,
      publishedFormCount: forms.filter((f) => f.status === "published").length,
      submissionCount: forms.reduce((n, f) => n + f.submissionCount, 0),
      viewCount: forms.reduce((n, f) => n + f.viewCount, 0),
      webhookCount: webhooks.length,
    };
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(500);
    return await Promise.all(
      users.map(async (user) => {
        const memberships = await ctx.db
          .query("members")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(50);
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: user.company ?? null,
          disabled: user.disabled ?? false,
          workspaceCount: memberships.length,
          createdAt: user._creationTime,
        };
      }),
    );
  },
});

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const workspaces = await ctx.db.query("workspaces").order("desc").take(500);
    return await Promise.all(
      workspaces.map(async (workspace) => {
        const owner = await ctx.db.get("users", workspace.ownerId);
        const forms = await ctx.db
          .query("forms")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
          .take(200);
        const members = await ctx.db
          .query("members")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
          .take(100);
        return {
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          archived: workspace.archived ?? false,
          ownerName: owner?.name ?? "Unknown",
          ownerEmail: owner?.email ?? "",
          formCount: forms.length,
          memberCount: members.length,
          submissionCount: forms.reduce((n, f) => n + f.submissionCount, 0),
          createdAt: workspace._creationTime,
        };
      }),
    );
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId && args.role !== "admin") {
      userError("You cannot remove your own administrator access.");
    }
    await ctx.db.patch("users", args.userId, { role: args.role });
    return null;
  },
});

export const setUserDisabled = mutation({
  args: { userId: v.id("users"), disabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId) {
      userError("You cannot disable your own account.");
    }
    await ctx.db.patch("users", args.userId, { disabled: args.disabled });

    // Revoking access should end live sessions too.
    if (args.disabled) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .take(200);
      for (const session of sessions) {
        await ctx.db.delete("sessions", session._id);
      }
    }
    return null;
  },
});

export const deleteWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch("workspaces", args.workspaceId, { archived: true });
    await ctx.scheduler.runAfter(0, internal.cleanup.purgeWorkspace, {
      workspaceId: args.workspaceId,
    });
    return null;
  },
});
