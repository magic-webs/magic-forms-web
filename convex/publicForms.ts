import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { visibleFields } from "./lib/conditions";
import { dispatchEvent } from "./lib/events";
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

  return {
    workspace: { name: workspace.name, slug: workspace.slug },
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

  const submissionId = await ctx.db.insert("submissions", {
    formId: args.form._id,
    workspaceId: args.workspace._id,
    data: cleaned,
    files,
    source: args.source,
    userAgent: args.userAgent,
    referrer: args.referrer,
    read: false,
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
    return await submitToForm(ctx, {
      workspace: resolved.workspace,
      form: resolved.form,
      data: args.data,
      files: args.files,
      source: "web",
      userAgent: args.userAgent,
      referrer: args.referrer,
    });
  },
});
