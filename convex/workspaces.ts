import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, MutationCtx } from "./_generated/server";
import {
  requireUser,
  requireWorkspaceAccess,
  slugify,
} from "./lib/authz";
import { memberRole } from "./schema";
import { userError } from "./lib/errors";

async function uniqueSlug(
  ctx: MutationCtx,
  desired: string,
  ignore?: Id<"workspaces">,
): Promise<string> {
  const base = slugify(desired);
  let slug = base;
  let suffix = 1;
  for (;;) {
    const clash = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!clash || clash._id === ignore) return slug;
    suffix += 1;
    slug = base + "-" + suffix;
  }
}

/** Every workspace the signed-in user can open, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    let workspaces: Doc<"workspaces">[];
    const roleByWorkspace = new Map<Id<"workspaces">, Doc<"members">["role"]>();

    if (user.role === "admin") {
      // Platform staff see everything.
      workspaces = await ctx.db.query("workspaces").order("desc").take(200);
      for (const workspace of workspaces) {
        roleByWorkspace.set(workspace._id, "owner");
      }
    } else {
      const memberships = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(100);
      const loaded = await Promise.all(
        memberships.map(async (m) => {
          roleByWorkspace.set(m.workspaceId, m.role);
          return await ctx.db.get("workspaces", m.workspaceId);
        }),
      );
      workspaces = loaded.filter((w): w is Doc<"workspaces"> => w !== null);
    }

    return workspaces
      .filter((w) => !w.archived)
      .map((w) => ({
        _id: w._id,
        name: w.name,
        slug: w.slug,
        description: w.description,
        publicDirectory: w.publicDirectory,
        role: roleByWorkspace.get(w._id) ?? "viewer",
      }));
  },
});

export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { workspace, role } = await requireWorkspaceAccess(
      ctx,
      args.workspaceId,
    );
    return { ...workspace, role };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!workspace) return null;
    const access = await requireWorkspaceAccess(ctx, workspace._id);
    return { ...workspace, role: access.role };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({ workspaceId: v.id("workspaces"), slug: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2) userError("Workspace names need 2+ characters.");

    const slug = await uniqueSlug(ctx, name);
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      slug,
      description: args.description?.trim() || undefined,
      ownerId: user._id,
      publicDirectory: true,
    });
    await ctx.db.insert("members", {
      workspaceId,
      userId: user._id,
      role: "owner",
    });
    return { workspaceId, slug };
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    publicDirectory: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, "admin");
    const patch: Partial<Doc<"workspaces">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) userError("Workspace names need 2+ characters.");
      patch.name = name;
      patch.slug = await uniqueSlug(ctx, name, args.workspaceId);
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.publicDirectory !== undefined) {
      patch.publicDirectory = args.publicDirectory;
    }
    await ctx.db.patch("workspaces", args.workspaceId, patch);
    return null;
  },
});

/**
 * Removes a workspace and everything under it. Forms are deleted one batch at a
 * time so a large workspace cannot blow the transaction limits.
 */
export const remove = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, "owner");
    await ctx.db.patch("workspaces", args.workspaceId, { archived: true });
    await ctx.scheduler.runAfter(0, internal.cleanup.purgeWorkspace, {
      workspaceId: args.workspaceId,
    });
    return null;
  },
});

// --- members -----------------------------------------------------------------

export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get("users", m.userId);
        return user
          ? {
              _id: m._id,
              userId: user._id,
              name: user.name,
              email: user.email,
              role: m.role,
              joinedAt: m._creationTime,
            }
          : null;
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

/** Adds an existing Magic Forms account to this workspace. */
export const addMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: memberRole,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, "admin");
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      userError(
        "No Magic Forms account uses that email yet — ask them to sign up first.",
      );
    }
    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (existing) userError("That person is already a member.");

    await ctx.db.insert("members", {
      workspaceId: args.workspaceId,
      userId: user._id,
      role: args.role,
    });
    return null;
  },
});

export const updateMemberRole = mutation({
  args: { memberId: v.id("members"), role: memberRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get("members", args.memberId);
    if (!member) userError("Member not found.");
    const { workspace } = await requireWorkspaceAccess(
      ctx,
      member.workspaceId,
      "admin",
    );
    if (member.userId === workspace.ownerId) {
      userError("The workspace owner's role cannot be changed.");
    }
    await ctx.db.patch("members", args.memberId, { role: args.role });
    return null;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get("members", args.memberId);
    if (!member) return null;
    const { workspace } = await requireWorkspaceAccess(
      ctx,
      member.workspaceId,
      "admin",
    );
    if (member.userId === workspace.ownerId) {
      userError("The workspace owner cannot be removed.");
    }
    await ctx.db.delete("members", args.memberId);
    return null;
  },
});

/** Headline numbers for the workspace overview page. */
export const stats = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);

    const recent = await ctx.db
      .query("submissions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);

    const webhooks = await ctx.db
      .query("webhooks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);

    const totalSubmissions = forms.reduce((n, f) => n + f.submissionCount, 0);
    const totalViews = forms.reduce((n, f) => n + f.viewCount, 0);

    return {
      formCount: forms.length,
      publishedCount: forms.filter((f) => f.status === "published").length,
      totalSubmissions,
      totalViews,
      conversionRate:
        totalViews > 0 ? Math.round((totalSubmissions / totalViews) * 100) : 0,
      webhookCount: webhooks.filter((w) => w.enabled).length,
      unreadCount: recent.filter((s) => !s.read).length,
      recentSubmissions: recent.slice(0, 8).map((s) => ({
        _id: s._id,
        formId: s.formId,
        formTitle: forms.find((f) => f._id === s.formId)?.title ?? "Deleted form",
        createdAt: s._creationTime,
        read: s.read,
        source: s.source,
      })),
    };
  },
});
