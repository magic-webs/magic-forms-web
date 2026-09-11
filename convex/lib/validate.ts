import { Doc } from "../_generated/dataModel";
import { parseList } from "./conditions";

// Re-exported so callers that validate and split values keep one import.
export { parseList };

/** Field types that only decorate the form and never carry a value. */
export const STATIC_TYPES = new Set(["heading", "paragraph", "divider"]);

/** Types whose value is a list, stored as a JSON array string. */
export const MULTI_TYPES = new Set(["multiselect", "checkboxGroup"]);

export type ValidationIssue = { key: string; message: string };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Checks a raw `key -> string` payload against a form's fields.
 *
 * The same rules run for the in-app renderer and the public HTTP API, so a
 * submission can never bypass validation by going around the UI.
 *
 * Pass only the fields that are actually on screen for this payload — see
 * `visibleFields` in `./conditions`. A required field on a branch the person
 * never took must not block their submission, and its value must not be
 * stored, which falls out of it never reaching `cleaned`.
 */
export function validateSubmission(
  fields: Doc<"fields">[],
  payload: Record<string, string>,
): { issues: ValidationIssue[]; cleaned: Record<string, string> } {
  const issues: ValidationIssue[] = [];
  const cleaned: Record<string, string> = {};

  for (const field of fields) {
    if (STATIC_TYPES.has(field.type)) continue;

    const raw = payload[field.key];
    const rules = field.validation;

    // --- presence
    if (field.required) {
      const missing =
        field.type === "checkbox" || field.type === "switch"
          ? raw !== "true"
          : MULTI_TYPES.has(field.type)
            ? parseList(raw).length === 0
            : isBlank(raw);
      if (missing) {
        issues.push({ key: field.key, message: field.label + " is required." });
        continue;
      }
    }
    if (isBlank(raw)) continue;

    const value = raw.trim();

    switch (field.type) {
      case "email":
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
          issues.push({ key: field.key, message: "Enter a valid email address." });
        }
        break;
      case "url":
        if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(value)) {
          issues.push({
            key: field.key,
            message: "Enter a full URL starting with http:// or https://",
          });
        }
        break;
      case "phone":
        if (!/^[+()\-\s\d.]{6,20}$/.test(value)) {
          issues.push({ key: field.key, message: "Enter a valid phone number." });
        }
        break;
      case "number":
      case "slider":
      case "rating": {
        const n = Number(value);
        if (Number.isNaN(n)) {
          issues.push({ key: field.key, message: field.label + " must be a number." });
          break;
        }
        if (rules.min !== undefined && n < rules.min) {
          issues.push({ key: field.key, message: "Must be " + rules.min + " or more." });
        }
        if (rules.max !== undefined && n > rules.max) {
          issues.push({ key: field.key, message: "Must be " + rules.max + " or less." });
        }
        break;
      }
      case "date":
        if (Number.isNaN(Date.parse(value))) {
          issues.push({ key: field.key, message: "Enter a valid date." });
        }
        break;
      case "otp": {
        const expected = rules.maxLength ?? 6;
        if (value.length !== expected) {
          issues.push({
            key: field.key,
            message: "Enter all " + expected + " digits.",
          });
        }
        break;
      }
      case "select":
      case "radio":
        if (
          field.options.length > 0 &&
          !field.options.some((o) => o.value === value)
        ) {
          issues.push({ key: field.key, message: "Choose one of the listed options." });
        }
        break;
      case "multiselect":
      case "checkboxGroup": {
        const chosen = parseList(raw);
        const allowed = new Set(field.options.map((o) => o.value));
        if (field.options.length > 0 && chosen.some((c) => !allowed.has(c))) {
          issues.push({ key: field.key, message: "Contains an unknown option." });
        }
        break;
      }
      default:
        break;
    }

    // --- length & pattern apply to every free-text type
    if (typeof rules.minLength === "number" && value.length < rules.minLength) {
      issues.push({
        key: field.key,
        message: "Use at least " + rules.minLength + " characters.",
      });
    }
    if (typeof rules.maxLength === "number" && value.length > rules.maxLength) {
      issues.push({
        key: field.key,
        message: "Use at most " + rules.maxLength + " characters.",
      });
    }
    if (rules.pattern) {
      try {
        if (!new RegExp(rules.pattern).test(value)) {
          issues.push({
            key: field.key,
            message: rules.patternMessage || "That value is not in the expected format.",
          });
        }
      } catch {
        // An invalid pattern configured by the form author must not block a submission.
      }
    }

    cleaned[field.key] = MULTI_TYPES.has(field.type)
      ? JSON.stringify(parseList(raw))
      : value;
  }

  return { issues, cleaned };
}

/** The shape the public API and the renderer both consume. */
export function serialiseField(field: Doc<"fields">) {
  return {
    id: field._id,
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
  };
}
