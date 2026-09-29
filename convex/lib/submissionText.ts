import { Doc } from "../_generated/dataModel";
import { MULTI_TYPES, STATIC_TYPES, parseList } from "./validate";

/**
 * Turns a submission into one message a human can read in a chat window.
 *
 * WhatsApp's own markup is what the formatting targets — `*bold*` for labels,
 * `_italic_` for the footer — because that is where these messages are going.
 * It degrades to plain text everywhere else, so the same string is safe to put
 * in an email body, a Slack message or a webhook payload.
 */

/**
 * Origin the magic link is built from, e.g. `https://forms.example.com`.
 *
 * Deliberately read from the deployment's own environment rather than from
 * anything the submitter sent: the link ends up in a message an admin will
 * tap, so its host must not be attacker-controlled. Set it with
 * `npx convex env set APP_URL https://your-app.example.com`.
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_URL?.trim();
  const raw = configured || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function submissionViewUrl(token: string): string {
  return appBaseUrl() + "/s/" + token;
}

/** `true`/`false` read as a checkbox, not as a word. */
function readBoolean(raw: string): string {
  return raw === "true" ? "Yes" : "No";
}

function readableValue(
  field: Doc<"fields">,
  raw: string | undefined,
  files: { key: string; name: string; size: number }[],
  fileSizes: boolean,
): string | null {
  if (field.type === "file") {
    const mine = files.filter((file) => file.key === field.key);
    if (mine.length === 0) return null;
    return mine
      .map((file) =>
        fileSizes
          ? file.name + " (" + Math.round(file.size / 1024) + " KB)"
          : file.name,
      )
      .join(", ");
  }

  if (field.type === "checkbox" || field.type === "switch") {
    // A false checkbox is an answer, not a blank, so it is always reported.
    return readBoolean(raw ?? "false");
  }

  if (raw === undefined || raw.trim() === "") return null;

  if (MULTI_TYPES.has(field.type)) {
    const chosen = parseList(raw);
    if (chosen.length === 0) return null;
    // Show the option labels the person clicked, not the stored values.
    return chosen
      .map(
        (value) =>
          field.options.find((option) => option.value === value)?.label ?? value,
      )
      .join(", ");
  }

  if (field.type === "select" || field.type === "radio") {
    return (
      field.options.find((option) => option.value === raw.trim())?.label ??
      raw.trim()
    );
  }

  return raw.trim();
}

/** Ordered, answerable fields — step order first, then field order. */
export function orderedFields(
  steps: Doc<"steps">[],
  fields: Doc<"fields">[],
): Doc<"fields">[] {
  const stepOrder = new Map(steps.map((step) => [step._id, step.order]));
  return fields
    .filter((field) => !STATIC_TYPES.has(field.type))
    .sort((a, b) => {
      const sa = stepOrder.get(a.stepId) ?? 0;
      const sb = stepOrder.get(b.stepId) ?? 0;
      return sa === sb ? a.order - b.order : sa - sb;
    });
}

export type SubmissionLine = {
  key: string;
  label: string;
  type: Doc<"fields">["type"];
  value: string;
};

/**
 * One row per answered field, in the form's own order, with the value as a
 * person reads it. The message is built from these, and `submission.created`
 * carries them as `answers`, so the two can never word an answer differently.
 */
export function submissionLines(args: {
  steps: Doc<"steps">[];
  fields: Doc<"fields">[];
  data: Record<string, string>;
  files: { key: string; name: string; size: number }[];
  /** `false` names files without their size — for a machine, not a reader. */
  fileSizes?: boolean;
}): SubmissionLine[] {
  const rows: SubmissionLine[] = [];
  for (const field of orderedFields(args.steps, args.fields)) {
    const value = readableValue(
      field,
      args.data[field.key],
      args.files,
      args.fileSizes ?? true,
    );
    // Unanswered fields are left out: branches nobody took would otherwise
    // pad the message with rows of dashes.
    if (value === null) continue;
    rows.push({ key: field.key, label: field.label, type: field.type, value });
  }
  return rows;
}

export function buildSubmissionText(args: {
  formTitle: string;
  steps: Doc<"steps">[];
  fields: Doc<"fields">[];
  data: Record<string, string>;
  files: { key: string; name: string; size: number }[];
  /** Appended as "View full response" when present. */
  viewUrl?: string;
  submittedAt: number;
}): string {
  const rows = submissionLines(args);

  const body =
    rows.length > 0
      ? rows
          .map(({ label, value }) =>
            // A long answer reads far better under its label than beside it.
            value.includes("\n") || value.length > 60
              ? "*" + label + ":*\n" + value
              : "*" + label + ":* " + value,
          )
          .join("\n")
      : "_No answers were recorded._";

  const stamp = new Date(args.submittedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const parts = ["*New response: " + args.formTitle + "*", "", body];
  if (args.viewUrl) parts.push("", "View full response:", args.viewUrl);
  parts.push("", "_Magic Forms · " + stamp + "_");
  return parts.join("\n");
}
