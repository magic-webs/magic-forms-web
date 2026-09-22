import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, MutationCtx } from "./_generated/server";
import {
  AnyCtx,
  requireFormAccess,
  requireWorkspaceAccess,
  slugify,
} from "./lib/authz";
import { userError } from "./lib/errors";

/**
 * Form groups: a named set of related forms that shares one public link.
 *
 * The group owns nothing — `forms.groupId` points the other way — so deleting a
 * group releases its forms rather than taking them with it.
 */

async function uniqueGroupSlug(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  desired: string,
  ignore?: Id<"formGroups">,
): Promise<string> {
  const base = slugify(desired);
  let slug = base;
  let suffix = 1;
  for (;;) {
    const clash = await ctx.db
      .query("formGroups")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspaceId).eq("slug", slug),
      )
      .unique();
    if (!clash || clash._id === ignore) return slug;
    suffix += 1;
    slug = base + "-" + suffix;
  }
}

async function formsInGroup(
  ctx: AnyCtx,
  groupId: Id<"formGroups">,
): Promise<Doc<"forms">[]> {
  return await ctx.db
    .query("forms")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(200);
}

/** Every group in a workspace, each with the forms that sit in it. */
export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const groups = await ctx.db
      .query("formGroups")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(100);

    return await Promise.all(
      groups
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (group) => {
          const forms = await formsInGroup(ctx, group._id);
          return {
            _id: group._id,
            name: group.name,
            slug: group.slug,
            description: group.description ?? null,
            chooserPrompt: group.chooserPrompt ?? null,
            publicPage: group.publicPage,
            createdAt: group._creationTime,
            forms: forms
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((form) => ({
                _id: form._id,
                title: form.title,
                slug: form.slug,
                status: form.status,
                submissionCount: form.submissionCount,
              })),
            publishedCount: forms.filter((f) => f.status === "published").length,
          };
        }),
    );
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    chooserPrompt: v.optional(v.string()),
    publicPage: v.optional(v.boolean()),
  },
  returns: v.id("formGroups"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccess(
      ctx,
      args.workspaceId,
      "editor",
    );
    const name = args.name.trim() || "Untitled group";
    return await ctx.db.insert("formGroups", {
      workspaceId: args.workspaceId,
      name,
      slug: await uniqueGroupSlug(ctx, args.workspaceId, name),
      description: args.description?.trim() || undefined,
      chooserPrompt: args.chooserPrompt?.trim() || undefined,
      publicPage: args.publicPage ?? true,
      createdBy: user._id,
    });
  },
});

export const update = mutation({
  args: {
    groupId: v.id("formGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    chooserPrompt: v.optional(v.string()),
    slug: v.optional(v.string()),
    publicPage: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get("formGroups", args.groupId);
    if (!group) userError("Group not found.");
    await requireWorkspaceAccess(ctx, group.workspaceId, "editor");

    const patch: Partial<Doc<"formGroups">> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || group.name;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.chooserPrompt !== undefined) {
      patch.chooserPrompt = args.chooserPrompt.trim() || undefined;
    }
    if (args.slug !== undefined) {
      patch.slug = await uniqueGroupSlug(
        ctx,
        group.workspaceId,
        args.slug,
        group._id,
      );
    }
    if (args.publicPage !== undefined) patch.publicPage = args.publicPage;

    await ctx.db.patch("formGroups", args.groupId, patch);
    return null;
  },
});

/** Deletes the group. Its forms survive, ungrouped. */
export const remove = mutation({
  args: { groupId: v.id("formGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get("formGroups", args.groupId);
    if (!group) return null;
    await requireWorkspaceAccess(ctx, group.workspaceId, "admin");

    for (const form of await formsInGroup(ctx, args.groupId)) {
      await ctx.db.patch("forms", form._id, { groupId: undefined });
    }
    await ctx.db.delete("formGroups", args.groupId);
    return null;
  },
});

/** Moves a form into a group, or out of every group when `groupId` is null. */
export const setFormGroup = mutation({
  args: {
    formId: v.id("forms"),
    groupId: v.union(v.id("formGroups"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form } = await requireFormAccess(ctx, args.formId, "editor");
    if (args.groupId !== null) {
      const group = await ctx.db.get("formGroups", args.groupId);
      if (!group || group.workspaceId !== form.workspaceId) {
        userError("That group is not in this workspace.");
      }
    }
    await ctx.db.patch("forms", args.formId, {
      groupId: args.groupId ?? undefined,
    });
    return null;
  },
});
