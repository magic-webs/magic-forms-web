import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildFormSchema, submitToForm } from "./publicForms";
import { MULTI_TYPES, STATIC_TYPES, parseList } from "./lib/validate";

/**
 * Query/mutation backends for the REST endpoints in `http.ts`.
 *
 * They are internal because HTTP actions are the only intended caller; the
 * endpoints themselves handle API-key authentication.
 */

export const formSchemaBySlug = internalQuery({
  args: { workspaceSlug: v.string(), formSlug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace || workspace.archived) return null;
    const form = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.formSlug),
      )
      .unique();
    if (!form || form.status === "draft") return null;
    return await buildFormSchema(ctx, workspace, form);
  },
});

export const workspaceFormsBySlug = internalQuery({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace || workspace.archived || !workspace.publicDirectory) {
      return null;
    }
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "published"),
      )
      .take(100);
    return {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description ?? null,
      },
      forms: forms.map((form) => ({
        id: form._id,
        title: form.title,
        slug: form.slug,
        description: form.description ?? null,
      })),
    };
  },
});

export const submitViaApi = internalMutation({
  args: {
    workspaceSlug: v.string(),
    formSlug: v.string(),
    data: v.record(v.string(), v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace || workspace.archived) return null;
    const form = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.formSlug),
      )
      .unique();
    if (!form) return null;

    return await submitToForm(ctx, {
      workspace,
      form,
      data: args.data,
      files: [],
      source: "api",
      userAgent: args.userAgent,
      referrer: args.referrer,
    });
  },
});

/** Submission read API, gated on an API key resolved by the HTTP layer. */
export const submissionsForApi = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    formSlug: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    let formId: Id<"forms"> | undefined;
    if (args.formSlug) {
      const form = await ctx.db
        .query("forms")
        .withIndex("by_workspace_and_slug", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("slug", args.formSlug!),
        )
        .unique();
      if (!form) return null;
      formId = form._id;
    }

    const submissions = formId
      ? await ctx.db
          .query("submissions")
          .withIndex("by_form", (q) => q.eq("formId", formId!))
          .order("desc")
          .take(args.limit)
      : await ctx.db
          .query("submissions")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .order("desc")
          .take(args.limit);

    const fieldCache = new Map<
      string,
      { key: string; type: string; label: string }[]
    >();

    return await Promise.all(
      submissions.map(async (submission) => {
        if (!fieldCache.has(submission.formId)) {
          const fields = await ctx.db
            .query("fields")
            .withIndex("by_form", (q) => q.eq("formId", submission.formId))
            .take(300);
          fieldCache.set(
            submission.formId,
            fields
              .filter((f) => !STATIC_TYPES.has(f.type))
              .map((f) => ({ key: f.key, type: f.type, label: f.label })),
          );
        }
        const fields = fieldCache.get(submission.formId) ?? [];

        // Decode list fields so API consumers get real arrays.
        const data: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(submission.data)) {
          const field = fields.find((f) => f.key === key);
          data[key] =
            field && MULTI_TYPES.has(field.type) ? parseList(value) : value;
        }

        return {
          id: submission._id,
          formId: submission.formId,
          submittedAt: new Date(submission._creationTime).toISOString(),
          source: submission.source,
          data,
          files: submission.files.map((f) => ({
            key: f.key,
            name: f.name,
            size: f.size,
          })),
        };
      }),
    );
  },
});
