"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Layers01Icon,
  Link03Icon,
  MoreHorizontalIcon,
  Note04Icon,
  SlidersHorizontalIcon,
  TextFontIcon,
  ToggleOnIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ConditionOperator,
  describeCondition,
  VALUE_OPERATORS,
  VisibilityCondition,
} from "@/convex/lib/conditions";
import { readError } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { FormRenderer, FormSchema } from "@/components/form-renderer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type FieldType = Doc<"fields">["type"];

/** A step as `getWithSchema` returns it: the document with its fields attached. */
type StepWithFields = Doc<"steps"> & { fields: Doc<"fields">[] };

const PALETTE: { group: string; icon: typeof TextFontIcon; types: { type: FieldType; label: string }[] }[] = [
  {
    group: "Text",
    icon: TextFontIcon,
    types: [
      { type: "text", label: "Short answer" },
      { type: "textarea", label: "Long answer" },
      { type: "email", label: "Email" },
      { type: "phone", label: "Phone" },
      { type: "url", label: "URL" },
      { type: "password", label: "Password" },
      { type: "number", label: "Number" },
    ],
  },
  {
    group: "Choice",
    icon: ToggleOnIcon,
    types: [
      { type: "select", label: "Dropdown" },
      { type: "multiselect", label: "Multi-select" },
      { type: "radio", label: "Radio group" },
      { type: "checkboxGroup", label: "Checkbox group" },
      { type: "checkbox", label: "Single checkbox" },
      { type: "switch", label: "Switch" },
    ],
  },
  {
    group: "Date & time",
    icon: Calendar03Icon,
    types: [
      { type: "date", label: "Date" },
      { type: "time", label: "Time" },
    ],
  },
  {
    group: "Advanced",
    icon: SlidersHorizontalIcon,
    types: [
      { type: "slider", label: "Slider" },
      { type: "rating", label: "Star rating" },
      { type: "otp", label: "One-time code" },
      { type: "file", label: "File upload" },
      { type: "hidden", label: "Hidden field" },
    ],
  },
  {
    group: "Layout",
    icon: Layers01Icon,
    types: [
      { type: "heading", label: "Heading" },
      { type: "paragraph", label: "Paragraph" },
      { type: "divider", label: "Divider" },
    ],
  },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PALETTE.flatMap((group) => group.types.map((t) => [t.type, t.label])),
);

const CHOICE_TYPES = ["select", "multiselect", "radio", "checkboxGroup"];
const STATIC_TYPES = ["heading", "paragraph", "divider"];
const TEXTY_TYPES = ["text", "textarea", "email", "phone", "url", "password"];

export default function FormBuilderPage() {
  const params = useParams<{ workspaceId: string; formId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;
  const formId = params.formId as Id<"forms">;
  const isMobile = useIsMobile();

  const data = useQuery(api.forms.getWithSchema, { formId });

  const updateForm = useMutation(api.forms.update);
  const setStatus = useMutation(api.forms.setStatus);
  const addStep = useMutation(api.forms.addStep);
  const updateStep = useMutation(api.forms.updateStep);
  const removeStep = useMutation(api.forms.removeStep);
  const addField = useMutation(api.forms.addField);
  const removeField = useMutation(api.forms.removeField);
  const moveField = useMutation(api.forms.moveField);

  const [selectedFieldId, setSelectedFieldId] = React.useState<Id<"fields"> | null>(null);
  const [editingStep, setEditingStep] = React.useState<Doc<"steps"> | null>(null);
  const [pendingStepDelete, setPendingStepDelete] = React.useState<Id<"steps"> | null>(null);
  const [titleDraft, setTitleDraft] = React.useState<string | null>(null);

  const selectedField = React.useMemo(() => {
    if (!data || !selectedFieldId) return null;
    for (const step of data.steps) {
      const found = step.fields.find((f) => f._id === selectedFieldId);
      if (found) return found;
    }
    return null;
  }, [data, selectedFieldId]);

  if (data === undefined) {
    return (
      <>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Skeleton className="h-4 w-40" />
        </header>
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }

  const { form, steps, workspace } = data;
  const canEdit = data.role !== "viewer";
  const publicPath = `/f/${workspace.slug}/${form.slug}`;
  const totalFields = steps.reduce((n, s) => n + s.fields.length, 0);

  const previewSchema: FormSchema = {
    workspace: { name: workspace.name, slug: workspace.slug },
    form: {
      id: form._id,
      title: form.title,
      description: form.description ?? null,
      slug: form.slug,
      status: "published",
      settings: form.settings,
    },
    steps: steps.map((step) => ({
      id: step._id,
      title: step.title,
      description: step.description ?? null,
      fields: step.fields.map((field) => ({
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
      })),
    })),
  };

  async function guard(action: () => Promise<unknown>, successTitle?: string) {
    try {
      await action();
      if (successTitle) toast.add({ title: successTitle });
    } catch (caught) {
      toast.add({
        title: "Something went wrong",
        description: readError(caught),
        type: "error",
      });
    }
  }

  const inspector = selectedField ? (
    <FieldInspector
      key={selectedField._id}
      field={selectedField}
      steps={steps.map((s) => ({ _id: s._id, title: s.title }))}
      sources={conditionSources(steps, {
        stepId: selectedField.stepId,
        fieldId: selectedField._id,
      })}
      onClose={() => setSelectedFieldId(null)}
      onDelete={async () => {
        await guard(() => removeField({ fieldId: selectedField._id }), "Field removed");
        setSelectedFieldId(null);
      }}
    />
  ) : null;

  return (
    <>
      {/* ---------- header ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />

        <div className="flex min-w-0 items-center gap-2">
          {titleDraft === null ? (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setTitleDraft(form.title)}
              className="truncate rounded px-1 text-sm font-medium hover:bg-muted disabled:cursor-default"
            >
              {form.title}
            </button>
          ) : (
            <Input
              autoFocus
              value={titleDraft}
              className="h-7 w-48"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                if (titleDraft.trim() && titleDraft !== form.title) {
                  await guard(() => updateForm({ formId, title: titleDraft }));
                }
                setTitleDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setTitleDraft(null);
              }}
            />
          )}
          <Badge
            variant={
              form.status === "published"
                ? "default"
                : form.status === "draft"
                  ? "secondary"
                  : "outline"
            }
          >
            {form.status}
          </Badge>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button nativeButton={false}
            variant="ghost"
            size="sm"
            render={<Link href={`/app/w/${workspaceId}/forms/${formId}/responses`} />}
          >
            <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
            <span className="hidden sm:inline">
              Responses{form.submissionCount > 0 ? ` (${form.submissionCount})` : ""}
            </span>
          </Button>

          {canEdit &&
            (form.status === "published" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => guard(() => setStatus({ formId, status: "closed" }), "Form closed")}
              >
                Close form
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  guard(() => setStatus({ formId, status: "published" }), "Form published")
                }
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
                Publish
              </Button>
            ))}
        </div>
      </header>

      {/* ---------- body ---------- */}
      <Tabs defaultValue="build" className="flex min-w-0 flex-1 flex-col gap-0">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== build ===== */}
        <TabsContent value="build" className="min-w-0 flex-1">
          <div className="grid min-w-0 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              {steps.map((step, stepIndex) => (
                <Card key={step._id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="tabular-nums">
                            {stepIndex + 1}
                          </Badge>
                          <span className="truncate">{step.title}</span>
                        </CardTitle>
                        {step.description && (
                          <CardDescription className="mt-1">
                            {step.description}
                          </CardDescription>
                        )}
                        {step.condition && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {describeCondition(step.condition, (key) =>
                              labelForKey(steps, key),
                            )}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                            <span className="sr-only">Step actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 min-w-44">
                            <DropdownMenuItem onClick={() => setEditingStep(step)}>
                              <HugeiconsIcon icon={Edit02Icon} className="size-4" strokeWidth={2} />
                              Rename step
                            </DropdownMenuItem>
                            {steps.length > 1 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setPendingStepDelete(step._id)}
                                >
                                  <HugeiconsIcon
                                    icon={Delete02Icon}
                                    className="size-4"
                                    strokeWidth={2}
                                  />
                                  Delete step
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="flex min-w-0 flex-col gap-2">
                    {step.fields.length === 0 && (
                      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        No fields on this step yet.
                      </p>
                    )}

                    {step.fields.map((field, fieldIndex) => (
                      <div
                        key={field._id}
                        className={
                          "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors " +
                          (selectedFieldId === field._id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/60")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedFieldId(field._id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <Badge variant="secondary" className="shrink-0 text-[0.65rem]">
                            {TYPE_LABEL[field.type] ?? field.type}
                          </Badge>
                          <span className="truncate text-sm">{field.label}</span>
                          {field.required && (
                            <span className="shrink-0 text-xs text-destructive">*</span>
                          )}
                          {field.condition && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[0.65rem]"
                              title={describeCondition(field.condition, (key) =>
                                labelForKey(steps, key),
                              )}
                            >
                              Conditional
                            </Badge>
                          )}
                          {!STATIC_TYPES.includes(field.type) && (
                            <code className="ml-auto hidden shrink-0 font-mono text-[0.7rem] text-muted-foreground sm:inline">
                              {field.key}
                            </code>
                          )}
                        </button>

                        {canEdit && (
                          <div className="flex shrink-0 items-center">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={fieldIndex === 0}
                              aria-label="Move field up"
                              onClick={() =>
                                guard(() =>
                                  moveField({
                                    fieldId: field._id,
                                    targetStepId: step._id,
                                    targetIndex: fieldIndex - 1,
                                  }),
                                )
                              }
                            >
                              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={fieldIndex === step.fields.length - 1}
                              aria-label="Move field down"
                              onClick={() =>
                                guard(() =>
                                  moveField({
                                    fieldId: field._id,
                                    targetStepId: step._id,
                                    targetIndex: fieldIndex + 2,
                                  }),
                                )
                              }
                            >
                              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Remove field"
                              onClick={() =>
                                guard(() => removeField({ fieldId: field._id }))
                              }
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>

                  {canEdit && (
                    <CardFooter className="pt-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                          Add field
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 min-w-56">
                          {PALETTE.map((group) => (
                            <DropdownMenuGroup key={group.group}>
                              <DropdownMenuLabel>{group.group}</DropdownMenuLabel>
                              {group.types.map((item) => (
                                <DropdownMenuItem
                                  key={item.type}
                                  onClick={async () => {
                                    try {
                                      const newId = await addField({
                                        stepId: step._id,
                                        type: item.type,
                                      });
                                      setSelectedFieldId(newId);
                                    } catch (caught) {
                                      toast.add({
                                        title: "Could not add field",
                                        description: readError(caught),
                                        type: "error",
                                      });
                                    }
                                  }}
                                >
                                  <HugeiconsIcon
                                    icon={group.icon}
                                    className="size-4"
                                    strokeWidth={2}
                                  />
                                  {item.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardFooter>
                  )}
                </Card>
              ))}

              {canEdit && (
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => guard(() => addStep({ formId }), "Step added")}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  Add step
                </Button>
              )}
            </div>

            {/* inspector: a side panel on desktop, a sheet on mobile */}
            {!isMobile && (
              <aside className="sticky top-4 hidden min-w-0 lg:block">
                {inspector ?? (
                  <Card>
                    <CardContent className="py-10">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <HugeiconsIcon icon={SlidersHorizontalIcon} strokeWidth={2} />
                          </EmptyMedia>
                          <EmptyTitle>Nothing selected</EmptyTitle>
                          <EmptyDescription>
                            Pick a field to edit its label, key, validation and
                            width.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </CardContent>
                  </Card>
                )}
              </aside>
            )}
          </div>

          {isMobile && (
            <Sheet
              open={selectedField !== null}
              onOpenChange={(open) => !open && setSelectedFieldId(null)}
            >
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Edit field</SheetTitle>
                  <SheetDescription>
                    {selectedField ? (TYPE_LABEL[selectedField.type] ?? selectedField.type) : ""}
                  </SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-4">{inspector}</div>
              </SheetContent>
            </Sheet>
          )}
        </TabsContent>

        {/* ===== preview ===== */}
        <TabsContent value="preview" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
            {totalFields === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Nothing to preview yet</EmptyTitle>
                  <EmptyDescription>
                    Add a field on the Build tab and it will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                <Badge variant="secondary" className="w-fit">
                  Preview — submissions are not stored
                </Badge>
                <FormRenderer schema={previewSchema} preview />
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== settings ===== */}
        <TabsContent value="settings" className="min-w-0 flex-1">
          <FormSettings form={form} disabled={!canEdit} />
        </TabsContent>

        {/* ===== share ===== */}
        <TabsContent value="share" className="min-w-0 flex-1">
          <SharePanel
            status={form.status}
            publicPath={publicPath}
            workspaceSlug={workspace.slug}
            formSlug={form.slug}
          />
        </TabsContent>
      </Tabs>

      {/* ---------- rename step ---------- */}
      <Dialog
        open={editingStep !== null}
        onOpenChange={(open) => !open && setEditingStep(null)}
      >
        <DialogContent>
          {editingStep && (
            <StepDialog
              step={editingStep}
              sources={conditionSources(steps, {
                stepId: editingStep._id,
                fieldId: null,
              })}
              onSave={async (title, description, condition) => {
                await guard(() =>
                  updateStep({
                    stepId: editingStep._id,
                    title,
                    description,
                    condition,
                  }),
                );
                setEditingStep(null);
              }}
              onCancel={() => setEditingStep(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- delete step ---------- */}
      <AlertDialog
        open={pendingStepDelete !== null}
        onOpenChange={(open) => !open && setPendingStepDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this step?</AlertDialogTitle>
            <AlertDialogDescription>
              Every field on the step is removed with it. Existing responses keep
              the answers they already hold.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingStepDelete) {
                  await guard(() => removeStep({ stepId: pendingStepDelete }), "Step deleted");
                }
                setPendingStepDelete(null);
              }}
            >
              Delete step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Visibility rules
// ---------------------------------------------------------------------------

type ConditionSource = {
  key: string;
  label: string;
  options: { label: string; value: string }[];
};

const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  anyOf: "is any of",
  noneOf: "is none of",
  isNotEmpty: "is answered",
  isEmpty: "is blank",
};

const OPERATORS: ConditionOperator[] = ["anyOf", "noneOf", "isNotEmpty", "isEmpty"];

/**
 * The questions a rule may test: value-carrying fields that come earlier in the
 * form than whatever is being edited. Offering later ones would let an author
 * write a rule that can never be true, because its answer is not in yet.
 *
 * `fieldId` null asks on behalf of a whole step, which can only look at steps
 * above it; a field may also look at the questions above it on its own step.
 */
function conditionSources(
  steps: StepWithFields[],
  target: { stepId: Id<"steps">; fieldId: Id<"fields"> | null },
): ConditionSource[] {
  const sources: ConditionSource[] = [];
  const take = (field: Doc<"fields">) => {
    if (STATIC_TYPES.includes(field.type)) return;
    sources.push({ key: field.key, label: field.label, options: field.options });
  };

  for (const step of steps) {
    if (step._id === target.stepId) {
      if (target.fieldId) {
        for (const field of step.fields) {
          if (field._id === target.fieldId) break;
          take(field);
        }
      }
      break;
    }
    for (const field of step.fields) take(field);
  }
  return sources;
}

/** Names the field a rule points at, falling back to the raw key if it is gone. */
function labelForKey(steps: StepWithFields[], key: string): string {
  for (const step of steps) {
    for (const field of step.fields) {
      if (field.key === key) return field.label;
    }
  }
  return key;
}

/** Free-text values, kept as typed so a trailing comma does not fight the user. */
function ValuesInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = React.useState(values.join(", "));
  return (
    <Input
      value={text}
      placeholder="value-one, value-two"
      className="font-mono text-xs"
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
        );
      }}
    />
  );
}

function ConditionEditor({
  subject,
  value,
  sources,
  onChange,
}: {
  subject: "step" | "field";
  value: VisibilityCondition | null;
  sources: ConditionSource[];
  onChange: (next: VisibilityCondition | null) => void;
}) {
  const source = sources.find((candidate) => candidate.key === value?.fieldKey);
  const needsValues = value !== null && VALUE_OPERATORS.includes(value.operator);

  if (sources.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a question earlier in the form to make this {subject} conditional.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        aria-label={"When to show this " + subject}
        value={value?.fieldKey ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? null
              : { fieldKey: event.target.value, operator: "anyOf", values: [] },
          )
        }
      >
        <NativeSelectOption value="">Always show this {subject}</NativeSelectOption>
        {sources.map((candidate) => (
          <NativeSelectOption key={candidate.key} value={candidate.key}>
            Only when “{candidate.label}” …
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {value && (
        <>
          <NativeSelect
            aria-label="Comparison"
            value={value.operator}
            onChange={(event) =>
              onChange({
                ...value,
                operator: event.target.value as ConditionOperator,
              })
            }
          >
            {OPERATORS.map((operator) => (
              <NativeSelectOption key={operator} value={operator}>
                {OPERATOR_LABEL[operator]}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          {needsValues &&
            (source && source.options.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {source.options.map((option) => (
                  <Label
                    key={option.value}
                    className="flex min-w-0 items-center gap-2.5 rounded-lg border p-2 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                  >
                    <Checkbox
                      checked={value.values.includes(option.value)}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...value,
                          values: checked
                            ? [...value.values, option.value]
                            : value.values.filter((v) => v !== option.value),
                        })
                      }
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                    <code className="ml-auto shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                      {option.value}
                    </code>
                  </Label>
                ))}
              </div>
            ) : (
              <ValuesInput
                values={value.values}
                onChange={(values) => onChange({ ...value, values })}
              />
            ))}

          <p className="text-xs text-muted-foreground">
            {describeCondition(
              value,
              (key) =>
                sources.find((candidate) => candidate.key === key)?.label ?? key,
            )}
            .
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step rename dialog
// ---------------------------------------------------------------------------

function StepDialog({
  step,
  sources,
  onSave,
  onCancel,
}: {
  step: Doc<"steps">;
  sources: ConditionSource[];
  onSave: (
    title: string,
    description: string,
    condition: VisibilityCondition | null,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(step.title);
  const [description, setDescription] = React.useState(step.description ?? "");
  const [condition, setCondition] = React.useState<VisibilityCondition | null>(
    step.condition ?? null,
  );
  const [saving, setSaving] = React.useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        await onSave(title, description, condition);
        setSaving(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>Step details</DialogTitle>
        <DialogDescription>
          Shown above the step&apos;s fields on a multi-step form.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="step-title">Title</Label>
        <Input
          id="step-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="step-desc">Description</Label>
        <Textarea
          id="step-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <Separator />
      <div className="flex flex-col gap-2">
        <Label>When to show it</Label>
        <ConditionEditor
          subject="step"
          value={condition}
          sources={sources}
          onChange={setCondition}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save step"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Field inspector
// ---------------------------------------------------------------------------

function FieldInspector({
  field,
  steps,
  sources,
  onClose,
  onDelete,
}: {
  field: Doc<"fields">;
  steps: { _id: Id<"steps">; title: string }[];
  sources: ConditionSource[];
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const updateField = useMutation(api.forms.updateField);
  const moveField = useMutation(api.forms.moveField);

  const [label, setLabel] = React.useState(field.label);
  const [key, setKey] = React.useState(field.key);
  const [placeholder, setPlaceholder] = React.useState(field.placeholder ?? "");
  const [helpText, setHelpText] = React.useState(field.helpText ?? "");
  const [defaultValue, setDefaultValue] = React.useState(field.defaultValue ?? "");
  const [required, setRequired] = React.useState(field.required);
  const [width, setWidth] = React.useState(field.width);
  const [options, setOptions] = React.useState(field.options);
  const [validation, setValidation] = React.useState(field.validation);
  const [condition, setCondition] = React.useState<VisibilityCondition | null>(
    field.condition ?? null,
  );
  const [saving, setSaving] = React.useState(false);

  const isStatic = STATIC_TYPES.includes(field.type);
  const isChoice = CHOICE_TYPES.includes(field.type);
  const isTexty = TEXTY_TYPES.includes(field.type);
  const isNumeric = ["number", "slider", "rating"].includes(field.type);

  function setRule(patch: Partial<typeof validation>) {
    setValidation((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      await updateField({
        fieldId: field._id,
        label,
        key: isStatic ? undefined : key,
        placeholder,
        helpText,
        defaultValue,
        required: isStatic ? false : required,
        width,
        options: isChoice ? options : [],
        validation,
        condition,
      });
      toast.add({ title: "Field saved" });
    } catch (caught) {
      toast.add({
        title: "Could not save field",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {TYPE_LABEL[field.type] ?? field.type}
          </CardTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="rotate-45" />
          </Button>
        </div>
        <CardDescription>
          {isStatic
            ? "A layout block — it never collects a value."
            : "Controls how this question looks and what counts as valid."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="insp-label">
            {field.type === "paragraph" ? "Text" : "Label"}
          </Label>
          {field.type === "paragraph" ? (
            <Textarea
              id="insp-label"
              rows={3}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          ) : (
            <Input
              id="insp-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </div>

        {!isStatic && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="insp-key">Field key</Label>
              <Input
                id="insp-key"
                value={key}
                className="font-mono text-xs"
                onChange={(e) => setKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used in the submission payload and the API.
              </p>
            </div>

            {(isTexty || field.type === "select" || field.type === "date" || field.type === "file") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="insp-placeholder">Placeholder</Label>
                <Input
                  id="insp-placeholder"
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="insp-help">Help text</Label>
              <Input
                id="insp-help"
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="insp-default">Default value</Label>
              <Input
                id="insp-default"
                value={defaultValue}
                className="font-mono text-xs"
                onChange={(e) => setDefaultValue(e.target.value)}
              />
            </div>

            <Label className="flex items-center justify-between gap-2 font-normal">
              <span className="text-sm font-medium">Required</span>
              <Switch checked={required} onCheckedChange={setRequired} />
            </Label>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="insp-width">Width</Label>
          <NativeSelect
            id="insp-width"
            value={width}
            onChange={(e) => setWidth(e.target.value as typeof width)}
          >
            <NativeSelectOption value="full">Full width</NativeSelectOption>
            <NativeSelectOption value="half">Half width</NativeSelectOption>
            <NativeSelectOption value="third">One third</NativeSelectOption>
          </NativeSelect>
        </div>

        {/* ---- options editor ---- */}
        {isChoice && (
          <div className="flex flex-col gap-2">
            <Label>Options</Label>
            <div className="flex flex-col gap-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    placeholder="Label"
                    onChange={(e) =>
                      setOptions((current) =>
                        current.map((o, i) =>
                          i === index
                            ? {
                                label: e.target.value,
                                value: slugifyValue(e.target.value) || o.value,
                              }
                            : o,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove option"
                    disabled={options.length <= 1}
                    onClick={() =>
                      setOptions((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setOptions((current) => [
                  ...current,
                  {
                    label: "Option " + (current.length + 1),
                    value: "option-" + (current.length + 1),
                  },
                ])
              }
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add option
            </Button>
          </div>
        )}

        {/* ---- validation ---- */}
        {!isStatic && (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Validation</p>

            {isNumeric && (
              <div className="grid grid-cols-3 gap-2">
                {(["min", "max", "step"] as const).map((rule) => (
                  <div key={rule} className="flex flex-col gap-1.5">
                    <Label htmlFor={"insp-" + rule} className="text-xs capitalize">
                      {rule}
                    </Label>
                    <Input
                      id={"insp-" + rule}
                      type="number"
                      value={validation[rule] ?? ""}
                      onChange={(e) =>
                        setRule({
                          [rule]: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {(isTexty || field.type === "otp") && (
              <div className="grid grid-cols-2 gap-2">
                {(["minLength", "maxLength"] as const).map((rule) => (
                  <div key={rule} className="flex flex-col gap-1.5">
                    <Label htmlFor={"insp-" + rule} className="text-xs">
                      {rule === "minLength" ? "Min length" : "Max length"}
                    </Label>
                    <Input
                      id={"insp-" + rule}
                      type="number"
                      min={0}
                      value={validation[rule] ?? ""}
                      onChange={(e) =>
                        setRule({
                          [rule]: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {isTexty && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="insp-pattern">Pattern (regular expression)</Label>
                  <Input
                    id="insp-pattern"
                    value={validation.pattern ?? ""}
                    className="font-mono text-xs"
                    placeholder="^[A-Z]{2}-\d{4}$"
                    onChange={(e) => setRule({ pattern: e.target.value || undefined })}
                  />
                </div>
                {validation.pattern && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="insp-pattern-msg">Message when it fails</Label>
                    <Input
                      id="insp-pattern-msg"
                      value={validation.patternMessage ?? ""}
                      onChange={(e) =>
                        setRule({ patternMessage: e.target.value || undefined })
                      }
                    />
                  </div>
                )}
              </>
            )}

            {field.type === "file" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-size" className="text-xs">
                    Max size (MB)
                  </Label>
                  <Input
                    id="insp-size"
                    type="number"
                    min={1}
                    value={validation.maxFileSizeMb ?? ""}
                    onChange={(e) =>
                      setRule({
                        maxFileSizeMb:
                          e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-accept" className="text-xs">
                    Accepted types
                  </Label>
                  <Input
                    id="insp-accept"
                    placeholder="image/*,.pdf"
                    value={validation.acceptedFileTypes ?? ""}
                    onChange={(e) =>
                      setRule({ acceptedFileTypes: e.target.value || undefined })
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- when this field appears ---- */}
        <Separator />
        <div className="flex flex-col gap-2">
          <Label>When to show it</Label>
          <ConditionEditor
            subject="field"
            value={condition}
            sources={sources}
            onChange={setCondition}
          />
        </div>

        {/* ---- move to another step ---- */}
        {steps.length > 1 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <Label htmlFor="insp-step">Move to step</Label>
              <NativeSelect
                id="insp-step"
                value={field.stepId}
                onChange={(e) =>
                  moveField({
                    fieldId: field._id,
                    targetStepId: e.target.value as Id<"steps">,
                    targetIndex: 999,
                  })
                }
              >
                {steps.map((step, index) => (
                  <NativeSelectOption key={step._id} value={step._id}>
                    {index + 1}. {step.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 pt-2">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          Delete
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save field"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function slugifyValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function FormSettings({
  form,
  disabled,
}: {
  form: Doc<"forms">;
  disabled: boolean;
}) {
  const updateForm = useMutation(api.forms.update);
  const [title, setTitle] = React.useState(form.title);
  const [description, setDescription] = React.useState(form.description ?? "");
  const [slug, setSlug] = React.useState(form.slug);
  const [settings, setSettings] = React.useState(form.settings);
  const [saving, setSaving] = React.useState(false);

  function patch(next: Partial<typeof settings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form details</CardTitle>
          <CardDescription>Shown at the top of the public form.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-title">Title</Label>
            <Input
              id="set-title"
              value={title}
              disabled={disabled}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-desc">Description</Label>
            <Textarea
              id="set-desc"
              rows={3}
              value={description}
              disabled={disabled}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-slug">URL slug</Label>
            <Input
              id="set-slug"
              value={slug}
              disabled={disabled}
              className="font-mono text-xs"
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Changing this changes the form&apos;s public link.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission behaviour</CardTitle>
          <CardDescription>
            What people see when they finish, and what happens next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-submit">Submit button label</Label>
            <Input
              id="set-submit"
              value={settings.submitLabel}
              disabled={disabled}
              onChange={(e) => patch({ submitLabel: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-success-title">Success heading</Label>
            <Input
              id="set-success-title"
              value={settings.successTitle}
              disabled={disabled}
              onChange={(e) => patch({ successTitle: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-success-msg">Success message</Label>
            <Textarea
              id="set-success-msg"
              rows={2}
              value={settings.successMessage}
              disabled={disabled}
              onChange={(e) => patch({ successMessage: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-redirect">Redirect URL (optional)</Label>
            <Input
              id="set-redirect"
              placeholder="https://example.com/thanks"
              value={settings.redirectUrl ?? ""}
              disabled={disabled}
              onChange={(e) => patch({ redirectUrl: e.target.value || undefined })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="set-closed">Message when the form is closed</Label>
            <Input
              id="set-closed"
              placeholder="This form is no longer accepting responses."
              value={settings.closedMessage ?? ""}
              disabled={disabled}
              onChange={(e) => patch({ closedMessage: e.target.value || undefined })}
            />
          </div>

          <Separator />

          <Label className="flex items-center justify-between gap-3 font-normal">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Show the progress bar</span>
              <span className="text-xs text-muted-foreground">
                Only appears on forms with more than one step.
              </span>
            </span>
            <Switch
              checked={settings.showProgressBar}
              disabled={disabled}
              onCheckedChange={(next) => patch({ showProgressBar: next })}
            />
          </Label>

          <Label className="flex items-center justify-between gap-3 font-normal">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Allow another response</span>
              <span className="text-xs text-muted-foreground">
                Offers a “submit another” button after a successful submission.
              </span>
            </span>
            <Switch
              checked={settings.allowMultipleSubmissions}
              disabled={disabled}
              onCheckedChange={(next) => patch({ allowMultipleSubmissions: next })}
            />
          </Label>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            disabled={disabled || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateForm({
                  formId: form._id,
                  title,
                  description,
                  slug,
                  settings,
                });
                toast.add({ title: "Settings saved" });
              } catch (caught) {
                toast.add({
                  title: "Could not save",
                  description: readError(caught),
                  type: "error",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share tab
// ---------------------------------------------------------------------------

function SharePanel({
  status,
  publicPath,
  workspaceSlug,
  formSlug,
}: {
  status: string;
  publicPath: string;
  workspaceSlug: string;
  formSlug: string;
}) {
  // window.location is only readable after mount; the server render has no origin.
  const [origin, setOrigin] = React.useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setOrigin(window.location.origin), []);

  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
  const formUrl = origin + publicPath;
  const directoryUrl = origin + "/w/" + workspaceSlug;

  const rows = [
    {
      label: "Form link",
      description: "Send this to anyone who should fill in the form.",
      value: formUrl,
      icon: Link03Icon,
    },
    {
      label: "Workspace link",
      description: "Lists every published form in this workspace.",
      value: directoryUrl,
      icon: Layers01Icon,
    },
  ];

  const apiRows = [
    {
      label: "Get the form definition",
      value: `GET ${siteUrl}/api/v1/forms/${workspaceSlug}/${formSlug}`,
    },
    {
      label: "Post a submission",
      value: `POST ${siteUrl}/api/v1/submit/${workspaceSlug}/${formSlug}`,
    },
    {
      label: "Read stored responses (needs an API key)",
      value: `GET ${siteUrl}/api/v1/submissions?form=${formSlug}`,
    },
  ];

  const embed = `<iframe src="${formUrl}" width="100%" height="720" frameborder="0" title="Magic Forms"></iframe>`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      {status !== "published" && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">This form is not published</CardTitle>
            <CardDescription>
              The links below only work once you publish the form from the header.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {rows.map((row) => (
        <Card key={row.label}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon icon={row.icon} className="size-4 text-primary" strokeWidth={2} />
              {row.label}
            </CardTitle>
            <CardDescription>{row.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {row.value || "…"}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(row.value);
                  toast.add({ title: row.label + " copied" });
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                Copy
              </Button>
              <Button nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={row.value} target="_blank" rel="noreferrer" />}
              >
                <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                Open
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={CodeIcon} className="size-4 text-primary" strokeWidth={2} />
            Embed
          </CardTitle>
          <CardDescription>Drop this into any page.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-lg bg-muted">
            <pre className="p-3 text-xs">
              <code className="font-mono">{embed}</code>
            </pre>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(embed);
              toast.add({ title: "Embed code copied" });
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            Copy embed code
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={CodeIcon} className="size-4 text-primary" strokeWidth={2} />
            API integration
          </CardTitle>
          <CardDescription>
            The same validation runs whichever way a response arrives.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {apiRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  {row.value}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy"
                  onClick={async () => {
                    await navigator.clipboard.writeText(row.value);
                    toast.add({ title: "Copied" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
