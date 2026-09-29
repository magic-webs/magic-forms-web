import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, QueryCtx } from "./_generated/server";
import { buildFormSchema, submitToForm } from "./publicForms";
import { webhookEvent } from "./schema";
import { deleteWebhook, insertWebhook, webhookUrlProblem } from "./webhooks";
import { randomToken } from "./lib/crypto";
import { prefillableFields } from "./lib/prefill";
import { appBaseUrl, submissionViewUrl } from "./lib/submissionText";
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

/** A form's fields and steps: what `prefillableFields` is worked out from. */
async function loadFormLayout(ctx: QueryCtx, formId: Id<"forms">) {
  const fields = await ctx.db
    .query("fields")
    .withIndex("by_form", (q) => q.eq("formId", formId))
    .take(300);
  const steps = await ctx.db
    .query("steps")
    .withIndex("by_form_and_order", (q) => q.eq("formId", formId))
    .take(50);
  return { fields, steps };
}

/** The workspace an API key belongs to, for `GET /api/v1/me`. */
export const workspaceForApi = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.archived) return null;
    return { id: workspace._id, name: workspace.name, slug: workspace.slug };
  },
});

/**
 * Every published form in the key's workspace, each with the keys a link to it
 * may fill in — so an integration can offer the right form and prefill it
 * without a second round trip per form.
 *
 * Unlike the public directory this ignores `publicDirectory`: that switch is
 * about strangers browsing, and a key already belongs to the workspace.
 */
export const formsForApi = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.archived) return null;
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "published"),
      )
      .take(100);

    return await Promise.all(
      forms.map(async (form) => {
        const { fields, steps } = await loadFormLayout(ctx, form._id);
        const group = form.groupId
          ? await ctx.db.get("formGroups", form.groupId)
          : null;
        return {
          id: form._id,
          title: form.title,
          slug: form.slug,
          description: form.description ?? null,
          url: appBaseUrl() + "/f/" + workspace.slug + "/" + form.slug,
          group: group ? { name: group.name, slug: group.slug } : null,
          // The same list the link endpoint returns as `prefill.accepts`.
          prefill: prefillableFields(steps, fields),
        };
      }),
    );
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

    const { fields, steps } = await loadFormLayout(ctx, form._id);

    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      form: {
        id: form._id,
        title: form.title,
        slug: form.slug,
        status: form.status,
      },
      fields: prefillableFields(steps, fields),
      /** Named so a caller knows why a `file` field is missing above. */
      notPrefillable: fields
        .filter((f) => f.type === "file")
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
          const { fields, steps } = await loadFormLayout(ctx, form._id);
          return {
            title: form.title,
            slug: form.slug,
            fields: prefillableFields(steps, fields),
          };
        }),
    );

    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      /** For minting a `formLinks` row; not part of any response. */
      groupId: group._id,
      group: {
        name: group.name,
        slug: group.slug,
        publicPage: group.publicPage,
      },
      forms: rows,
    };
  },
});

/**
 * Mints the token behind a link built with a `ref`. The token is all the URL
 * carries; the ref waits here until a submission through the link claims it.
 */
export const createFormLink = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    formId: v.optional(v.id("forms")),
    groupId: v.optional(v.id("formGroups")),
    externalRef: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const token = randomToken(24);
    await ctx.db.insert("formLinks", {
      token,
      workspaceId: args.workspaceId,
      formId: args.formId,
      groupId: args.groupId,
      externalRef: args.externalRef,
      createdAt: Date.now(),
    });
    return token;
  },
});

const apiWebhook = v.object({
  id: v.id("webhooks"),
  name: v.string(),
  url: v.string(),
  events: v.array(webhookEvent),
  formId: v.union(v.id("forms"), v.null()),
  secret: v.string(),
});

/**
 * `POST /api/v1/webhooks`: the same row the dashboard makes, in the key's own
 * workspace. Problems come back as a status and message rather than a thrown
 * error, so the endpoint can answer 400 or 404 instead of 500.
 */
export const createWebhookForApi = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    url: v.string(),
    events: v.array(webhookEvent),
    /** Unchecked text off the request; resolved against this workspace here. */
    formId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), webhook: apiWebhook }),
    v.object({ ok: v.literal(false), status: v.number(), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const problem = webhookUrlProblem(args.url);
    if (problem) return { ok: false as const, status: 400, error: problem };
    if (args.events.length === 0) {
      return {
        ok: false as const,
        status: 400,
        error: "Pick at least one event to listen for.",
      };
    }

    let formId: Id<"forms"> | undefined;
    if (args.formId !== undefined) {
      const id = ctx.db.normalizeId("forms", args.formId);
      const form = id ? await ctx.db.get("forms", id) : null;
      if (!form || form.workspaceId !== args.workspaceId) {
        return {
          ok: false as const,
          status: 404,
          error: "Form not found in this workspace.",
        };
      }
      formId = form._id;
    }

    const hook = await insertWebhook(ctx, {
      workspaceId: args.workspaceId,
      name: args.name?.trim() || "API webhook",
      url: args.url,
      events: args.events,
      formId,
    });
    return {
      ok: true as const,
      webhook: {
        id: hook._id,
        name: hook.name,
        url: hook.url,
        events: hook.events,
        formId: hook.formId ?? null,
        secret: hook.secret,
      },
    };
  },
});

/** `DELETE /api/v1/webhooks/{id}`. `false` when the id is not this workspace's. */
export const removeWebhookForApi = internalMutation({
  args: { workspaceId: v.id("workspaces"), webhookId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("webhooks", args.webhookId);
    const hook = id ? await ctx.db.get("webhooks", id) : null;
    if (!hook || hook.workspaceId !== args.workspaceId) return false;
    await deleteWebhook(ctx, hook._id);
    return true;
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
          /** The `ref` of the API-built link it came through, if any. */
          externalRef: submission.externalRef ?? null,
        };
      }),
    );
  },
});
