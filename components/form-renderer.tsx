"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
// Imported, not mirrored: if the browser and the server disagreed about which
// steps are showing, the form would offer a branch the submit path then throws
// out. `lib/conditions` is dependency-free precisely so this import is safe.
import {
  isConditionMet,
  VisibilityCondition,
} from "@/convex/lib/conditions";
import { cn } from "@/lib/utils";
import {
  FieldControl,
  FieldDef,
  LIST_FIELD_TYPES,
  STATIC_FIELD_TYPES,
  WIDTH_CLASS,
} from "@/components/field-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

export type StepDef = {
  id: string;
  title: string;
  description: string | null;
  /** Null means the step is always shown. */
  condition?: VisibilityCondition | null;
  fields: FieldDef[];
};

export type FormSchema = {
  workspace: { name: string; slug: string };
  form: {
    id: string;
    title: string;
    description: string | null;
    slug: string;
    status: string;
    settings: {
      submitLabel: string;
      successTitle: string;
      successMessage: string;
      redirectUrl?: string;
      showProgressBar: boolean;
      allowMultipleSubmissions: boolean;
      closedMessage?: string;
      accentColor?: string;
    };
  };
  steps: StepDef[];
};

/** Mirrors `convex/lib/validate.ts` so a step can be checked before advancing. */
function validateField(field: FieldDef, raw: string): string | undefined {
  if (STATIC_FIELD_TYPES.includes(field.type) || field.type === "hidden") {
    return undefined;
  }
  const rules = field.validation;
  const isList = LIST_FIELD_TYPES.includes(field.type);
  const listValues = isList ? safeList(raw) : [];

  if (field.required) {
    const missing =
      field.type === "checkbox" || field.type === "switch"
        ? raw !== "true"
        : isList
          ? listValues.length === 0
          : raw.trim() === "";
    if (missing) return field.label + " is required.";
  }
  if (raw.trim() === "") return undefined;

  const value = raw.trim();

  if (field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return "Enter a valid email address.";
  }
  if (field.type === "url" && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(value)) {
    return "Enter a full URL starting with http:// or https://";
  }
  if (field.type === "phone" && !/^[+()\-\s\d.]{6,20}$/.test(value)) {
    return "Enter a valid phone number.";
  }
  if (["number", "slider", "rating"].includes(field.type)) {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return field.label + " must be a number.";
    if (rules.min !== undefined && parsed < rules.min) {
      return "Must be " + rules.min + " or more.";
    }
    if (rules.max !== undefined && parsed > rules.max) {
      return "Must be " + rules.max + " or less.";
    }
  }
  if (field.type === "date" && Number.isNaN(Date.parse(value))) {
    return "Enter a valid date.";
  }
  if (field.type === "otp") {
    const expected = rules.maxLength ?? 6;
    if (value.length !== expected) return "Enter all " + expected + " digits.";
  }
  if (rules.minLength !== undefined && value.length < rules.minLength) {
    return "Use at least " + rules.minLength + " characters.";
  }
  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    return "Use at most " + rules.maxLength + " characters.";
  }
  if (rules.pattern) {
    try {
      if (!new RegExp(rules.pattern).test(value)) {
        return rules.patternMessage || "That value is not in the expected format.";
      }
    } catch {
      // An invalid author-supplied pattern must not block the submission.
    }
  }
  return undefined;
}

function safeList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function initialValues(steps: StepDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const step of steps) {
    for (const field of step.fields) {
      if (STATIC_FIELD_TYPES.includes(field.type)) continue;
      values[field.key] = LIST_FIELD_TYPES.includes(field.type)
        ? (field.defaultValue ?? "[]")
        : (field.defaultValue ?? "");
    }
  }
  return values;
}

type Props = {
  schema: FormSchema;
  /** Preview mode renders the form but never writes a submission. */
  preview?: boolean;
  /**
   * Fills the page instead of sitting in a card: the progress bar sticks to the
   * top, the fields stretch over the full height, and the step buttons stay
   * pinned to the bottom of the viewport. Used on the public form page.
   */
  fullScreen?: boolean;
  /** Sits at the foot of the scrolling area in `fullScreen`, above the buttons. */
  brand?: React.ReactNode;
};

export function FormRenderer({
  schema,
  preview = false,
  fullScreen = false,
  brand,
}: Props) {
  const submit = useMutation(api.publicForms.submit);
  const generateUploadUrl = useMutation(api.publicForms.generateUploadUrl);
  const recordStep = useMutation(api.publicForms.recordStepCompleted);

  // Which step is in view is tracked by id, not by position: branching changes
  // the positions underneath as answers come in, and an index would silently
  // start pointing at a different step.
  const [stepId, setStepId] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    initialValues(schema.steps),
  );
  const [files, setFiles] = React.useState<Record<string, File>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ title: string; message: string } | null>(
    null,
  );

  const knownKeys = React.useMemo(
    () => new Set(schema.steps.flatMap((s) => s.fields.map((f) => f.key))),
    [schema.steps],
  );

  /**
   * The form as it stands for these answers. Recomputed on every keystroke, so
   * choosing "product" reveals the product step while the choice is still on
   * screen, and the button flips between Continue and Submit to match.
   *
   * A step drops out when its own rule fails, and also when every field on it
   * is hidden — an author who branches field by field rather than step by step
   * should not leave people on a screen with nothing to answer.
   */
  const steps = React.useMemo(() => {
    const open = schema.steps
      .filter((step) => isConditionMet(step.condition, values, knownKeys))
      .map((step) => ({
        ...step,
        fields: step.fields.filter((field) =>
          isConditionMet(field.condition, values, knownKeys),
        ),
      }))
      .filter((step) => step.fields.length > 0);

    // Never leave nothing to fill in: a form whose every step is conditional
    // has to start somewhere, so the first step stands in.
    return open.length > 0 ? open : schema.steps.slice(0, 1);
  }, [schema.steps, values, knownKeys]);

  const stepIndex = Math.max(
    0,
    steps.findIndex((candidate) => candidate.id === stepId),
  );
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const multiStep = steps.length > 1;

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** Validates only the step in view, so people are not shown distant errors. */
  function validateCurrentStep(): boolean {
    const found: Record<string, string> = {};
    for (const field of step?.fields ?? []) {
      const message = validateField(field, values[field.key] ?? "");
      if (message) found[field.key] = message;
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function onNext() {
    if (!validateCurrentStep()) return;
    if (!preview) {
      // Fire-and-forget: a webhook failure must not block the person filling in.
      recordStep({
        workspaceSlug: schema.workspace.slug,
        formSlug: schema.form.slug,
        // Reported against the form's own step order, not the branch the person
        // happens to be on, so the event means the same thing for everyone.
        stepIndex: schema.steps.findIndex((s) => s.id === step.id),
      }).catch(() => {});
    }
    const next = steps[Math.min(stepIndex + 1, steps.length - 1)];
    if (next) setStepId(next.id);
  }

  /**
   * The only way the form is submitted, whether by the primary button or by
   * pressing Enter in a field. Routing here — rather than swapping the button
   * between `type="button"` and `type="submit"` — is what stops the click that
   * lands on the last step from also submitting it: a button whose `type`
   * changes mid-click still runs the browser's submit default action.
   */
  async function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (isLast) await onSubmit();
    else await onNext();
  }

  async function onSubmit() {
    if (!validateCurrentStep()) return;

    if (preview) {
      setDone({
        title: schema.form.settings.successTitle,
        message:
          schema.form.settings.successMessage +
          " (Preview — nothing was stored.)",
      });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      // Only what the person was actually shown. The server re-derives this
      // rather than trusting it, but sending a branch they never took would be
      // wrong either way — and an upload for a hidden field is wasted work.
      const shownKeys = new Set(steps.flatMap((s) => s.fields.map((f) => f.key)));

      // Upload any attachments first so the submission can reference them.
      const uploaded: {
        key: string;
        storageId: Id<"_storage">;
        name: string;
        size: number;
      }[] = [];
      for (const [key, file] of Object.entries(files)) {
        if (!shownKeys.has(key)) continue;
        const url = await generateUploadUrl({});
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) throw new Error("Could not upload " + file.name);
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        uploaded.push({ key, storageId, name: file.name, size: file.size });
      }

      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value !== "" && shownKeys.has(key)) payload[key] = value;
      }

      const result = await submit({
        workspaceSlug: schema.workspace.slug,
        formSlug: schema.form.slug,
        data: payload,
        files: uploaded,
        userAgent:
          typeof navigator === "undefined" ? undefined : navigator.userAgent,
        referrer:
          typeof document === "undefined" || !document.referrer
            ? undefined
            : document.referrer,
      });

      if (!result.ok) {
        const mapped: Record<string, string> = {};
        for (const issue of result.issues) {
          if (issue.key === "_form") setFormError(issue.message);
          else mapped[issue.key] = issue.message;
        }
        setErrors(mapped);
        // Jump back to the first step that has a problem.
        const firstBad = steps.find((candidate) =>
          candidate.fields.some((field) => field.key in mapped),
        );
        if (firstBad) setStepId(firstBad.id);
        setSubmitting(false);
        return;
      }

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setDone({ title: result.successTitle, message: result.successMessage });
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Could not submit the form.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ---- success state
  const successPanel = done && (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-6"
          strokeWidth={2}
        />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {done.title}
        </h2>
        <p className="text-sm text-muted-foreground">{done.message}</p>
      </div>
      {(preview || schema.form.settings.allowMultipleSubmissions) && (
        <Button
          variant="outline"
          onClick={() => {
            setDone(null);
            setValues(initialValues(schema.steps));
            setFiles({});
            setErrors({});
            setStepId(null);
          }}
        >
          Submit another response
        </Button>
      )}
    </div>
  );

  if (done) {
    return fullScreen ? (
      <FullScreenPanel brand={brand}>{successPanel}</FullScreenPanel>
    ) : (
      <Card className="w-full">
        <CardContent className="py-10">{successPanel}</CardContent>
      </Card>
    );
  }

  if (!step) {
    const emptyPanel = (
      <p className="text-center text-sm text-muted-foreground">
        This form has no fields yet.
      </p>
    );
    return fullScreen ? (
      <FullScreenPanel brand={brand}>{emptyPanel}</FullScreenPanel>
    ) : (
      <Card className="w-full">
        <CardContent className="py-10">{emptyPanel}</CardContent>
      </Card>
    );
  }

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const showProgress = multiStep && schema.form.settings.showProgressBar;

  // ---- pieces both layouts share, so the two cannot drift apart

  const progressBar = (
    <Progress value={progress} className="gap-1.5">
      <div className="flex w-full items-center justify-between gap-3">
        <ProgressLabel className="truncate text-xs font-medium text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
          {step.title ? " · " + step.title : ""}
        </ProgressLabel>
        <ProgressValue className="shrink-0 text-xs" />
      </div>
    </Progress>
  );

  const errorAlert = formError ? (
    <Alert variant="destructive">
      <HugeiconsIcon icon={Alert02Icon} className="size-4" strokeWidth={2} />
      <AlertTitle>Could not submit</AlertTitle>
      <AlertDescription>{formError}</AlertDescription>
    </Alert>
  ) : null;

  const fieldsGrid = (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-6",
        // On a phone the 32px desktop controls are an awkward tap target, so the
        // full-screen layout grows them — the date picker included, or it would
        // sit shorter than the inputs beside it. min-h rather than h, so this
        // never fights the height the control itself sets.
        fullScreen &&
          "max-sm:**:data-[slot=input]:min-h-11 max-sm:**:data-[slot=select-trigger]:min-h-11 max-sm:**:data-[slot=popover-trigger]:min-h-11 max-sm:**:data-[slot=textarea]:min-h-28",
      )}
    >
      {step.fields.map((field) => (
        <div key={field.id} className={WIDTH_CLASS[field.width]}>
          <FieldControl
            field={field}
            value={values[field.key] ?? ""}
            error={errors[field.key]}
            disabled={submitting}
            fileName={files[field.key]?.name ?? null}
            onChange={(value) => setValue(field.key, value)}
            onFileChange={(file) =>
              setFiles((current) => {
                const next = { ...current };
                if (file) next[field.key] = file;
                else delete next[field.key];
                return next;
              })
            }
          />
        </div>
      ))}
    </div>
  );

  const backButton =
    stepIndex > 0 ? (
      <Button
        type="button"
        variant="ghost"
        size={fullScreen ? "lg" : "default"}
        disabled={submitting}
        className={fullScreen ? "max-sm:h-11" : undefined}
        onClick={() => {
          const previous = steps[Math.max(0, stepIndex - 1)];
          if (previous) setStepId(previous.id);
        }}
      >
        <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} />
        Back
      </Button>
    ) : (
      <span aria-hidden />
    );

  const primaryButton = (
    <Button
      type="submit"
      size="lg"
      disabled={submitting}
      // Spreads to full width on a phone when it is the only button there.
      className={fullScreen ? "px-5 max-sm:h-11 max-sm:flex-1" : undefined}
    >
      {submitting && <Spinner />}
      {submitting
        ? "Submitting…"
        : isLast
          ? schema.form.settings.submitLabel
          : "Continue"}
      {!isLast && !submitting && (
        <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
      )}
    </Button>
  );

  // ---- full-screen layout: the form owns the whole page
  if (fullScreen) {
    return (
      <div className="flex w-full flex-1 flex-col">
        {showProgress && (
          <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-2xl px-4 py-2.5 sm:px-6">
              {progressBar}
            </div>
          </div>
        )}

        <form
          onSubmit={onFormSubmit}
          noValidate
          className="flex w-full flex-1 flex-col"
        >
          <div className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 sm:gap-8">
              <div className="flex flex-col gap-2">
                {stepIndex === 0 ? (
                  <>
                    <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                      {schema.form.title}
                    </h1>
                    {schema.form.description && (
                      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {schema.form.description}
                      </p>
                    )}
                    {multiStep && step.description && (
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                      {step.title}
                    </h2>
                    {step.description && (
                      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {step.description}
                      </p>
                    )}
                  </>
                )}
              </div>

              {errorAlert}
              {fieldsGrid}
            </div>

            {/* mt-auto drops the brand line to the foot of a short form. */}
            {brand && <div className="mt-auto shrink-0 pt-12">{brand}</div>}
          </div>

          {/* Sticky rather than fixed: the bar keeps its place in the layout, so
              it can never cover the last field at the end of a long form. */}
          <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              {backButton}
              {primaryButton}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ---- card layout: used by the builder preview
  return (
    <Card className="w-full">
      <CardHeader className="gap-3">
        {showProgress && progressBar}

        {stepIndex === 0 ? (
          <>
            <CardTitle className="text-xl">{schema.form.title}</CardTitle>
            {schema.form.description && (
              <CardDescription className="leading-6">
                {schema.form.description}
              </CardDescription>
            )}
          </>
        ) : (
          <>
            <CardTitle className="text-lg">{step.title}</CardTitle>
            {step.description && (
              <CardDescription>{step.description}</CardDescription>
            )}
          </>
        )}

        {stepIndex === 0 && multiStep && step.description && (
          <p className="text-sm text-muted-foreground">{step.description}</p>
        )}
      </CardHeader>

      <form onSubmit={onFormSubmit} noValidate>
        <CardContent className="flex flex-col gap-5">
          {errorAlert}
          {fieldsGrid}
        </CardContent>

        {/* CardFooter draws its own top border, so no Separator above it. */}
        <CardFooter className="flex items-center justify-between gap-3">
          {backButton}
          {primaryButton}
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * A standalone message (success, "no fields yet") on the full-screen layout:
 * centred in whatever height is left, with the brand line pinned below it.
 */
function FullScreenPanel({
  children,
  brand,
}: {
  children: React.ReactNode;
  brand?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-1 flex-col px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        {children}
      </div>
      {brand && <div className="shrink-0 pt-10">{brand}</div>}
    </div>
  );
}
