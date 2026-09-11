"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AiBrain01Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
  LockIcon,
  MinusSignIcon,
  RobotIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen, readError } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

const subscribeToNothing = () => () => {};
const readOrigin = () => window.location.origin;
const readOriginDuringServerRender = () => "";

/** Mirrors the RANK ladder in convex/lib/authz.ts. */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

const ROLE_BLURB: Record<string, string> = {
  viewer:
    "Read-only. It can list forms and read responses, but cannot change anything.",
  editor:
    "It can build, publish and edit forms and work with responses, but cannot touch members, webhooks or keys.",
  admin:
    "It can do everything in this workspace except delete the workspace itself.",
  owner:
    "Everything, including deleting the workspace and everything inside it.",
};

/**
 * What each group of tools needs, taken from the role each Convex function
 * actually enforces — `delete_form` is an admin action, not an editor one.
 */
const MCP_CAPABILITIES = [
  {
    needs: "viewer",
    label: "Read",
    tools:
      "whoami, list_workspaces, get_workspace, list_forms, get_form, list_members, list_responses, export_responses_csv, list_webhooks, list_webhook_deliveries",
  },
  {
    needs: "editor",
    label: "Build forms",
    tools:
      "build_form, create_form, update_form, set_form_status, duplicate_form, add_step, add_field, update_field, remove_field",
  },
  {
    needs: "admin",
    label: "Manage the workspace",
    tools:
      "delete_form, update_workspace, add_member, update_member_role, remove_member, create_webhook, update_webhook, test_webhook, remove_webhook, list_api_keys, create_api_key, revoke_api_key",
  },
  {
    needs: "owner",
    label: "Delete the workspace",
    tools: "archive_workspace",
  },
];

export default function ApiKeysPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const roleKnown = workspace !== undefined && workspace !== null;
  const canManageKeys =
    roleKnown && ROLE_RANK[workspace.role] >= ROLE_RANK.admin;
  // Skipped rather than guarded in the markup: apiKeys.listByWorkspace requires
  // the admin role and throws for anyone below it, which took down the page.
  const keys = useQuery(
    api.apiKeys.listByWorkspace,
    canManageKeys ? { workspaceId } : "skip",
  );
  const createKey = useAction(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);
  const removeKey = useMutation(api.apiKeys.remove);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<string | null>(null);

  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
  const slug = workspace?.slug ?? "your-workspace";

  // `window` does not exist during the server render and the origin never
  // changes once it does, so React hydrates against the server snapshot and
  // swaps in the real value — no state to keep and no effect to run.
  const origin = React.useSyncExternalStore(
    subscribeToNothing,
    readOrigin,
    readOriginDuringServerRender,
  );

  const me = useQuery(api.auth.me);
  const role = workspace?.role ?? "viewer";

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "magic-forms": {
          command: "node",
          args: ["/path/to/magic-forms-web/mcp/server.mjs"],
          env: {
            MAGIC_FORMS_EMAIL: "agent@yourcompany.com",
            MAGIC_FORMS_PASSWORD: "the agent account password",
            MAGIC_FORMS_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
            NEXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
            MAGIC_FORMS_APP_URL: origin || "http://localhost:3000",
          },
        },
      },
    },
    null,
    2,
  );

  const endpoints = [
    {
      method: "GET",
      path: `/api/v1/forms/${slug}`,
      body: "Lists every published form in the workspace.",
      auth: false,
    },
    {
      method: "GET",
      path: `/api/v1/forms/${slug}/{formSlug}`,
      body: "Returns a form's steps, fields, options and validation rules.",
      auth: false,
    },
    {
      method: "POST",
      path: `/api/v1/submit/${slug}/{formSlug}`,
      body: "Creates a submission. Same validation as the hosted form.",
      auth: false,
    },
    {
      method: "GET",
      path: "/api/v1/submissions?form={formSlug}&limit=50",
      body: "Reads stored responses for this workspace.",
      auth: true,
    },
  ];

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">API keys</span>
        {canManageKeys && (
          <Button size="sm" className="ml-auto" onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            <span className="hidden sm:inline">New key</span>
          </Button>
        )}
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        {/* ---- endpoints ---- */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon icon={CodeIcon} className="size-4 text-primary" strokeWidth={2} />
              Endpoints
            </CardTitle>
            <CardDescription>
              Base URL <code className="font-mono">{siteUrl}</code>. CORS is open,
              so a browser can call the read and submit endpoints directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            {endpoints.map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={endpoint.method === "GET" ? "secondary" : "default"}
                    className="font-mono text-[0.7rem]"
                  >
                    {endpoint.method}
                  </Badge>
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {endpoint.path}
                  </code>
                  {endpoint.auth && (
                    <Badge variant="outline" className="gap-1">
                      <HugeiconsIcon icon={LockIcon} className="size-3" strokeWidth={2} />
                      key
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy endpoint"
                    onClick={async () => {
                      await navigator.clipboard.writeText(siteUrl + endpoint.path);
                      toast.add({ title: "Endpoint copied" });
                    }}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{endpoint.body}</p>
              </div>
            ))}

            <div className="overflow-x-auto rounded-lg bg-muted">
              <pre className="p-3 text-xs leading-6">
                <code className="font-mono">{`curl -X POST \\
  ${siteUrl}/api/v1/submit/${slug}/{formSlug} \\
  -H 'content-type: application/json' \\
  -d '{ "full_name": "Ada Lovelace", "use_cases": ["Onboarding"] }'`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* ---- keys ---- */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon icon={Key01Icon} className="size-4 text-primary" strokeWidth={2} />
              Keys
            </CardTitle>
            <CardDescription>
              Only a SHA-256 digest is stored, so a key can never be shown again
              after it is created.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {(!roleKnown || (canManageKeys && keys === undefined)) && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            )}

            {roleKnown && !canManageKeys && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={LockIcon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Admins and owners only</EmptyTitle>
                  <EmptyDescription>
                    API keys read every response in the workspace, so only the
                    admin and owner roles can see or create them. You are {role}
                    here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {keys?.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No API keys yet</EmptyTitle>
                  <EmptyDescription>
                    Create a key to read stored responses over HTTP.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setDialogOpen(true)}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                    Create a key
                  </Button>
                </EmptyContent>
              </Empty>
            )}

            {keys && keys.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead className="hidden sm:table-cell">Last used</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((key) => (
                      <TableRow key={key._id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {key.name}
                            {key.revoked && <Badge variant="outline">revoked</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {key.prefix}…
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {key.lastUsedAt ? formatWhen(key.lastUsedAt) : "never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!key.revoked && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={async () => {
                                  try {
                                    await revokeKey({ apiKeyId: key._id });
                                    toast.add({ title: "Key revoked" });
                                  } catch (caught) {
                                    toast.add({
                                      title: "Could not revoke",
                                      description: readError(caught),
                                      type: "error",
                                    });
                                  }
                                }}
                              >
                                Revoke
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete key"
                              onClick={async () => {
                                try {
                                  await removeKey({ apiKeyId: key._id });
                                  toast.add({ title: "Key deleted" });
                                } catch (caught) {
                                  toast.add({
                                    title: "Could not delete",
                                    description: readError(caught),
                                    type: "error",
                                  });
                                }
                              }}
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- MCP ---- */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={AiBrain01Icon}
                className="size-4 text-primary"
                strokeWidth={2}
              />
              AI agents
            </CardTitle>
            <CardDescription>
              Connect an agent over the Model Context Protocol. It signs in as a
              Magic Forms account instead of carrying an API key, so it can do
              exactly what that account can do here and nothing more.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <Alert>
              <HugeiconsIcon icon={RobotIcon} className="size-4" strokeWidth={2} />
              <AlertTitle>
                An agent signed in as you would be {role} in this workspace
              </AlertTitle>
              <AlertDescription>
                {ROLE_BLURB[role]}
                {me?.role === "admin" &&
                  " You are platform staff as well, so it would also get the admin_* tools: provisioning companies and workspaces, and managing accounts."}
              </AlertDescription>
            </Alert>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Client configuration</Label>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(mcpConfig);
                    toast.add({ title: "Configuration copied" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  Copy
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg bg-muted">
                <pre className="p-3 text-xs leading-6">
                  <code className="font-mono">{mcpConfig}</code>
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                Point <code className="font-mono">args</code> at your checkout and
                restart the client. Give the agent its own account rather than
                your sign-in, and add it here at the lowest role that does the
                job.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <Label>What it could do as you</Label>
              {MCP_CAPABILITIES.map((capability) => {
                const allowed =
                  ROLE_RANK[role] >= ROLE_RANK[capability.needs];
                return (
                  <div
                    key={capability.needs}
                    className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <HugeiconsIcon
                        icon={allowed ? CheckmarkCircle02Icon : MinusSignIcon}
                        className={
                          allowed
                            ? "size-4 shrink-0 text-primary"
                            : "size-4 shrink-0 text-muted-foreground"
                        }
                        strokeWidth={2}
                      />
                      <span className="text-sm font-medium">
                        {capability.label}
                      </span>
                      <span className="sr-only">
                        {allowed
                          ? "available at your role"
                          : "not available at your role"}
                      </span>
                      <Badge variant="outline" className="ml-auto">
                        {capability.needs}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs break-words text-muted-foreground">
                      {capability.tools}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- create key ---- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setIssued(null);
            setName("");
          }
        }}
      >
        <DialogContent>
          {issued ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Copy your API key</DialogTitle>
                <DialogDescription>
                  This is the only time it will be shown.
                </DialogDescription>
              </DialogHeader>

              <Alert>
                <HugeiconsIcon icon={LockIcon} className="size-4" strokeWidth={2} />
                <AlertTitle>Store it somewhere safe</AlertTitle>
                <AlertDescription>
                  Magic Forms keeps only a hash — we cannot recover this value.
                </AlertDescription>
              </Alert>

              <code className="break-all rounded-lg bg-muted px-3 py-2.5 font-mono text-xs">
                {issued}
              </code>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(issued);
                    toast.add({ title: "API key copied" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  Copy key
                </Button>
                <Button
                  onClick={() => {
                    setIssued(null);
                    setName("");
                    setDialogOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setCreating(true);
                try {
                  const result = await createKey({ workspaceId, name });
                  setIssued(result.apiKey);
                } catch (caught) {
                  toast.add({
                    title: "Could not create key",
                    description: readError(caught),
                    type: "error",
                  });
                } finally {
                  setCreating(false);
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>New API key</DialogTitle>
                <DialogDescription>
                  Keys can read submissions for this workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  required
                  placeholder="Analytics pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
