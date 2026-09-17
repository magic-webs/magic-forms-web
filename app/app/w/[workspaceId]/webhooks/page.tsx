"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  RefreshCwIcon,
  Sent02Icon,
  ViewIcon,
  ViewOffIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { formatWhen, readError } from "@/lib/format";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

type WebhookEvent = Doc<"webhooks">["events"][number];

const EVENTS: { value: WebhookEvent; label: string; hint: string }[] = [
  { value: "submission.created", label: "submission.created", hint: "A response was submitted" },
  { value: "submission.updated", label: "submission.updated", hint: "A response changed" },
  { value: "submission.deleted", label: "submission.deleted", hint: "A response was removed" },
  { value: "form.created", label: "form.created", hint: "A new form was created" },
  { value: "form.updated", label: "form.updated", hint: "A form's details changed" },
  { value: "form.published", label: "form.published", hint: "A form went live" },
  { value: "form.unpublished", label: "form.unpublished", hint: "A form was closed or unpublished" },
  { value: "form.deleted", label: "form.deleted", hint: "A form was deleted" },
  { value: "form.viewed", label: "form.viewed", hint: "Someone opened a form" },
  { value: "form.step_completed", label: "form.step_completed", hint: "Someone advanced a step" },
];

export default function WebhooksPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const webhooks = useQuery(api.webhooks.listByWorkspace, { workspaceId });
  const forms = useQuery(api.forms.listByWorkspace, { workspaceId });
  const deliveries = useQuery(api.webhooks.listDeliveries, { workspaceId });

  const createWebhook = useMutation(api.webhooks.create);
  const updateWebhook = useMutation(api.webhooks.update);
  const removeWebhook = useMutation(api.webhooks.remove);
  const rotateSecret = useMutation(api.webhooks.rotateSecret);
  const sendTest = useMutation(api.webhooks.sendTest);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Id<"webhooks"> | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Id<"webhooks"> | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});

  const editingHook = webhooks?.find((hook) => hook._id === editing) ?? null;

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

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Webhooks</span>
        <Badge variant="secondary" className="tabular-nums">
          {webhooks?.length ?? 0}
        </Badge>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          <span className="hidden sm:inline">New webhook</span>
        </Button>
      </header>

      <Tabs defaultValue="endpoints" className="flex min-w-0 flex-1 flex-col gap-0">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="deliveries">Delivery log</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== endpoints ===== */}
        <TabsContent value="endpoints" className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
            {webhooks === undefined && (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            )}

            {webhooks?.length === 0 && (
              <Empty className="flex-1">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={WebhookIcon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No webhooks yet</EmptyTitle>
                  <EmptyDescription>
                    Point an endpoint at Magic Forms and pick which events should
                    reach it. Each delivery is signed and retried on failure.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setDialogOpen(true)}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                    Add your first webhook
                  </Button>
                </EmptyContent>
              </Empty>
            )}

            {webhooks?.map((hook) => (
              <Card key={hook._id} className="min-w-0">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <HugeiconsIcon
                          icon={WebhookIcon}
                          className="size-4 text-primary"
                          strokeWidth={2}
                        />
                        <span className="truncate">{hook.name}</span>
                        {!hook.enabled && <Badge variant="outline">paused</Badge>}
                      </CardTitle>
                      <CardDescription className="mt-1 break-all font-mono text-xs">
                        {hook.url}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={hook.enabled}
                        aria-label="Enabled"
                        onCheckedChange={(next) =>
                          guard(() =>
                            updateWebhook({ webhookId: hook._id, enabled: next }),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit webhook"
                        onClick={() => {
                          setEditing(hook._id);
                          setDialogOpen(true);
                        }}
                      >
                        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete webhook"
                        onClick={() => setPendingDelete(hook._id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex min-w-0 flex-col gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {hook.events.map((event) => (
                      <Badge key={event} variant="secondary" className="font-mono text-[0.7rem]">
                        {event}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Scope:{" "}
                      <span className="font-medium text-foreground">
                        {hook.formTitle ?? "entire workspace"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        className="size-3.5 text-primary"
                        strokeWidth={2}
                      />
                      {hook.successCount} delivered
                    </span>
                    <span className="flex items-center gap-1">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        className="size-3.5 text-destructive"
                        strokeWidth={2}
                      />
                      {hook.failureCount} failed
                    </span>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-2">
                    <Label className="text-xs">Signing secret</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                        {revealed[hook._id]
                          ? hook.secret
                          : "whsec_" + "•".repeat(24)}
                      </code>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Reveal secret"
                        onClick={() =>
                          setRevealed((current) => ({
                            ...current,
                            [hook._id]: !current[hook._id],
                          }))
                        }
                      >
                        <HugeiconsIcon
                          icon={revealed[hook._id] ? ViewOffIcon : ViewIcon}
                          strokeWidth={2}
                        />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Copy secret"
                        onClick={async () => {
                          await navigator.clipboard.writeText(hook.secret);
                          toast.add({ title: "Secret copied" });
                        }}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Rotate secret"
                        onClick={() =>
                          guard(
                            () => rotateSecret({ webhookId: hook._id }),
                            "Secret rotated",
                          )
                        }
                      >
                        <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each request carries{" "}
                      <code className="font-mono">x-magicforms-signature</code>, an
                      HMAC-SHA256 of{" "}
                      <code className="font-mono">timestamp + &quot;.&quot; + body</code>.
                    </p>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      guard(
                        () => sendTest({ webhookId: hook._id }),
                        "Test delivery queued",
                      )
                    }
                  >
                    <HugeiconsIcon icon={Sent02Icon} strokeWidth={2} />
                    Send test event
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ===== deliveries ===== */}
        <TabsContent value="deliveries" className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
            {deliveries === undefined && (
              <div className="flex flex-col gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-11 w-full" />
                ))}
              </div>
            )}

            {deliveries?.length === 0 && (
              <Empty className="flex-1">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Sent02Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No deliveries yet</EmptyTitle>
                  <EmptyDescription>
                    Once an event fires, every attempt shows up here with its
                    status code and response.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {deliveries && deliveries.length > 0 && (
              <Card className="min-w-0 py-0">
                <CardContent className="min-w-0 px-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Event</TableHead>
                          <TableHead className="hidden sm:table-cell">Webhook</TableHead>
                          <TableHead className="w-24">Status</TableHead>
                          <TableHead className="hidden w-20 md:table-cell">Took</TableHead>
                          <TableHead className="w-24">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveries.map((delivery) => (
                          <TableRow key={delivery._id}>
                            <TableCell className="font-mono text-xs">
                              {delivery.event}
                              {delivery.attempt > 1 && (
                                <span className="ml-1 text-muted-foreground">
                                  (attempt {delivery.attempt})
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="hidden max-w-40 truncate sm:table-cell">
                              {delivery.webhookName}
                            </TableCell>
                            <TableCell>
                              {delivery.status === "success" ? (
                                <Badge variant="secondary">
                                  {delivery.statusCode ?? 200}
                                </Badge>
                              ) : delivery.status === "pending" ? (
                                <Badge variant="outline">pending</Badge>
                              ) : (
                                <Badge variant="destructive" title={delivery.error ?? ""}>
                                  {delivery.statusCode ?? "error"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                              {delivery.durationMs !== null
                                ? delivery.durationMs + "ms"
                                : "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatWhen(delivery.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- create / edit ---- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <WebhookForm
            key={editingHook?._id ?? "new"}
            initial={editingHook}
            forms={(forms ?? []).map((f) => ({ _id: f._id, title: f.title }))}
            onCancel={() => {
              setDialogOpen(false);
              setEditing(null);
            }}
            onSubmit={async (values) => {
              if (editingHook) {
                await guard(
                  () =>
                    updateWebhook({
                      webhookId: editingHook._id,
                      name: values.name,
                      url: values.url,
                      events: values.events,
                      formId: values.formId,
                    }),
                  "Webhook updated",
                );
              } else {
                await guard(
                  () =>
                    createWebhook({
                      workspaceId,
                      name: values.name,
                      url: values.url,
                      events: values.events,
                      formId: values.formId ?? undefined,
                    }),
                  "Webhook created",
                );
              }
              setDialogOpen(false);
              setEditing(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* ---- delete ---- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Events stop being delivered immediately and the delivery history for
              this endpoint is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDelete) {
                  await guard(
                    () => removeWebhook({ webhookId: pendingDelete }),
                    "Webhook deleted",
                  );
                }
                setPendingDelete(null);
              }}
            >
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------

type WebhookFormValues = {
  name: string;
  url: string;
  events: WebhookEvent[];
  formId: Id<"forms"> | null;
};

function WebhookForm({
  initial,
  forms,
  onSubmit,
  onCancel,
}: {
  initial: {
    _id: Id<"webhooks">;
    name: string;
    url: string;
    events: WebhookEvent[];
    formId: Id<"forms"> | null;
  } | null;
  forms: { _id: Id<"forms">; title: string }[];
  onSubmit: (values: WebhookFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [url, setUrl] = React.useState(initial?.url ?? "");
  const [events, setEvents] = React.useState<WebhookEvent[]>(
    initial?.events ?? ["submission.created"],
  );
  const [formId, setFormId] = React.useState<string>(initial?.formId ?? "");
  const [saving, setSaving] = React.useState(false);

  /**
   * Scope options, with `null` standing for the whole workspace. Base UI counts
   * an empty string as *nothing selected* and would show a placeholder, so the
   * "every form" choice has to be a null-valued item with its own label — then
   * the trigger reads it back instead of falling through to placeholder text.
   */
  const scopeItems = React.useMemo(
    () => [
      { value: null as string | null, label: "Every form in the workspace" },
      ...forms.map((form) => ({
        value: form._id as string | null,
        label: "Only: " + form.title,
      })),
    ],
    [forms],
  );

  function toggle(event: WebhookEvent, on: boolean) {
    setEvents((current) =>
      on ? [...current, event] : current.filter((item) => item !== event),
    );
  }

  return (
    <form
      className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit({
          name,
          url,
          events,
          formId: formId === "" ? null : (formId as Id<"forms">),
        });
        setSaving(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial ? "Edit webhook" : "New webhook"}</DialogTitle>
        <DialogDescription>
          Magic Forms POSTs a signed JSON payload to this URL for each event you
          pick.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hook-name">Name</Label>
        <Input
          id="hook-name"
          required
          placeholder="Slack notifications"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hook-url">Endpoint URL</Label>
        <Input
          id="hook-url"
          required
          type="url"
          placeholder="https://example.com/hooks/magic-forms"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hook-form">Scope</Label>
        <Select
          items={scopeItems}
          value={formId === "" ? null : formId}
          onValueChange={(next) => setFormId(next === null ? "" : String(next))}
        >
          {/* Workspace-wide is a real scope, not an unanswered field, so it
              keeps the normal text colour Base UI mutes for a null value. */}
          <SelectTrigger
            id="hook-form"
            className="w-full data-placeholder:text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scopeItems.map((item) => (
              <SelectItem key={item.value ?? "all"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Events</Label>
        <div className="flex flex-col gap-1.5">
          {EVENTS.map((event) => (
            <Label
              key={event.value}
              className="flex items-start gap-2.5 rounded-lg border p-2.5 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
            >
              <Checkbox
                className="mt-0.5"
                checked={events.includes(event.value)}
                onCheckedChange={(on) => toggle(event.value, on)}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <code className="font-mono text-xs">{event.label}</code>
                <span className="text-xs text-muted-foreground">{event.hint}</span>
              </span>
            </Label>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || events.length === 0}>
          {saving ? "Saving…" : initial ? "Save webhook" : "Create webhook"}
        </Button>
      </DialogFooter>
    </form>
  );
}
