import { Doc } from "../_generated/dataModel";
import { MULTI_TYPES, STATIC_TYPES } from "./validate";

/**
 * Prefilled form links: `/f/{workspace}/{form}?full_name=Asha+Menon`.
 *
 * The values ride in plain query parameters, so a link is readable, can be
 * built by hand, and works on a group link just as well as a form link. They
 * are a starting point, not a claim: whoever opens the link can edit them, and
 * the submission is validated on arrival exactly as if it had been typed.
 */

/** A file is bytes, not a string, so it can never arrive in a URL. */
export function isPrefillable(type: Doc<"fields">["type"]): boolean {
  return !STATIC_TYPES.has(type) && type !== "file";
}

/**
 * The query parameter that carries a `formLinks` token. It is the link's, not
 * the form's: a field that happens to share the key is never filled from it,
 * so the token cannot end up on screen or in an answer.
 */
export const LINK_PARAM = "mf_link";

function isPrefillableField(field: { key: string; type: string }): boolean {
  return (
    isPrefillable(field.type as Doc<"fields">["type"]) &&
    field.key !== LINK_PARAM
  );
}

/**
 * What a caller may pass to an API-built link: an opaque id of its own, echoed
 * back on the submission. Kept to URL- and log-safe characters so it can be
 * stored and returned verbatim without escaping anywhere.
 */
export function isValidExternalRef(ref: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(ref);
}

/**
 * The WhatsApp number a caller says the person is chatting from, tidied to
 * `+` and digits: `+91 98765-43210` and `919876543210` both become
 * `+919876543210`. Null when it cannot be a phone number at all.
 *
 * Like the ref, it rides on the link rather than in the form, so it is
 * recorded with every submission through that link whether or not the form
 * has a phone field — and the person can neither see nor change it.
 */
export function normaliseWhatsApp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[0-9][0-9\s().-]{6,24}$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return "+" + digits;
}

export type PrefillField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  /** Send this one as a JSON array to pick several. */
  multiple: boolean;
  /** Present for choice fields: the only values the form will accept. */
  options?: { label: string; value: string }[];
};

export function serialisePrefillField(field: Doc<"fields">): PrefillField {
  const multiple = MULTI_TYPES.has(field.type);
  const hasOptions = field.options.length > 0;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    multiple,
    ...(hasOptions ? { options: field.options } : {}),
  };
}

/**
 * Every field a link may fill in, in the order the form asks for them — step
 * order first, then field order. The one list behind every endpoint that names
 * prefill keys, so no two of them can disagree about what a link accepts.
 */
export function prefillableFields(
  steps: Doc<"steps">[],
  fields: Doc<"fields">[],
): PrefillField[] {
  const stepOrder = new Map(steps.map((step) => [step._id, step.order]));
  return fields
    .filter(isPrefillableField)
    .sort((a, b) => {
      const sa = stepOrder.get(a.stepId) ?? 0;
      const sb = stepOrder.get(b.stepId) ?? 0;
      return sa === sb ? a.order - b.order : sa - sb;
    })
    .map(serialisePrefillField);
}

export type PrefillIssue = { key: string; message: string };

/**
 * Turns `{ full_name: "Asha", teams: ["eng"] }` into query parameters the
 * renderer understands, rejecting anything the form cannot accept.
 *
 * A typo'd key is an error rather than a silent no-op: a link that quietly
 * drops half its values is the kind of thing nobody notices until a customer
 * is staring at an empty form.
 */
export function buildPrefillParams(
  fields: PrefillField[],
  data: Record<string, unknown>,
): { params: [string, string][]; issues: PrefillIssue[] } {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const params: [string, string][] = [];
  const issues: PrefillIssue[] = [];

  for (const [key, value] of Object.entries(data)) {
    const field = byKey.get(key);
    if (!field) {
      issues.push({
        key,
        message:
          "No prefillable field has the key '" +
          key +
          "'. Available keys: " +
          (fields.map((f) => f.key).join(", ") || "(none)") +
          ".",
      });
      continue;
    }
    if (value === null || value === undefined) continue;

    const values = Array.isArray(value) ? value : [value];
    if (values.length > 1 && !field.multiple) {
      issues.push({
        key,
        message: "'" + key + "' takes a single value, not a list.",
      });
      continue;
    }

    for (const item of values) {
      if (
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      ) {
        issues.push({
          key,
          message: "'" + key + "' must be a string, number, boolean or array of those.",
        });
        break;
      }
      const text = String(item);
      // A choice field is checked here rather than at submit time, so a bad
      // link fails where it is built instead of in front of a customer.
      if (field.options && !field.options.some((o) => o.value === text)) {
        issues.push({
          key,
          message:
            "'" +
            text +
            "' is not an option for '" +
            key +
            "'. Allowed: " +
            field.options.map((o) => o.value).join(", ") +
            ".",
        });
        continue;
      }
      params.push([key, text]);
    }
  }

  return { params, issues };
}

/** `?a=1&b=2`, or an empty string when there is nothing to carry. */
export function toQueryString(params: [string, string][]): string {
  if (params.length === 0) return "";
  const search = new URLSearchParams();
  for (const [key, value] of params) search.append(key, value);
  return "?" + search.toString();
}

/**
 * Reads prefilled values back out of a URL, in the shape the renderer holds
 * state in: list fields as a JSON array string, everything else as itself.
 *
 * Unknown parameters are ignored — links pick up `utm_source` and friends on
 * the way, and none of that is the form's business. So is `mf_link`, which is
 * read separately by `readLinkToken`.
 */
export function readPrefillFromSearch(
  search: string,
  fields: { key: string; type: string }[],
): Record<string, string> {
  const params = new URLSearchParams(search);
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (!isPrefillableField(field)) continue;
    const found = params.getAll(field.key);
    if (found.length === 0) continue;
    values[field.key] = MULTI_TYPES.has(field.type)
      ? JSON.stringify(found)
      : found[found.length - 1];
  }
  return values;
}

/** The `mf_link` token on a URL, if any. Resolved — or ignored — on submit. */
export function readLinkToken(search: string): string | undefined {
  const token = new URLSearchParams(search).get(LINK_PARAM)?.trim();
  return token ? token : undefined;
}
