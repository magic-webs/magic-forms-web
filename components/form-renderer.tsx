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
};

export function FormRenderer({ schema, preview = false }: Props) {
  const submit = useMutation(api.publicForms.submit);
  const generateUploadUrl = useMutation(api.publicForms.generateUploadUrl);
  const recordStep = useMutation(api.publicForms.recordStepCompleted);

  const [stepIndex, setStepIndex] = React.useState(0);
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

  const steps = schema.steps.length > 0 ? schema.steps : [];
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
        stepIndex,
      }).catch(() => {});
    }
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
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
      // Upload any attachments first so the submission can reference them.
      const uploaded: {
        key: string;
        storageId: Id<"_storage">;
        name: string;
        size: number;
      }[] = [];
      for (const [key, file] of Object.entries(files)) {
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
        if (value !== "") payload[key] = value;
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
        const firstBad = steps.findIndex((candidate) =>
          candidate.fields.some((field) => field.key in mapped),
        );
        if (firstBad >= 0) setStepIndex(firstBad);
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
  if (done) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="size-6"
              strokeWidth={2}
            />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold tracking-tight">{done.title}</h2>
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
                setStepIndex(0);
              }}
            >
              Submit another response
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!step) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This form has no fields yet.
        </CardContent>
      </Card>
    );
  }

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <Card className="w-full">
      <CardHeader className="gap-3">
        {multiStep && schema.form.settings.showProgressBar && (
          <Progress value={progress} className="gap-1.5">
            <div className="flex w-full items-center justify-between">
              <ProgressLabel className="text-xs font-medium text-muted-foreground">
                Step {stepIndex + 1} of {steps.length}
                {step.title ? " · " + step.title : ""}
              </ProgressLabel>
              <ProgressValue className="text-xs" />
            </div>
          </Progress>
        )}

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
          {formError && (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} className="size-4" strokeWidth={2} />
              <AlertTitle>Could not submit</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-6">
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
        </CardContent>

        {/* CardFooter draws its own top border, so no Separator above it. */}
        <CardFooter className="flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} />
              Back
            </Button>
          ) : (
            <span aria-hidden />
          )}

          <Button type="submit" size="lg" disabled={submitting}>
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
        </CardFooter>
      </form>
    </Card>
  );
}
