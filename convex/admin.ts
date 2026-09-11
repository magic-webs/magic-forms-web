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
import { requireAdmin } from "./lib/authz";
import { hashPassword, randomToken } from "./lib/crypto";
import { userError } from "./lib/errors";
import { uniqueSlug } from "./workspaces";

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

// ---------------------------------------------------------------------------
// Provisioning
//
// The console above is read-and-moderate only: staff could see every account
// but had no way to stand one up. These are what let an administrator — or an
// AI agent signed in as one — create a company and its workspace outright.
// ---------------------------------------------------------------------------

/** Confirms the caller is platform staff, for actions that cannot reach the db. */
export const assertPlatformAdmin = internalQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    return admin._id;
  },
});

/** The account, its workspace and the owner membership, in one transaction. */
export const provisionCompany = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    company: v.string(),
    workspaceName: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) userError("An account with that email already exists.");

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: "user",
      company: args.company,
    });

    const slug = await uniqueSlug(ctx, args.workspaceName);
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.workspaceName,
      slug,
      ownerId: userId,
      publicDirectory: true,
    });
    await ctx.db.insert("members", { workspaceId, userId, role: "owner" });

    return { userId, workspaceId, slug };
  },
});

type ProvisionedCompany = {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  slug: string;
  temporaryPassword: string | null;
};

/**
 * Creates a company account and the workspace it owns.
 *
 * Password hashing needs Web Crypto, so this is an action; the write itself
 * happens in `provisionCompany`. Omit `password` and one is generated and
 * returned exactly once — nothing stores the plaintext, so it cannot be
 * recovered afterwards, only reset.
 */
export const createCompany = action({
  args: {
    email: v.string(),
    name: v.string(),
    workspaceName: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    temporaryPassword: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<ProvisionedCompany> => {
    await ctx.runQuery(internal.admin.assertPlatformAdmin, {});

    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      userError("Enter a valid email address.");
    }
    if (args.password !== undefined && args.password.length < 8) {
      userError("Passwords must be at least 8 characters.");
    }

    const name = args.name.trim() || email.split("@")[0];
    const company = args.workspaceName?.trim() || name;
    const generated = args.password ? null : randomToken(12);
    const { hash, salt } = await hashPassword(args.password ?? generated!);

    const created: Omit<ProvisionedCompany, "temporaryPassword"> =
      await ctx.runMutation(internal.admin.provisionCompany, {
        email,
        name,
        passwordHash: hash,
        passwordSalt: salt,
        company,
        workspaceName: args.workspaceName?.trim() || name + " workspace",
      });

    return { ...created, temporaryPassword: generated };
  },
});

/** An extra workspace for a company that already has an account. */
export const createWorkspaceFor = mutation({
  args: {
    ownerEmail: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({ workspaceId: v.id("workspaces"), slug: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.ownerEmail.trim().toLowerCase();
    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!owner) userError("No Magic Forms account uses that email.");

    const name = args.name.trim();
    if (name.length < 2) userError("Workspace names need 2+ characters.");

    const slug = await uniqueSlug(ctx, name);
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      slug,
      description: args.description?.trim() || undefined,
      ownerId: owner._id,
      publicDirectory: true,
    });
    await ctx.db.insert("members", {
      workspaceId,
      userId: owner._id,
      role: "owner",
    });
    return { workspaceId, slug };
  },
});
