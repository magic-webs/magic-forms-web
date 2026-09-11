import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

export type AnyCtx = QueryCtx | MutationCtx;

/** The signed-in user, or null when the request carries no valid token. */
export async function getCurrentUser(ctx: AnyCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  // `subject` is the users table id we minted the token for.
  const user = await ctx.db.get("users", identity.subject as Id<"users">);
  if (!user || user.disabled) return null;
  return user;
}

export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not signed in.");
  return user;
}

export async function requireAdmin(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Administrator access required.");
  return user;
}

const RANK: Record<Doc<"members">["role"], number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export type WorkspaceAccess = {
  user: Doc<"users">;
  workspace: Doc<"workspaces">;
  role: Doc<"members">["role"];
};

/**
 * Resolves the caller's role in a workspace and enforces a minimum.
 * Platform admins are treated as owners of every workspace.
 */
export async function requireWorkspaceAccess(
  ctx: AnyCtx,
  workspaceId: Id<"workspaces">,
  minimumRole: Doc<"members">["role"] = "viewer",
): Promise<WorkspaceAccess> {
  const user = await requireUser(ctx);
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  if (user.role === "admin") return { user, workspace, role: "owner" };

  const membership = await ctx.db
    .query("members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();

  if (!membership) throw new Error("You do not have access to this workspace.");
  if (RANK[membership.role] < RANK[minimumRole]) {
    throw new Error(`This action requires the ${minimumRole} role.`);
  }
  return { user, workspace, role: membership.role };
}

/** Same as above, but starting from a form. */
export async function requireFormAccess(
  ctx: AnyCtx,
  formId: Id<"forms">,
  minimumRole: Doc<"members">["role"] = "viewer",
): Promise<WorkspaceAccess & { form: Doc<"forms"> }> {
  const form = await ctx.db.get("forms", formId);
  if (!form) throw new Error("Form not found.");
  const access = await requireWorkspaceAccess(ctx, form.workspaceId, minimumRole);
  return { ...access, form };
}

/** Lowercase, dash separated, safe in a URL. */
export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "untitled";
}
