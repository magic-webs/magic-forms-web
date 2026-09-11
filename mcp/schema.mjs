/**
 * JSON Schema builders for the tool contracts.
 *
 * The MCP SDK also accepts Zod shapes, but the copy of Zod that resolves here
 * is not the one the SDK bundles — plain JSON Schema sidesteps that entirely
 * and is what the client sees on the wire anyway.
 */
export const string = (description) => ({ type: "string", description });
export const number = (description) => ({ type: "number", description });
export const boolean = (description) => ({ type: "boolean", description });

export const oneOf = (values, description) => ({
  type: "string",
  enum: values,
  description,
});

export const arrayOf = (items, description) => ({
  type: "array",
  items,
  description,
});

export function object(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

/** Nothing to pass. */
export const noArgs = object({});

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"];

export const FORM_STATUSES = ["draft", "published", "closed"];

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "url",
  "password",
  "number",
  "date",
  "time",
  "select",
  "multiselect",
  "radio",
  "checkboxGroup",
  "checkbox",
  "switch",
  "slider",
  "rating",
  "otp",
  "file",
  "hidden",
  "heading",
  "paragraph",
  "divider",
];

export const WEBHOOK_EVENTS = [
  "form.created",
  "form.updated",
  "form.published",
  "form.unpublished",
  "form.deleted",
  "form.viewed",
  "form.step_completed",
  "submission.created",
  "submission.updated",
  "submission.deleted",
];
