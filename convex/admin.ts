import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import { hashPassword, randomToken, sha256 } from "./lib/crypto";
import { userError } from "./lib/errors";
import { uniqueSlug } from "./workspaces";

const DAY = 24 * 60 * 60 * 1000;

/** Platform-wide numbers for the admin console. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    const workspaces = await ctx.db.query("workspaces").take(1000);
    const forms = await ctx.db.query("forms").take(1000);
    const webhooks = await ctx.db.query("webhooks").take(1000);
    const mcpTokens = await ctx.db.query("mcpTokens").take(1000);
    const apiKeys = await ctx.db.query("apiKeys").take(1000);

    const submissionCount = forms.reduce((n, f) => n + f.submissionCount, 0);
    const viewCount = forms.reduce((n, f) => n + f.viewCount, 0);

    return {
      userCount: users.length,
      adminCount: users.filter((u) => u.role === "admin").length,
      disabledUserCount: users.filter((u) => u.disabled).length,
      workspaceCount: workspaces.filter((w) => !w.archived).length,
      archivedWorkspaceCount: workspaces.filter((w) => w.archived).length,
      formCount: forms.length,
      draftFormCount: forms.filter((f) => f.status === "draft").length,
      publishedFormCount: forms.filter((f) => f.status === "published").length,
      closedFormCount: forms.filter((f) => f.status === "closed").length,
      submissionCount,
      viewCount,
      // Views are counted on the form, so this is the only conversion figure
      // the platform can state without re-reading every submission.
      conversionRate:
        viewCount > 0 ? Math.round((submissionCount / viewCount) * 100) : 0,
      webhookCount: webhooks.length,
      mcpTokenCount: mcpTokens.filter((t) => !t.revoked).length,
      revokedMcpTokenCount: mcpTokens.filter((t) => t.revoked).length,
      apiKeyCount: apiKeys.filter((k) => !k.revoked).length,
    };
  },
});

/**
 * Daily counts for the admin console charts.
 *
 * `now` is an argument rather than a `Date.now()` read because queries are not
 * rerun when the clock advances — the client passes an hour-rounded value, so
 * the result stays cacheable and still moves forward over a long session.
 *
 * Signups and workspaces are bucketed from the whole (small) tables.
 * Submissions are walked newest-first and stopped at the window edge, so a
 * platform with years of responses still only reads the days being charted;
 * `truncated` says the window itself was too dense to read in full.
 */
export const activity = query({
  args: { now: v.number(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const days = Math.min(Math.max(Math.round(args.days ?? 30), 7), 90);
    // Bucket by whole day, ending with the day `now` falls in.
    const end = Math.floor(args.now / DAY) * DAY + DAY;
    const start = end - days * DAY;
    const bucketOf = (t: number) => Math.floor((t - start) / DAY);

    const signups = new Array<number>(days).fill(0);
    const newWorkspaces = new Array<number>(days).fill(0);
    const submissions = new Array<number>(days).fill(0);

    for (const user of await ctx.db.query("users").take(1000)) {
      const bucket = bucketOf(user._creationTime);
      if (bucket >= 0 && bucket < days) signups[bucket] += 1;
    }
    for (const workspace of await ctx.db.query("workspaces").take(1000)) {
      const bucket = bucketOf(workspace._creationTime);
      if (bucket >= 0 && bucket < days) newWorkspaces[bucket] += 1;
    }

    const SCAN_LIMIT = 4000;
    let scanned = 0;
    let truncated = false;
    for await (const submission of ctx.db.query("submissions").order("desc")) {
      if (submission._creationTime < start) break;
      if (scanned >= SCAN_LIMIT) {
        truncated = true;
        break;
      }
      scanned += 1;
      const bucket = bucketOf(submission._creationTime);
      if (bucket >= 0 && bucket < days) submissions[bucket] += 1;
    }

    return {
      days,
      truncated,
      series: signups.map((_, index) => ({
        date: start + index * DAY,
        signups: signups[index],
        workspaces: newWorkspaces[index],
        submissions: submissions[index],
      })),
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

// ---------------------------------------------------------------------------
// MCP
//
// Every hosted-endpoint token on the platform, in one place. A token acts as
// the account that created it, so this list is really a list of standing
// agent access — the thing staff most need to be able to see and cut off.
// Revoking and deleting go through `mcpTokens:revoke` / `mcpTokens:remove`,
// which already admit platform staff; there is no second code path here.
// ---------------------------------------------------------------------------

/** Every MCP token on the platform, newest first. */
export const listMcpTokens = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const tokens = await ctx.db.query("mcpTokens").order("desc").take(500);

    // A handful of workspaces and owners are shared across many tokens.
    const users = new Map<Id<"users">, Doc<"users"> | null>();
    const workspaces = new Map<
      Id<"workspaces">,
      Doc<"workspaces"> | null
    >();

    return await Promise.all(
      tokens.map(async (token) => {
        if (!users.has(token.userId)) {
          users.set(token.userId, await ctx.db.get("users", token.userId));
        }
        const owner = users.get(token.userId) ?? null;

        let workspace: Doc<"workspaces"> | null = null;
        if (token.workspaceId !== undefined) {
          if (!workspaces.has(token.workspaceId)) {
            workspaces.set(
              token.workspaceId,
              await ctx.db.get("workspaces", token.workspaceId),
            );
          }
          workspace = workspaces.get(token.workspaceId) ?? null;
        }

        return {
          _id: token._id,
          name: token.name,
          prefix: token.prefix,
          revoked: token.revoked,
          lastUsedAt: token.lastUsedAt ?? null,
          createdAt: token._creationTime,
          ownerId: token.userId,
          ownerName: owner?.name ?? "Deleted account",
          ownerEmail: owner?.email ?? "",
          /** Staff tokens carry the `admin_*` tools; ordinary ones do not. */
          ownerIsAdmin: owner?.role === "admin",
          ownerDisabled: owner?.disabled ?? false,
          workspaceId: token.workspaceId ?? null,
          workspaceName: workspace?.name ?? null,
          /** Minted from this console, belonging to no single workspace. */
          isPlatform: token.workspaceId === undefined,
          isYours: token.userId === admin._id,
        };
      }),
    );
  },
});

/**
 * Mints the caller's platform MCP endpoint — the "main" one.
 *
 * It differs from a workspace token only in belonging to no workspace; what it
 * can reach comes from the caller's platform `admin` role, and Convex re-checks
 * that role on every call underneath. The plaintext is returned exactly once.
 */
export const createPlatformMcpToken = action({
  args: { name: v.optional(v.string()) },
  returns: v.object({ token: v.string(), prefix: v.string() }),
  handler: async (ctx, args): Promise<{ token: string; prefix: string }> => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.admin.assertPlatformAdmin,
      {},
    );

    const token = "mf_mcp_" + randomToken(24);
    const prefix = token.slice(0, 15);
    await ctx.runMutation(internal.mcpTokens.insertToken, {
      userId,
      name: args.name?.trim() || "Platform agent",
      prefix,
      tokenHash: await sha256(token),
    });
    return { token, prefix };
  },
});
