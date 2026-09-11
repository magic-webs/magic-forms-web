import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, MutationCtx } from "./_generated/server";
import {
  requireFormAccess,
  requireWorkspaceAccess,
  slugify,
} from "./lib/authz";
import { dispatchEvent } from "./lib/events";
import { fieldOption, fieldType, fieldValidation } from "./schema";

const DEFAULT_SETTINGS = {
  submitLabel: "Submit",
  successTitle: "Thanks!",
  successMessage: "Your response has been recorded.",
  showProgressBar: true,
  allowMultipleSubmissions: true,
};

async function uniqueFormSlug(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  desired: string,
  ignore?: Id<"forms">,
): Promise<string> {
  const base = slugify(desired);
  let slug = base;
  let suffix = 1;
  for (;;) {
    const clash = await ctx.db
      .query("forms")
      .withIndex("by_workspace_and_slug", (q) =>
        q.eq("workspaceId", workspaceId).eq("slug", slug),
      )
      .unique();
    if (!clash || clash._id === ignore) return slug;
    suffix += 1;
    slug = base + "-" + suffix;
  }
}

/** Turns a label into a payload key that is unique within the form. */
async function uniqueFieldKey(
  ctx: MutationCtx,
  formId: Id<"forms">,
  desired: string,
  ignore?: Id<"fields">,
): Promise<string> {
  const base = slugify(desired).replace(/-/g, "_") || "field";
  const existing = await ctx.db
    .query("fields")
    .withIndex("by_form", (q) => q.eq("formId", formId))
    .take(300);
  const taken = new Set(
    existing.filter((f) => f._id !== ignore).map((f) => f.key),
  );
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(base + "_" + suffix)) suffix += 1;
  return base + "_" + suffix;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(200);

    return await Promise.all(
      forms.map(async (form) => {
        const steps = await ctx.db
          .query("steps")
          .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
          .take(50);
        const fields = await ctx.db
          .query("fields")
          .withIndex("by_form", (q) => q.eq("formId", form._id))
          .take(300);
        return {
          _id: form._id,
          title: form.title,
          slug: form.slug,
          description: form.description,
          status: form.status,
          submissionCount: form.submissionCount,
          viewCount: form.viewCount,
          stepCount: steps.length,
          fieldCount: fields.length,
          updatedAt: form._creationTime,
        };
      }),
    );
  },
});

/** The whole form definition: settings, ordered steps, and each step's fields. */
export const getWithSchema = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const { form, role, workspace } = await requireFormAccess(ctx, args.formId);
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
      .take(50);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .take(300);

    return {
      form,
      role,
      workspace: { _id: workspace._id, name: workspace.name, slug: workspace.slug },
      steps: steps
        .sort((a, b) => a.order - b.order)
        .map((step) => ({
          ...step,
          fields: fields
            .filter((f) => f.stepId === step._id)
            .sort((a, b) => a.order - b.order),
        })),
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("forms"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccess(
      ctx,
      args.workspaceId,
      "editor",
    );
    const title = args.title.trim() || "Untitled form";
    const slug = await uniqueFormSlug(ctx, args.workspaceId, title);

    const formId = await ctx.db.insert("forms", {
      workspaceId: args.workspaceId,
      title,
      description: args.description?.trim() || undefined,
      slug,
      status: "draft",
      submissionCount: 0,
      viewCount: 0,
      settings: DEFAULT_SETTINGS,
      createdBy: user._id,
    });

    // Every form starts with one step so the builder always has somewhere to go.
    await ctx.db.insert("steps", {
      formId,
      order: 0,
      title: "Step 1",
    });

    await dispatchEvent(ctx, {
      workspaceId: args.workspaceId,
      formId,
      event: "form.created",
      payload: { formId, title, slug },
    });
    return formId;
  },
});

export const update = mutation({
  args: {
    formId: v.id("forms"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    settings: v.optional(
      v.object({
        submitLabel: v.string(),
        successTitle: v.string(),
        successMessage: v.string(),
        redirectUrl: v.optional(v.string()),
        showProgressBar: v.boolean(),
        allowMultipleSubmissions: v.boolean(),
        closedMessage: v.optional(v.string()),
        accentColor: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form } = await requireFormAccess(ctx, args.formId, "editor");
    const patch: Partial<Doc<"forms">> = {};

    if (args.title !== undefined) patch.title = args.title.trim() || form.title;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.slug !== undefined) {
      patch.slug = await uniqueFormSlug(
        ctx,
        form.workspaceId,
        args.slug,
        form._id,
      );
    }
    if (args.settings !== undefined) patch.settings = args.settings;

    await ctx.db.patch("forms", args.formId, patch);
    await dispatchEvent(ctx, {
      workspaceId: form.workspaceId,
      formId: form._id,
      event: "form.updated",
      payload: { formId: form._id, changed: Object.keys(patch) },
    });
    return null;
  },
});

export const setStatus = mutation({
  args: {
    formId: v.id("forms"),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("closed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form } = await requireFormAccess(ctx, args.formId, "editor");
    if (args.status === "published") {
      const fields = await ctx.db
        .query("fields")
        .withIndex("by_form", (q) => q.eq("formId", form._id))
        .take(2);
      if (fields.length === 0) {
        throw new Error("Add at least one field before publishing.");
      }
    }
    await ctx.db.patch("forms", args.formId, { status: args.status });

    const event =
      args.status === "published"
        ? "form.published"
        : form.status === "published"
          ? "form.unpublished"
          : "form.updated";
    await dispatchEvent(ctx, {
      workspaceId: form.workspaceId,
      formId: form._id,
      event,
      payload: { formId: form._id, status: args.status, slug: form.slug },
    });
    return null;
  },
});

/** Deep-copies a form, its steps and its fields into a new draft. */
export const duplicate = mutation({
  args: { formId: v.id("forms") },
  returns: v.id("forms"),
  handler: async (ctx, args) => {
    const { form, user } = await requireFormAccess(ctx, args.formId, "editor");
    const slug = await uniqueFormSlug(
      ctx,
      form.workspaceId,
      form.title + " copy",
    );
    const newFormId = await ctx.db.insert("forms", {
      workspaceId: form.workspaceId,
      title: form.title + " (copy)",
      description: form.description,
      slug,
      status: "draft",
      submissionCount: 0,
      viewCount: 0,
      settings: form.settings,
      createdBy: user._id,
    });

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", form._id))
      .take(50);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", form._id))
      .take(300);

    for (const step of steps) {
      const newStepId = await ctx.db.insert("steps", {
        formId: newFormId,
        order: step.order,
        title: step.title,
        description: step.description,
      });
      for (const field of fields.filter((f) => f.stepId === step._id)) {
        await ctx.db.insert("fields", {
          formId: newFormId,
          stepId: newStepId,
          order: field.order,
          type: field.type,
          key: field.key,
          label: field.label,
          placeholder: field.placeholder,
          helpText: field.helpText,
          defaultValue: field.defaultValue,
          required: field.required,
          width: field.width,
          options: field.options,
          validation: field.validation,
        });
      }
    }
    return newFormId;
  },
});

export const remove = mutation({
  args: { formId: v.id("forms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { form } = await requireFormAccess(ctx, args.formId, "admin");
    await dispatchEvent(ctx, {
      workspaceId: form.workspaceId,
      formId: form._id,
      event: "form.deleted",
      payload: { formId: form._id, title: form.title },
    });
    await ctx.db.delete("forms", args.formId);
    await ctx.scheduler.runAfter(0, internal.cleanup.purgeForm, {
      formId: args.formId,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const addStep = mutation({
  args: {
    formId: v.id("forms"),
    title: v.optional(v.string()),
  },
  returns: v.id("steps"),
  handler: async (ctx, args) => {
    await requireFormAccess(ctx, args.formId, "editor");
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", args.formId))
      .take(50);
    if (steps.length >= 20) throw new Error("A form can have up to 20 steps.");
    const order = steps.reduce((max, s) => Math.max(max, s.order), -1) + 1;
    return await ctx.db.insert("steps", {
      formId: args.formId,
      order,
      title: args.title?.trim() || "Step " + (steps.length + 1),
    });
  },
});

export const updateStep = mutation({
  args: {
    stepId: v.id("steps"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const step = await ctx.db.get("steps", args.stepId);
    if (!step) throw new Error("Step not found.");
    await requireFormAccess(ctx, step.formId, "editor");
    await ctx.db.patch("steps", args.stepId, {
      title: args.title?.trim() || step.title,
      description:
        args.description === undefined
          ? step.description
          : args.description.trim() || undefined,
    });
    return null;
  },
});

export const removeStep = mutation({
  args: { stepId: v.id("steps") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const step = await ctx.db.get("steps", args.stepId);
    if (!step) return null;
    await requireFormAccess(ctx, step.formId, "editor");

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", step.formId))
      .take(50);
    if (steps.length <= 1) throw new Error("A form needs at least one step.");

    const fields = await ctx.db
      .query("fields")
      .withIndex("by_step_and_order", (q) => q.eq("stepId", args.stepId))
      .take(300);
    for (const field of fields) await ctx.db.delete("fields", field._id);
    await ctx.db.delete("steps", args.stepId);

    // Close the gap left in the ordering.
    const remaining = steps
      .filter((s) => s._id !== args.stepId)
      .sort((a, b) => a.order - b.order);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await ctx.db.patch("steps", remaining[i]._id, { order: i });
      }
    }
    return null;
  },
});

export const reorderSteps = mutation({
  args: { formId: v.id("forms"), stepIds: v.array(v.id("steps")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireFormAccess(ctx, args.formId, "editor");
    for (let i = 0; i < args.stepIds.length; i++) {
      const step = await ctx.db.get("steps", args.stepIds[i]);
      if (!step || step.formId !== args.formId) continue;
      if (step.order !== i) await ctx.db.patch("steps", step._id, { order: i });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const addField = mutation({
  args: {
    stepId: v.id("steps"),
    type: fieldType,
    label: v.optional(v.string()),
  },
  returns: v.id("fields"),
  handler: async (ctx, args) => {
    const step = await ctx.db.get("steps", args.stepId);
    if (!step) throw new Error("Step not found.");
    await requireFormAccess(ctx, step.formId, "editor");

    const siblings = await ctx.db
      .query("fields")
      .withIndex("by_step_and_order", (q) => q.eq("stepId", args.stepId))
      .take(300);
    const order = siblings.reduce((max, f) => Math.max(max, f.order), -1) + 1;

    const label = args.label?.trim() || defaultLabel(args.type);
    const needsOptions =
      args.type === "select" ||
      args.type === "multiselect" ||
      args.type === "radio" ||
      args.type === "checkboxGroup";

    return await ctx.db.insert("fields", {
      formId: step.formId,
      stepId: args.stepId,
      order,
      type: args.type,
      key: await uniqueFieldKey(ctx, step.formId, label),
      label,
      required: false,
      width: "full",
      options: needsOptions
        ? [
            { label: "Option 1", value: "option-1" },
            { label: "Option 2", value: "option-2" },
          ]
        : [],
      validation: defaultValidation(args.type),
    });
  },
});

function defaultLabel(type: Doc<"fields">["type"]): string {
  const labels: Record<string, string> = {
    text: "Short answer",
    textarea: "Long answer",
    email: "Email address",
    phone: "Phone number",
    url: "Website",
    password: "Password",
    number: "Number",
    date: "Date",
    time: "Time",
    select: "Choose one",
    multiselect: "Choose several",
    radio: "Pick an option",
    checkboxGroup: "Select all that apply",
    checkbox: "I agree",
    switch: "Enable",
    slider: "How much?",
    rating: "How would you rate this?",
    otp: "Verification code",
    file: "Upload a file",
    hidden: "Hidden value",
    heading: "Section heading",
    paragraph: "Some explanatory text for the person filling this in.",
    divider: "Divider",
  };
  return labels[type] ?? "Field";
}

function defaultValidation(type: Doc<"fields">["type"]) {
  if (type === "slider") return { min: 0, max: 100, step: 1 };
  if (type === "rating") return { max: 5 };
  if (type === "otp") return { minLength: 6, maxLength: 6 };
  if (type === "file") return { maxFileSizeMb: 10 };
  return {};
}

export const updateField = mutation({
  args: {
    fieldId: v.id("fields"),
    label: v.optional(v.string()),
    key: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    defaultValue: v.optional(v.string()),
    required: v.optional(v.boolean()),
    width: v.optional(
      v.union(v.literal("full"), v.literal("half"), v.literal("third")),
    ),
    options: v.optional(v.array(fieldOption)),
    validation: v.optional(fieldValidation),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const field = await ctx.db.get("fields", args.fieldId);
    if (!field) throw new Error("Field not found.");
    await requireFormAccess(ctx, field.formId, "editor");

    const patch: Partial<Doc<"fields">> = {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.key !== undefined) {
      patch.key = await uniqueFieldKey(ctx, field.formId, args.key, field._id);
    }
    if (args.placeholder !== undefined) {
      patch.placeholder = args.placeholder.trim() || undefined;
    }
    if (args.helpText !== undefined) {
      patch.helpText = args.helpText.trim() || undefined;
    }
    if (args.defaultValue !== undefined) {
      patch.defaultValue = args.defaultValue || undefined;
    }
    if (args.required !== undefined) patch.required = args.required;
    if (args.width !== undefined) patch.width = args.width;
    if (args.options !== undefined) patch.options = args.options;
    if (args.validation !== undefined) patch.validation = args.validation;

    await ctx.db.patch("fields", args.fieldId, patch);
    return null;
  },
});

export const removeField = mutation({
  args: { fieldId: v.id("fields") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const field = await ctx.db.get("fields", args.fieldId);
    if (!field) return null;
    await requireFormAccess(ctx, field.formId, "editor");
    await ctx.db.delete("fields", args.fieldId);

    const remaining = await ctx.db
      .query("fields")
      .withIndex("by_step_and_order", (q) => q.eq("stepId", field.stepId))
      .take(300);
    const sorted = remaining.sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].order !== i) {
        await ctx.db.patch("fields", sorted[i]._id, { order: i });
      }
    }
    return null;
  },
});

/** Moves a field within its step, or across to another step. */
export const moveField = mutation({
  args: {
    fieldId: v.id("fields"),
    targetStepId: v.id("steps"),
    targetIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const field = await ctx.db.get("fields", args.fieldId);
    if (!field) throw new Error("Field not found.");
    await requireFormAccess(ctx, field.formId, "editor");
    const targetStep = await ctx.db.get("steps", args.targetStepId);
    if (!targetStep || targetStep.formId !== field.formId) {
      throw new Error("Target step is not part of this form.");
    }

    const sourceStepId = field.stepId;
    await ctx.db.patch("fields", field._id, {
      stepId: args.targetStepId,
      order: args.targetIndex - 0.5,
    });

    await renumber(ctx, args.targetStepId);
    if (sourceStepId !== args.targetStepId) await renumber(ctx, sourceStepId);
    return null;
  },
});

async function renumber(ctx: MutationCtx, stepId: Id<"steps">) {
  const fields = await ctx.db
    .query("fields")
    .withIndex("by_step_and_order", (q) => q.eq("stepId", stepId))
    .take(300);
  const sorted = fields.sort((a, b) => a.order - b.order);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].order !== i) {
      await ctx.db.patch("fields", sorted[i]._id, { order: i });
    }
  }
}
