/**
 * Form building and response tools.
 *
 * `build_form` is the one an agent should reach for first: it turns a whole
 * form — steps, fields, options, validation, settings — into a published URL in
 * a single call. The granular tools below it are for editing what already
 * exists, and all of them need at least the workspace `editor` role.
 */
import { api } from "../api.mjs";
import {
  CONDITION_OPERATORS,
  FIELD_TYPES,
  FORM_STATUSES,
  arrayOf,
  boolean,
  number,
  object,
  oneOf,
  string,
} from "../schema.mjs";

const WIDTHS = ["full", "half", "third"];

const conditionSpec = object(
  {
    fieldKey: string(
      "Key of an EARLIER field whose answer decides this. It must already " +
        "exist on the form when the rule is saved.",
    ),
    operator: oneOf(
      CONDITION_OPERATORS,
      "anyOf / noneOf compare the answer against values; isEmpty / isNotEmpty " +
        "only test whether it was answered.",
    ),
    values: arrayOf(
      string("A stored option value, not its label."),
      "Values to compare against. Required by anyOf and noneOf.",
    ),
  },
  ["fieldKey", "operator", "values"],
);

const validationSpec = object({
  min: number("Smallest accepted number, or slider minimum."),
  max: number("Largest accepted number, slider maximum, or rating out of."),
  step: number("Slider increment."),
  minLength: number("Minimum characters."),
  maxLength: number("Maximum characters."),
  pattern: string("Regular expression the answer must match."),
  patternMessage: string("Message shown when the pattern does not match."),
  maxFileSizeMb: number("Upload size ceiling, in MB."),
  acceptedFileTypes: string("Accepted uploads, as a file input accept list."),
});

const optionSpec = object(
  { label: string("What the person sees."), value: string("What is stored.") },
  ["label", "value"],
);

const fieldSpec = object(
  {
    type: oneOf(FIELD_TYPES, "Field type."),
    label: string("Question or label. Defaults to a sensible one per type."),
    key: string(
      "Key this answer is stored and returned under. Derived from the label " +
        "when omitted.",
    ),
    placeholder: string("Placeholder text."),
    helpText: string("Hint shown under the field."),
    defaultValue: string("Pre-filled value."),
    required: boolean("Whether an answer is required. Defaults to false."),
    width: oneOf(WIDTHS, "Column width on desktop. Defaults to full."),
    options: arrayOf(
      optionSpec,
      "Choices for select, multiselect, radio and checkboxGroup.",
    ),
    validation: validationSpec,
    condition: conditionSpec,
  },
  ["type"],
);

const stepSpec = object(
  {
    title: string("Step heading."),
    description: string("Step subheading."),
    fields: arrayOf(fieldSpec, "Fields on this step, in order."),
    condition: conditionSpec,
  },
  ["fields"],
);

const settingsSpec = object({
  submitLabel: string("Text on the submit button."),
  successTitle: string("Heading shown after submitting."),
  successMessage: string("Message shown after submitting."),
  redirectUrl: string("Send people here after submitting instead."),
  showProgressBar: boolean("Show step progress on multi-step forms."),
  allowMultipleSubmissions: boolean("Let one person submit more than once."),
  closedMessage: string("Shown when the form status is closed."),
  accentColor: string("Accent colour, as a hex value."),
});

/** Applies the parts of a field spec that `addField` does not take. */
async function applyFieldDetails(session, fieldId, spec) {
  const patch = { fieldId };
  for (const key of [
    "key",
    "placeholder",
    "helpText",
    "defaultValue",
    "required",
    "width",
    "options",
    "validation",
    "condition",
  ]) {
    if (spec[key] !== undefined) patch[key] = spec[key];
  }
  if (Object.keys(patch).length === 1) return;
  await session.mutation(api.forms.updateField, patch);
}

/** One form, flattened into the shape an agent can act on without a second call. */
async function describeForm(session, formId) {
  const loaded = await session.query(api.forms.getWithSchema, { formId });
  return {
    formId: loaded.form._id,
    title: loaded.form.title,
    slug: loaded.form.slug,
    status: loaded.form.status,
    submissionCount: loaded.form.submissionCount,
    viewCount: loaded.form.viewCount,
    settings: loaded.form.settings,
    workspace: loaded.workspace,
    links: session.links(loaded.workspace.slug, loaded.form.slug),
    steps: loaded.steps.map((step) => ({
      stepId: step._id,
      title: step.title,
      description: step.description ?? null,
      condition: step.condition ?? null,
      fields: step.fields.map((field) => ({
        fieldId: field._id,
        key: field.key,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder ?? null,
        helpText: field.helpText ?? null,
        defaultValue: field.defaultValue ?? null,
        required: field.required,
        width: field.width,
        options: field.options,
        validation: field.validation,
        condition: field.condition ?? null,
      })),
    })),
  };
}

export const formTools = [
  {
    name: "build_form",
    scope: "company",
    description:
      "Creates a complete form in one call — steps, fields, options, " +
      "validation, branching and settings — and optionally publishes it. This " +
      "is the fastest way to turn a description of a form into a working " +
      "public URL. Use add_field or update_field afterwards to adjust it.\n\n" +
      "Branching: give a step or a field a `condition` and it is shown only " +
      "when an earlier answer matches. To ask for a type and then that type's " +
      "questions, make step 1 a select/radio field (key 'type', options " +
      "product/service/other), then give step 2 the condition " +
      "{fieldKey:'type', operator:'anyOf', values:['product']}, step 3 the " +
      "same for 'service', and so on. Steps nobody reaches are skipped, and " +
      "their fields are neither required nor stored.",
    input: object(
      {
        workspaceId: string("Workspace the form belongs to."),
        title: string("Form title."),
        description: string("Shown under the title."),
        steps: arrayOf(
          stepSpec,
          "One entry per step. A single step gives a plain one-page form.",
        ),
        settings: settingsSpec,
        publish: boolean(
          "Publish immediately. Defaults to false, which leaves it a draft.",
        ),
      },
      ["workspaceId", "title", "steps"],
    ),
    run: async (session, args) => {
      if (args.steps.length === 0) {
        throw new Error("A form needs at least one step.");
      }

      const formId = await session.mutation(api.forms.create, {
        workspaceId: args.workspaceId,
        title: args.title,
        description: args.description,
      });

      // Every new form already has one empty step — reuse it for the first.
      const created = await session.query(api.forms.getWithSchema, { formId });
      const firstStepId = created.steps[0]?._id;

      // Steps are built in order, and each step's fields before the next step
      // begins — which is exactly what a rule needs, since it may only name a
      // field that already exists.
      for (const [index, step] of args.steps.entries()) {
        let stepId;
        if (index === 0 && firstStepId) {
          stepId = firstStepId;
          if (
            step.title !== undefined ||
            step.description !== undefined ||
            step.condition !== undefined
          ) {
            await session.mutation(api.forms.updateStep, {
              stepId,
              title: step.title,
              description: step.description,
              condition: step.condition,
            });
          }
        } else {
          stepId = await session.mutation(api.forms.addStep, {
            formId,
            title: step.title,
            condition: step.condition,
          });
          if (step.description !== undefined) {
            await session.mutation(api.forms.updateStep, {
              stepId,
              description: step.description,
            });
          }
        }

        for (const field of step.fields) {
          const fieldId = await session.mutation(api.forms.addField, {
            stepId,
            type: field.type,
            label: field.label,
          });
          await applyFieldDetails(session, fieldId, field);
        }
      }

      if (args.settings) {
        // `update` replaces the settings object wholesale, so merge onto what
        // the form was created with rather than dropping the defaults.
        await session.mutation(api.forms.update, {
          formId,
          settings: { ...created.form.settings, ...args.settings },
        });
      }

      if (args.publish) {
        await session.mutation(api.forms.setStatus, {
          formId,
          status: "published",
        });
      }

      return await describeForm(session, formId);
    },
  },

  {
    name: "list_forms",
    scope: "company",
    description:
      "Every form in a workspace with its status, step and field counts, and " +
      "its submission and view totals.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: (session, args) =>
      session.query(api.forms.listByWorkspace, {
        workspaceId: args.workspaceId,
      }),
  },

  {
    name: "get_form",
    scope: "company",
    description:
      "The whole definition of one form: settings, ordered steps, every field " +
      "with its key and validation, and its public and API URLs.",
    input: object({ formId: string("Form id.") }, ["formId"]),
    run: (session, args) => describeForm(session, args.formId),
  },

  {
    name: "create_form",
    scope: "company",
    description:
      "Creates an empty draft form with one step. Prefer build_form unless you " +
      "mean to add the fields one at a time.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        title: string("Form title."),
        description: string("Shown under the title."),
      },
      ["workspaceId", "title"],
    ),
    run: async (session, args) => {
      const formId = await session.mutation(api.forms.create, args);
      return await describeForm(session, formId);
    },
  },

  {
    name: "update_form",
    scope: "company",
    description:
      "Changes a form title, description, slug or settings. Settings given " +
      "here are merged onto the current ones. Changing the slug breaks links " +
      "already shared.",
    input: object(
      {
        formId: string("Form id."),
        title: string("New title."),
        description: string("New description."),
        slug: string("New URL slug."),
        settings: settingsSpec,
      },
      ["formId"],
    ),
    run: async (session, args) => {
      const patch = { formId: args.formId };
      if (args.title !== undefined) patch.title = args.title;
      if (args.description !== undefined) patch.description = args.description;
      if (args.slug !== undefined) patch.slug = args.slug;
      if (args.settings) {
        const current = await session.query(api.forms.getWithSchema, {
          formId: args.formId,
        });
        patch.settings = { ...current.form.settings, ...args.settings };
      }
      await session.mutation(api.forms.update, patch);
      return await describeForm(session, args.formId);
    },
  },

  {
    name: "set_form_status",
    scope: "company",
    description:
      "Publishes a form, returns it to draft, or closes it. Only a published " +
      "form accepts submissions; a closed one shows its closed message.",
    input: object(
      {
        formId: string("Form id."),
        status: oneOf(FORM_STATUSES, "The status to move the form to."),
      },
      ["formId", "status"],
    ),
    run: async (session, args) => {
      await session.mutation(api.forms.setStatus, args);
      return await describeForm(session, args.formId);
    },
  },

  {
    name: "duplicate_form",
    scope: "company",
    description:
      "Copies a form — steps, fields and settings — as a new draft. Responses " +
      "are not copied.",
    input: object({ formId: string("Form id to copy.") }, ["formId"]),
    run: async (session, args) => {
      const formId = await session.mutation(api.forms.duplicate, args);
      return await describeForm(session, formId);
    },
  },

  {
    name: "delete_form",
    scope: "company",
    description:
      "Deletes a form and every response to it, permanently. Ask the person " +
      "you are working for before calling this.",
    input: object({ formId: string("Form id.") }, ["formId"]),
    run: async (session, args) => {
      await session.mutation(api.forms.remove, args);
      return { ok: true };
    },
  },

  // --- steps and fields ------------------------------------------------------

  {
    name: "add_step",
    scope: "company",
    description:
      "Appends a step to a form, making it a multi-step form. Pass a " +
      "`condition` to show the step only when an earlier answer matches — the " +
      "way a 'product' branch is told apart from a 'service' one.",
    input: object(
      {
        formId: string("Form id."),
        title: string("Step heading."),
        condition: conditionSpec,
      },
      ["formId"],
    ),
    run: async (session, args) => {
      const stepId = await session.mutation(api.forms.addStep, args);
      return { stepId };
    },
  },

  {
    name: "update_step",
    scope: "company",
    description:
      "Changes a step's heading, description, or the rule that decides " +
      "whether it is shown. Only what you pass is touched; pass condition " +
      "null to make the step unconditional again.",
    input: object(
      {
        stepId: string("Step id, from get_form."),
        title: string("New heading."),
        description: string("New subheading."),
        condition: conditionSpec,
      },
      ["stepId"],
    ),
    run: async (session, args) => {
      // `null` has to survive to Convex to clear the rule, so it is passed
      // through rather than stripped with the undefined properties.
      await session.mutation(api.forms.updateStep, args);
      return { ok: true };
    },
  },

  {
    name: "add_field",
    scope: "company",
    description:
      "Appends one field to a step. Everything beyond the type is optional and " +
      "sensible defaults are filled in — choice fields even get two starter " +
      "options.",
    input: object(
      {
        stepId: string("Step id, from get_form."),
        type: oneOf(FIELD_TYPES, "Field type."),
        label: string("Question or label."),
        key: string("Key the answer is stored under."),
        placeholder: string("Placeholder text."),
        helpText: string("Hint shown under the field."),
        defaultValue: string("Pre-filled value."),
        required: boolean("Whether an answer is required."),
        width: oneOf(WIDTHS, "Column width on desktop."),
        options: arrayOf(optionSpec, "Choices for a choice field."),
        validation: validationSpec,
        condition: conditionSpec,
      },
      ["stepId", "type"],
    ),
    run: async (session, args) => {
      const fieldId = await session.mutation(api.forms.addField, {
        stepId: args.stepId,
        type: args.type,
        label: args.label,
      });
      await applyFieldDetails(session, fieldId, args);
      return { fieldId };
    },
  },

  {
    name: "update_field",
    scope: "company",
    description:
      "Changes one field. Only the properties you pass are touched. Changing " +
      "the key changes what already-stored responses line up with, and orphans " +
      "any rule that names the old key. Pass condition null to make the field " +
      "unconditional again.",
    input: object(
      {
        fieldId: string("Field id, from get_form."),
        label: string("New label."),
        key: string("New storage key."),
        placeholder: string("Placeholder text."),
        helpText: string("Hint shown under the field."),
        defaultValue: string("Pre-filled value."),
        required: boolean("Whether an answer is required."),
        width: oneOf(WIDTHS, "Column width on desktop."),
        options: arrayOf(optionSpec, "Replacement list of choices."),
        validation: validationSpec,
        condition: conditionSpec,
      },
      ["fieldId"],
    ),
    run: async (session, args) => {
      await session.mutation(api.forms.updateField, args);
      return { ok: true };
    },
  },

  {
    name: "remove_field",
    scope: "company",
    description: "Deletes a field from a form.",
    input: object({ fieldId: string("Field id.") }, ["fieldId"]),
    run: async (session, args) => {
      await session.mutation(api.forms.removeField, args);
      return { ok: true };
    },
  },

  // --- responses -------------------------------------------------------------

  {
    name: "list_responses",
    scope: "company",
    description:
      "Responses to one form, newest first, keyed by field key. Pass the " +
      "cursor from a previous call to page through more.",
    input: object(
      {
        formId: string("Form id."),
        limit: number("How many to return, 1-200. Defaults to 25."),
        cursor: string("Continuation cursor from a previous call."),
      },
      ["formId"],
    ),
    run: async (session, args) => {
      const numItems = Math.min(Math.max(args.limit ?? 25, 1), 200);
      const [columns, page] = await Promise.all([
        session.query(api.submissions.columnsForForm, { formId: args.formId }),
        session.query(api.submissions.listByForm, {
          formId: args.formId,
          paginationOpts: { numItems, cursor: args.cursor ?? null },
        }),
      ]);
      return {
        columns,
        count: page.page.length,
        responses: page.page,
        isDone: page.isDone,
        cursor: page.isDone ? null : page.continueCursor,
      };
    },
  },

  {
    name: "export_responses_csv",
    scope: "company",
    description:
      "Every response to a form as CSV, with one column per field. Capped at " +
      "5000 rows; `truncated` says whether it hit the cap.",
    input: object({ formId: string("Form id.") }, ["formId"]),
    run: (session, args) => session.query(api.submissions.exportCsv, args),
  },
];
