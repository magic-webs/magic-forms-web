import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { visibleFields } from "./lib/conditions";
import { randomToken } from "./lib/crypto";
import { dispatchEvent } from "./lib/events";
import {
  buildSubmissionText,
  submissionLines,
  submissionViewUrl,
} from "./lib/submissionText";
import { serialiseField, validateSubmission } from "./lib/validate";

/**
 * Everything in this file is deliberately unauthenticated — it backs the public
 * form links and the same data the HTTP API serves. Only published forms are
 * ever resolvable, and nothing here exposes a workspace's private fields.
 */

async function resolveForm(
  ctx: QueryCtx | MutationCtx,
  workspaceSlug: string,
  formSlug: string,
): Promise<{ workspace: Doc<"workspaces">; form: Doc<"forms"> } | null> {
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (q) => q.eq("slug", workspaceSlug))
    .unique();
  if (!workspace || workspace.archived) return null;

  const form = await ctx.db
    .query("forms")
    .withIndex("by_workspace_and_slug", (q) =>
      q.eq("workspaceId", workspace._id).eq("slug", formSlug),
    )
    .unique();
  if (!form || form.status === "draft") return null;
  return { workspace, form };
}

export async function buildFormSchema(
  ctx: QueryCtx | MutationCtx,
  workspace: Doc<"workspaces">,
  form: Doc<"forms">,
) {
  const steps = await ctx.db
    .query("steps")
    .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
    .take(50);
  const fields = await ctx.db
    .query("fields")
    .withIndex("by_form", (q) => q.eq("formId", form._id))
    .take(300);

  // Only a group with a live public page is named here — it becomes a "back to
  // the chooser" link, and a dashboard-only group has nowhere to go back to.
  const group = form.groupId ? await ctx.db.get("formGroups", form.groupId) : null;

  return {
    workspace: { name: workspace.name, slug: workspace.slug },
    group:
      group && group.publicPage
        ? { name: group.name, slug: group.slug }
        : null,
    form: {
      id: form._id,
      title: form.title,
      description: form.description ?? null,
      slug: form.slug,
      status: form.status,
      settings: form.settings,
    },
    steps: steps
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        id: step._id,
        title: step.title,
        description: step.description ?? null,
        // The renderer needs the rules, not just the result: which steps show
        // depends on answers it has not collected yet.
        condition: step.condition ?? null,
        fields: fields
          .filter((f) => f.stepId === step._id)
          .sort((a, b) => a.order - b.order)
          .map(serialiseField),
      })),
  };
}

/** The definition a public form page renders from. */
export const getFormSchema = query({
  args: { workspaceSlug: v.string(), formSlug: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveForm(ctx, args.workspaceSlug, args.formSlug);
    if (!resolved) return null;
    return await buildFormSchema(ctx, resolved.workspace, resolved.form);
  },
});

/** The shared workspace link: every published form in one place. */
export const getWorkspaceDirectory = query({
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

    const rows = await Promise.all(
      forms.map(async (form) => {
        const fields = await ctx.db
          .query("fields")
          .withIndex("by_form", (q) => q.eq("formId", form._id))
          .take(300);
        const steps = await ctx.db
          .query("steps")
          .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
          .take(50);
        return {
          title: form.title,
          slug: form.slug,
          description: form.description ?? null,
          fieldCount: fields.filter(
            (f) => !["heading", "paragraph", "divider"].includes(f.type),
          ).length,
          stepCount: steps.length,
        };
      }),
    );

    return {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description ?? null,
      },
      forms: rows,
    };
  },
});

/**
 * The public chooser behind a group's shareable link.
 *
 * Only published forms are listed: a group is a front door, and a draft has no
 * business being behind it.
 */
export const getGroupDirectory = query({
  args: { workspaceSlug: v.string(), groupSlug: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace || workspace.archived) return null;

    const group = await ctx.db
      .query("formGroups")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.groupSlug),
      )
      .unique();
    if (!group || !group.publicPage) return null;

    const forms = await ctx.db
      .query("forms")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .take(100);

    // Title and description only: the chooser shows nothing else, and reading
    // every field of every form to count them made a 13-form group read
    // thousands of documents to render a line of grey text.
    const rows = forms
      .filter((form) => form.status === "published")
      .map((form) => ({
        title: form.title,
        slug: form.slug,
        description: form.description ?? null,
      }));

    return {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        publicDirectory: workspace.publicDirectory,
      },
      group: {
        name: group.name,
        slug: group.slug,
        description: group.description ?? null,
        chooserPrompt: group.chooserPrompt ?? null,
      },
      forms: rows.sort((a, b) => a.title.localeCompare(b.title)),
    };
  },
});

/**
 * One submission, resolved by the token in its magic link.
 *
 * Unauthenticated on purpose: the token *is* the credential, and it only ever
 * travels in the notification sent to the form's own workspace. Nothing here
 * reveals anything about the workspace beyond this single response.
 */
export const getSubmissionByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Short tokens can only be a mistyped link; don't let one probe the index.
    if (args.token.length < 16) return null;

    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_viewToken", (q) => q.eq("viewToken", args.token))
      .unique();
    if (!submission) return null;

    const form = await ctx.db.get("forms", submission.formId);
    const workspace = await ctx.db.get("workspaces", submission.workspaceId);
    if (!form || !workspace) return null;

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
      .take(50);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .take(300);

    const files = await Promise.all(
      submission.files.map(async (file) => ({
        key: file.key,
        name: file.name,
        size: file.size,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      form: { title: form.title, slug: form.slug },
      submittedAt: submission._creationTime,
      source: submission.source,
      whatsapp: submission.whatsapp ?? null,
      rows: submissionLines({
        steps,
        fields,
        data: submission.data,
        files: submission.files,
      }),
      files,
      // Older submissions predate the stored text; rebuilding it keeps the
      // page useful for them, just without the link it would already contain.
      formattedText:
        submission.formattedText ??
        buildSubmissionText({
          formTitle: form.title,
          steps,
          fields,
          data: submission.data,
          files: submission.files,
          whatsapp: submission.whatsapp,
          submittedAt: submission._creationTime,
        }),
    };
  },
});

/** Counts a view and fires `form.viewed`. Called once when a form page opens. */
export const recordView = mutation({
  args: { workspaceSlug: v.string(), formSlug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resolved = await resolveForm(ctx, args.workspaceSlug, args.formSlug);
    if (!resolved) return null;
    await ctx.db.patch("forms", resolved.form._id, {
      viewCount: resolved.form.viewCount + 1,
    });
    await dispatchEvent(ctx, {
      workspaceId: resolved.workspace._id,
      formId: resolved.form._id,
      event: "form.viewed",
      payload: { formId: resolved.form._id, slug: resolved.form.slug },
    });
    return null;
  },
});

/** Fires `form.step_completed` as someone advances through a multi-step form. */
export const recordStepCompleted = mutation({
  args: {
    workspaceSlug: v.string(),
    formSlug: v.string(),
    stepIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resolved = await resolveForm(ctx, args.workspaceSlug, args.formSlug);
    if (!resolved) return null;
    await dispatchEvent(ctx, {
      workspaceId: resolved.workspace._id,
      formId: resolved.form._id,
      event: "form.step_completed",
      payload: {
        formId: resolved.form._id,
        slug: resolved.form.slug,
        stepIndex: args.stepIndex,
      },
    });
    return null;
  },
});

/** Upload slot for `file` fields on a public form. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

const submitResult = v.union(
  v.object({
    ok: v.literal(true),
    submissionId: v.id("submissions"),
    successTitle: v.string(),
    successMessage: v.string(),
    redirectUrl: v.union(v.string(), v.null()),
  }),
  v.object({
    ok: v.literal(false),
    issues: v.array(v.object({ key: v.string(), message: v.string() })),
  }),
);

/**
 * Accepts a submission for a published form. Shared by the renderer and the
 * HTTP API (via `submitToForm` below), so validation cannot be side-stepped.
 */
export async function submitToForm(
  ctx: MutationCtx,
  args: {
    workspace: Doc<"workspaces">;
    form: Doc<"forms">;
    data: Record<string, string>;
    files: {
      key: string;
      storageId: Id<"_storage">;
      name: string;
      size: number;
    }[];
    source: "web" | "api";
    userAgent?: string;
    referrer?: string;
    /** Already resolved from a trusted `formLinks` row — never client input. */
    externalRef?: string;
    /** From the same row, and just as trusted. */
    whatsapp?: string;
  },
): Promise<typeof submitResult.type> {
  if (args.form.status !== "published") {
    return {
      ok: false,
      issues: [{ key: "_form", message: "This form is not accepting responses." }],
    };
  }

  const fields = await ctx.db
    .query("fields")
    .withIndex("by_form", (q) => q.eq("formId", args.form._id))
    .take(300);
  const steps = await ctx.db
    .query("steps")
    .withIndex("by_form_and_order", (q) => q.eq("formId", args.form._id))
    .take(50);

  // Branches the person never saw are not theirs to answer: their fields are
  // neither required of them nor recorded against them. Resolving this here
  // rather than trusting the client is what stops a crafted payload smuggling
  // in values from a branch the form's own rules ruled out.
  const shown = visibleFields(steps, fields, args.data);
  const shownKeys = new Set(shown.map((field) => field.key));

  const { issues, cleaned } = validateSubmission(shown, args.data);
  if (issues.length > 0) return { ok: false, issues };

  const files = args.files.filter((file) => shownKeys.has(file.key));

  // The magic link has to exist before the message that carries it, so the
  // token is minted here and the text is built around it. Both the text and
  // `answers` read only the fields that were on screen, so a checkbox on a
  // branch nobody took is not reported as a "No".
  const viewToken = randomToken(24);
  const viewUrl = submissionViewUrl(viewToken);
  const formattedText = buildSubmissionText({
    formTitle: args.form.title,
    steps,
    fields: shown,
    data: cleaned,
    files,
    viewUrl,
    whatsapp: args.whatsapp,
    submittedAt: Date.now(),
  });
  const answers = submissionLines({
    steps,
    fields: shown,
    data: cleaned,
    files,
    fileSizes: false,
  });

  const submissionId = await ctx.db.insert("submissions", {
    formId: args.form._id,
    workspaceId: args.workspace._id,
    data: cleaned,
    files,
    source: args.source,
    userAgent: args.userAgent,
    referrer: args.referrer,
    read: false,
    formattedText,
    viewToken,
    externalRef: args.externalRef,
    whatsapp: args.whatsapp,
  });

  await ctx.db.patch("forms", args.form._id, {
    submissionCount: args.form.submissionCount + 1,
  });

  await dispatchEvent(ctx, {
    workspaceId: args.workspace._id,
    formId: args.form._id,
    event: "submission.created",
    payload: {
      submissionId,
      formId: args.form._id,
      formTitle: args.form.title,
      formSlug: args.form.slug,
      source: args.source,
      data: cleaned,
      files: args.files.map((f) => ({ key: f.key, name: f.name, size: f.size })),
      /** Ready to forward to WhatsApp as-is — labels, answers and the link. */
      formattedText,
      viewUrl,
      /** The `ref` the link was built with, when the person came through one. */
      externalRef: args.externalRef ?? null,
      /** The WhatsApp number that link was built for, when it was. */
      whatsapp: args.whatsapp ?? null,
      /** The rows of `formattedText`, keyed, for a consumer that wants fields. */
      answers,
    },
  });

  return {
    ok: true,
    submissionId,
    successTitle: args.form.settings.successTitle,
    successMessage: args.form.settings.successMessage,
    redirectUrl: args.form.settings.redirectUrl ?? null,
  };
}

export const submit = mutation({
  args: {
    workspaceSlug: v.string(),
    formSlug: v.string(),
    data: v.record(v.string(), v.string()),
    files: v.array(
      v.object({
        key: v.string(),
        storageId: v.id("_storage"),
        name: v.string(),
        size: v.number(),
      }),
    ),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    /** The `mf_link` token the page was opened with, if any. */
    link: v.optional(v.string()),
  },
  returns: submitResult,
  handler: async (ctx, args): Promise<typeof submitResult.type> => {
    const resolved = await resolveForm(ctx, args.workspaceSlug, args.formSlug);
    if (!resolved) {
      return {
        ok: false,
        issues: [{ key: "_form", message: "This form could not be found." }],
      };
    }
    const link = await linkFor(
      ctx,
      resolved.workspace,
      resolved.form,
      args.link,
    );
    return await submitToForm(ctx, {
      workspace: resolved.workspace,
      form: resolved.form,
      data: args.data,
      files: args.files,
      source: "web",
      userAgent: args.userAgent,
      referrer: args.referrer,
      externalRef: link?.externalRef,
      whatsapp: link?.whatsapp,
    });
  },
});

/**
 * What an `mf_link` token stands for — the caller's `ref` and the WhatsApp
 * number the link was sent to — when the token was minted for this form, or
 * for the group the form sits in.
 *
 * Anything else — unknown, another workspace's, another form's — is ignored
 * rather than rejected: the token only labels a response, and a stale or
 * mangled link must never be the reason someone's answers are turned away.
 */
async function linkFor(
  ctx: MutationCtx,
  workspace: Doc<"workspaces">,
  form: Doc<"forms">,
  token: string | undefined,
): Promise<{ externalRef?: string; whatsapp?: string } | null> {
  // Minted tokens are 32 characters; anything far off that is not one of ours.
  if (!token || token.length < 16 || token.length > 128) return null;
  const link = await ctx.db
    .query("formLinks")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!link || link.workspaceId !== workspace._id) return null;
  const matches =
    link.formId === form._id ||
    (link.groupId !== undefined && link.groupId === form.groupId);
  return matches
    ? { externalRef: link.externalRef, whatsapp: link.whatsapp }
    : null;
}
