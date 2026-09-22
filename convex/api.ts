import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildFormSchema, submitToForm } from "./publicForms";
import { isPrefillable, serialisePrefillField } from "./lib/prefill";
import { submissionViewUrl } from "./lib/submissionText";
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

/**
 * Everything needed to build a prefilled link to one form: where it lives, and
 * which of its fields a link may fill in.
 *
 * Scoped to the workspace the API key belongs to, so a key can never address a
 * form in someone else's workspace by guessing its slug.
 */
export const formLinkForApi = internalQuery({
  args: { workspaceId: v.id("workspaces"), formSlug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.archived) return null;
    const form = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.formSlug),
      )
      .unique();
    if (!form) return null;

    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .take(300);
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
      .take(50);
    const stepOrder = new Map(steps.map((s) => [s._id, s.order]));

    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      form: {
        id: form._id,
        title: form.title,
        slug: form.slug,
        status: form.status,
      },
      fields: fields
        .filter((f) => isPrefillable(f.type))
        .sort((a, b) => {
          const sa = stepOrder.get(a.stepId) ?? 0;
          const sb = stepOrder.get(b.stepId) ?? 0;
          return sa === sb ? a.order - b.order : sa - sb;
        })
        .map(serialisePrefillField),
      /** Named so a caller knows why a `file` field is missing above. */
      notPrefillable: fields
        .filter((f) => !isPrefillable(f.type) && f.type === "file")
        .map((f) => f.key),
    };
  },
});

/** The same, for a group link: every published form behind one address. */
export const groupLinkForApi = internalQuery({
  args: { workspaceId: v.id("workspaces"), groupSlug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.archived) return null;
    const group = await ctx.db
      .query("formGroups")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.groupSlug),
      )
      .unique();
    if (!group) return null;

    const forms = await ctx.db
      .query("forms")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .take(100);

    const rows = await Promise.all(
      forms
        .filter((form) => form.status === "published")
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(async (form) => {
          const fields = await ctx.db
            .query("fields")
            .withIndex("by_form", (q) => q.eq("formId", form._id))
            .take(300);
          return {
            title: form.title,
            slug: form.slug,
            fields: fields
              .filter((f) => isPrefillable(f.type))
              .map(serialisePrefillField),
          };
        }),
    );

    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      group: {
        name: group.name,
        slug: group.slug,
        publicPage: group.publicPage,
      },
      forms: rows,
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
          // The same chat-ready text the `submission.created` webhook carries,
          // so a consumer polling this endpoint can forward it just as easily.
          formattedText: submission.formattedText ?? null,
          viewUrl: submission.viewToken
            ? submissionViewUrl(submission.viewToken)
            : null,
        };
      }),
    );
  },
});
