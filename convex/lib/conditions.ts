/**
 * Visibility rules — the engine behind branching forms.
 *
 * A step or a field may carry one condition: show it only when another field's
 * answer matches. That is what turns "What are you submitting?" into a form
 * that reveals the product branch, the service branch, or neither.
 *
 * This module deliberately imports nothing — not even `Doc` — so the public
 * renderer can import it directly instead of keeping a second copy in sync. A
 * drifting copy would let the browser show a step the server then rejects.
 */

export type ConditionOperator = "anyOf" | "noneOf" | "isEmpty" | "isNotEmpty";

export type VisibilityCondition = {
  /** `key` of the field whose answer is tested. */
  fieldKey: string;
  operator: ConditionOperator;
  /** Compared against the answer; ignored by isEmpty / isNotEmpty. */
  values: string[];
};

/** Operators that compare against `values` rather than mere presence. */
export const VALUE_OPERATORS: ConditionOperator[] = ["anyOf", "noneOf"];

/** What a condition is evaluated against: the payload built so far. */
export type Answers = Record<string, string | undefined>;

/**
 * Multi-value fields arrive as a JSON array, single-value ones as a bare
 * string. Both collapse to a list so one comparison covers every field type:
 * a checkbox reads as `["true"]`, an unanswered field as `[]`.
 */
export function parseList(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    // fall through to the comma separated form
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Is this step or field shown, given the answers so far?
 *
 * `knownKeys`, when supplied, lists every field key on the form. A condition
 * naming a key that no longer exists counts as met — deleting the controlling
 * field stops the rule hiding things rather than making a branch unreachable.
 * Failing open matters: the other way round, one deletion could leave a form
 * with no route to its submit button.
 */
export function isConditionMet(
  condition: VisibilityCondition | null | undefined,
  answers: Answers,
  knownKeys?: Set<string>,
): boolean {
  if (!condition) return true;
  if (knownKeys && !knownKeys.has(condition.fieldKey)) return true;

  const answer = parseList(answers[condition.fieldKey]);

  switch (condition.operator) {
    case "isEmpty":
      return answer.length === 0;
    case "isNotEmpty":
      return answer.length > 0;
    case "anyOf":
      return answer.some((value) => condition.values.includes(value));
    case "noneOf":
      return !answer.some((value) => condition.values.includes(value));
    default:
      return true;
  }
}

// The structural shapes below are what both the stored documents and the
// serialised public schema satisfy, so one implementation serves both.

type StepLike = {
  _id: string;
  condition?: VisibilityCondition | null;
};

type FieldLike = {
  key: string;
  stepId: string;
  condition?: VisibilityCondition | null;
};

/**
 * The fields that are actually on screen for these answers: a field counts only
 * when its own condition is met *and* its step is showing. This is what the
 * submit path validates against, so a required field on a branch nobody took
 * can never block a submission.
 */
export function visibleFields<S extends StepLike, F extends FieldLike>(
  steps: S[],
  fields: F[],
  answers: Answers,
): F[] {
  const knownKeys = new Set(fields.map((field) => field.key));
  const openSteps = new Set(
    steps
      .filter((step) => isConditionMet(step.condition, answers, knownKeys))
      .map((step) => step._id),
  );

  return fields.filter(
    (field) =>
      openSteps.has(field.stepId) &&
      isConditionMet(field.condition, answers, knownKeys),
  );
}

/**
 * Describes a rule in words, for the builder and for MCP output. Kept here so
 * the UI and the agent-facing tools word a rule the same way.
 */
export function describeCondition(
  condition: VisibilityCondition | null | undefined,
  labelForKey?: (key: string) => string,
): string {
  if (!condition) return "Always shown";
  const name = labelForKey?.(condition.fieldKey) ?? condition.fieldKey;
  const list = condition.values.join(", ");
  switch (condition.operator) {
    case "isEmpty":
      return `Shown when ${name} is blank`;
    case "isNotEmpty":
      return `Shown when ${name} is answered`;
    case "anyOf":
      return `Shown when ${name} is ${list || "(nothing)"}`;
    case "noneOf":
      return `Shown when ${name} is not ${list || "(nothing)"}`;
    default:
      return "Always shown";
  }
}
