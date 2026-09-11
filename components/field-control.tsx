"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  StarIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";

import { VisibilityCondition } from "@/convex/lib/conditions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** The field shape the public API and the builder both produce. */
export type FieldDef = {
  id: string;
  key: string;
  type: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  defaultValue: string | null;
  required: boolean;
  width: "full" | "half" | "third";
  options: { label: string; value: string }[];
  validation: {
    min?: number;
    max?: number;
    step?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    patternMessage?: string;
    maxFileSizeMb?: number;
    acceptedFileTypes?: string;
  };
  /** Null means the field is always shown, as long as its step is. */
  condition?: VisibilityCondition | null;
};

export const STATIC_FIELD_TYPES = ["heading", "paragraph", "divider"];
export const LIST_FIELD_TYPES = ["multiselect", "checkboxGroup"];

export const WIDTH_CLASS: Record<FieldDef["width"], string> = {
  full: "sm:col-span-6",
  half: "sm:col-span-3",
  third: "sm:col-span-2",
};

function parseList(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // not JSON — treat as a single value
  }
  return raw ? [raw] : [];
}

type ControlProps = {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  /** Files are handled by the caller so it can upload them on submit. */
  onFileChange?: (file: File | null) => void;
  fileName?: string | null;
  error?: string;
  disabled?: boolean;
};

/**
 * Renders one field's input. Every control here comes from the shadcn library,
 * so a form looks the same in the builder preview and on the public page.
 */
export function FieldControl({
  field,
  value,
  onChange,
  onFileChange,
  fileName,
  error,
  disabled,
}: ControlProps) {
  const id = "field-" + field.id;
  const invalid = error !== undefined;
  const rules = field.validation;

  // --- static, value-less blocks
  if (field.type === "heading") {
    return (
      <h3 className="pt-2 text-base font-semibold tracking-tight">{field.label}</h3>
    );
  }
  if (field.type === "paragraph") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">{field.label}</p>
    );
  }
  if (field.type === "divider") {
    return <Separator className="my-1" />;
  }
  if (field.type === "hidden") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Hidden · {field.key}
        </span>
        <code className="truncate font-mono text-xs">{value || "—"}</code>
      </div>
    );
  }

  const labelBlock = (
    <Label htmlFor={id} className="flex items-center gap-1">
      {field.label}
      {field.required && (
        <span aria-hidden className="text-destructive">
          *
        </span>
      )}
    </Label>
  );

  const help = field.helpText ? (
    <p className="text-xs text-muted-foreground">{field.helpText}</p>
  ) : null;

  const errorBlock = invalid ? (
    <p role="alert" className="text-xs font-medium text-destructive">
      {error}
    </p>
  ) : null;

  // --- single checkbox and switch put the label beside the control
  if (field.type === "checkbox" || field.type === "switch") {
    const checked = value === "true";
    const control =
      field.type === "checkbox" ? (
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          aria-invalid={invalid}
          onCheckedChange={(next) => onChange(next ? "true" : "false")}
          className="mt-0.5"
        />
      ) : (
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          aria-invalid={invalid}
          onCheckedChange={(next) => onChange(next ? "true" : "false")}
        />
      );

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          {control}
          <div className="flex flex-col gap-1">
            <Label htmlFor={id} className="flex items-center gap-1 font-normal">
              {field.label}
              {field.required && (
                <span aria-hidden className="text-destructive">
                  *
                </span>
              )}
            </Label>
            {help}
          </div>
        </div>
        {errorBlock}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {labelBlock}

      {(() => {
        switch (field.type) {
          case "textarea":
            return (
              <Textarea
                id={id}
                rows={4}
                disabled={disabled}
                aria-invalid={invalid}
                placeholder={field.placeholder ?? undefined}
                maxLength={rules.maxLength}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            );

          case "select":
            return (
              <Select
                items={field.options}
                value={value === "" ? null : value}
                disabled={disabled}
                onValueChange={(next) => onChange(next === null ? "" : String(next))}
              >
                <SelectTrigger
                  id={id}
                  size="default"
                  aria-invalid={invalid}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={field.placeholder ?? "Select an option"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );

          case "radio":
            return (
              <RadioGroup
                value={value === "" ? null : value}
                disabled={disabled}
                aria-invalid={invalid}
                onValueChange={(next) => onChange(next === null ? "" : String(next))}
                className="flex flex-col gap-2"
              >
                {field.options.map((option) => (
                  <Label
                    key={option.value}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                  >
                    <RadioGroupItem value={option.value} />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            );

          case "multiselect":
          case "checkboxGroup": {
            const selected = parseList(value);
            return (
              <div className="flex flex-col gap-2">
                {field.options.map((option) => {
                  const checked = selected.includes(option.value);
                  return (
                    <Label
                      key={option.value}
                      className="flex items-center gap-2.5 rounded-lg border p-2.5 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(next) => {
                          const updated = next
                            ? [...selected, option.value]
                            : selected.filter((item) => item !== option.value);
                          onChange(JSON.stringify(updated));
                        }}
                      />
                      {option.label}
                    </Label>
                  );
                })}
              </div>
            );
          }

          case "slider": {
            const min = rules.min ?? 0;
            const max = rules.max ?? 100;
            const current = value === "" ? min : Number(value);
            return (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{min}</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {Number.isNaN(current) ? min : current}
                  </span>
                  <span>{max}</span>
                </div>
                <Slider
                  min={min}
                  max={max}
                  step={rules.step ?? 1}
                  disabled={disabled}
                  value={[Number.isNaN(current) ? min : current]}
                  onValueChange={(next) =>
                    onChange(String(Array.isArray(next) ? next[0] : next))
                  }
                />
              </div>
            );
          }

          case "rating": {
            const max = rules.max ?? 5;
            const current = Number(value) || 0;
            return (
              <div className="flex items-center gap-1">
                {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
                  <Button
                    key={score}
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={score + " out of " + max}
                    aria-pressed={current >= score}
                    onClick={() => onChange(current === score ? "" : String(score))}
                    className={
                      current >= score ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    <HugeiconsIcon
                      icon={StarIcon}
                      strokeWidth={2}
                      className={current >= score ? "fill-current" : undefined}
                    />
                  </Button>
                ))}
                {current > 0 && (
                  <span className="ml-1 text-sm text-muted-foreground tabular-nums">
                    {current}/{max}
                  </span>
                )}
              </div>
            );
          }

          case "otp": {
            const length = rules.maxLength ?? 6;
            return (
              <InputOTP
                id={id}
                maxLength={length}
                disabled={disabled}
                value={value}
                onChange={onChange}
              >
                <InputOTPGroup>
                  {Array.from({ length }, (_, index) => (
                    <InputOTPSlot key={index} index={index} aria-invalid={invalid} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            );
          }

          case "date": {
            const parsed = value ? new Date(value) : undefined;
            const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
            return (
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      id={id}
                      variant="outline"
                      disabled={disabled}
                      aria-invalid={invalid}
                      className="w-full justify-start font-normal"
                    />
                  }
                >
                  <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
                  {valid
                    ? valid.toLocaleDateString(undefined, { dateStyle: "medium" })
                    : (field.placeholder ?? "Pick a date")}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    autoFocus
                    selected={valid}
                    onSelect={(next) =>
                      onChange(next ? next.toISOString().slice(0, 10) : "")
                    }
                  />
                </PopoverContent>
              </Popover>
            );
          }

          case "file":
            return (
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor={id}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center font-normal transition-colors hover:bg-muted/50 aria-invalid:border-destructive"
                  aria-invalid={invalid}
                >
                  <HugeiconsIcon
                    icon={Upload01Icon}
                    className="size-5 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span className="text-sm">
                    {fileName ?? field.placeholder ?? "Choose a file"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Up to {rules.maxFileSizeMb ?? 10} MB
                    {rules.acceptedFileTypes ? " · " + rules.acceptedFileTypes : ""}
                  </span>
                </Label>
                <Input
                  id={id}
                  type="file"
                  className="hidden"
                  disabled={disabled}
                  accept={rules.acceptedFileTypes ?? undefined}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    onFileChange?.(file);
                    onChange(file ? file.name : "");
                  }}
                />
              </div>
            );

          default: {
            // text, email, phone, url, password, number, time
            const inputType =
              field.type === "phone"
                ? "tel"
                : field.type === "number" ||
                    field.type === "email" ||
                    field.type === "url" ||
                    field.type === "password" ||
                    field.type === "time"
                  ? field.type
                  : "text";
            return (
              <Input
                id={id}
                type={inputType}
                disabled={disabled}
                aria-invalid={invalid}
                placeholder={field.placeholder ?? undefined}
                min={field.type === "number" ? rules.min : undefined}
                max={field.type === "number" ? rules.max : undefined}
                step={field.type === "number" ? rules.step : undefined}
                minLength={rules.minLength}
                maxLength={rules.maxLength}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            );
          }
        }
      })()}

      {help}
      {errorBlock}
    </div>
  );
}
