"use client";

import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AiBrain01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  LockIcon,
  Time04Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen, readError } from "@/lib/format";
import { AdminHeader } from "@/components/admin-header";
import { CategoryChart, StatCard } from "@/components/admin-stats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const DAY = 24 * 60 * 60 * 1000;

const subscribeToNothing = () => () => {};
const readOrigin = () => window.location.origin;
const readOriginDuringServerRender = () => "";

/** Buckets a token's last use into something a chart can show. */
function usageBucket(lastUsedAt: number | null, now: number): string {
  if (lastUsedAt === null) return "Never used";
  const age = now - lastUsedAt;
  if (age < DAY) return "Today";
  if (age < 7 * DAY) return "This week";
  if (age < 30 * DAY) return "This month";
  return "Older";
}

const BUCKET_ORDER = [
  "Today",
  "This week",
  "This month",
  "Older",
  "Never used",
];

export default function AdminMcpPage() {
  const tokens = useQuery(api.admin.listMcpTokens, {});
  const createPlatformToken = useAction(api.admin.createPlatformMcpToken);
  const revokeToken = useMutation(api.mcpTokens.revoke);
  const removeToken = useMutation(api.mcpTokens.remove);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{
    _id: Id<"mcpTokens">;
    name: string;
  } | null>(null);

  // The origin is only knowable in the browser, and never changes once it is,
  // so React hydrates against the server snapshot and swaps in the real value.
  const origin = React.useSyncExternalStore(
    subscribeToNothing,
    readOrigin,
    readOriginDuringServerRender,
  );

  // Bucketing "last used" needs a clock, but only to the day, so reading it
  // once on mount is enough and keeps the render deterministic.
  const [now] = React.useState(() => Date.now());

  const mine = tokens?.filter((token) => token.isYours && token.isPlatform);
  const live = mine?.filter((token) => !token.revoked) ?? [];

  const usage = React.useMemo(() => {
    if (!tokens) return undefined;
    const counts = new Map(BUCKET_ORDER.map((label) => [label, 0]));
    for (const token of tokens) {
      if (token.revoked) continue;
      const bucket = usageBucket(token.lastUsedAt, now);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return BUCKET_ORDER.map((label) => ({
      label,
      value: counts.get(label) ?? 0,
    }));
  }, [tokens, now]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await createPlatformToken({
        name: name.trim() || undefined,
      });
      setIssued(result.token);
      setCreateOpen(false);
      setName("");
    } catch (caught) {
      toast.add({
        title: "Could not create the endpoint",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function guard(action: () => Promise<unknown>, successTitle: string) {
    try {
      await action();
      toast.add({ title: successTitle });
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
      <AdminHeader title="MCP">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          <span className="hidden sm:inline">New platform endpoint</span>
          <span className="sm:hidden">New</span>
        </Button>
      </AdminHeader>

      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* ---- the admin's own endpoint ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={AiBrain01Icon}
                className="size-4 text-primary"
                strokeWidth={2}
              />
              Your platform endpoint
            </CardTitle>
            <CardDescription>
              An MCP endpoint that belongs to no single workspace. It acts as
              your account, so it carries the platform <code>admin_*</code>{" "}
              tools — provisioning companies, listing every account, disabling
              one — on top of everything an ordinary token can do. Convex
              re-checks your role on every call.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {mine === undefined ? (
              <Skeleton className="h-16 w-full" />
            ) : live.length === 0 ? (
              <Empty className="border border-dashed py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No platform endpoint yet</EmptyTitle>
                  <EmptyDescription>
                    Create one to point Claude, or any MCP client that speaks
                    HTTP, at the whole platform.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              live.map((token) => (
                <div
                  key={token._id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {token.name}
                    </span>
                    <code className="truncate font-mono text-xs text-muted-foreground">
                      {origin}/api/mcp/{token.prefix}…
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {token.lastUsedAt
                        ? `used ${formatWhen(token.lastUsedAt)}`
                        : "never used"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        guard(
                          () => revokeToken({ tokenId: token._id }),
                          "Endpoint revoked",
                        )
                      }
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              The full URL is shown once, when the endpoint is created. Only a
              SHA-256 digest is stored, so it cannot be recovered afterwards —
              only replaced.
            </p>
          </CardContent>
        </Card>

        {/* ---- headline numbers ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Live tokens"
            value={tokens?.filter((token) => !token.revoked).length}
            hint="agents with standing access"
            icon={AiBrain01Icon}
          />
          <StatCard
            label="Platform tokens"
            value={
              tokens?.filter((token) => token.isPlatform && !token.revoked)
                .length
            }
            hint="not tied to a workspace"
            icon={LockIcon}
          />
          <StatCard
            label="Used this week"
            value={
              tokens?.filter(
                (token) =>
                  !token.revoked &&
                  token.lastUsedAt !== null &&
                  now - token.lastUsedAt < 7 * DAY,
              ).length
            }
            hint="called the endpoint recently"
            icon={Time04Icon}
          />
          <StatCard
            label="Revoked"
            value={tokens?.filter((token) => token.revoked).length}
            hint="no longer usable"
            icon={Cancel01Icon}
          />
        </div>

        <CategoryChart
          title="Agent activity"
          description="Live tokens, by when they last called the endpoint"
          data={usage}
          valueLabel="Tokens"
        />

        {/* ---- every token on the platform ---- */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Token registry</h2>
            <p className="text-xs text-muted-foreground">
              Every MCP token on the platform. A token acts as the account that
              created it, so this is the list of standing agent access —
              revoking one cuts it off within a minute.
            </p>
          </div>

          <Card className="min-w-0 py-0">
            <CardContent className="min-w-0 px-0">
              {tokens === undefined ? (
                <div className="flex flex-col gap-2 p-4">
                  {[0, 1, 2].map((n) => (
                    <Skeleton key={n} className="h-12 w-full" />
                  ))}
                </div>
              ) : tokens.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No agent has been given access yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Acts as
                        </TableHead>
                        <TableHead className="hidden w-40 md:table-cell">
                          Scope
                        </TableHead>
                        <TableHead className="w-28">Last used</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.map((token) => (
                        <TableRow key={token._id}>
                          <TableCell>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-medium">
                                {token.name}
                              </span>
                              <code className="truncate font-mono text-xs text-muted-foreground">
                                {token.prefix}… · created{" "}
                                {formatWhen(token.createdAt)}
                              </code>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex min-w-0 flex-col">
                              <span className="flex items-center gap-1.5 truncate text-sm">
                                {token.ownerName}
                                {token.ownerIsAdmin && (
                                  <Badge variant="secondary">staff</Badge>
                                )}
                                {token.ownerDisabled && (
                                  <Badge variant="outline">disabled</Badge>
                                )}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {token.ownerEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden truncate text-sm text-muted-foreground md:table-cell">
                            {token.isPlatform
                              ? "Platform"
                              : (token.workspaceName ?? "Deleted workspace")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {token.lastUsedAt
                              ? formatWhen(token.lastUsedAt)
                              : "never"}
                          </TableCell>
                          <TableCell>
                            {token.revoked ? (
                              <Badge variant="outline">revoked</Badge>
                            ) : (
                              <Badge variant="secondary">live</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {!token.revoked && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Revoke ${token.name}`}
                                  onClick={() =>
                                    guard(
                                      () =>
                                        revokeToken({ tokenId: token._id }),
                                      "Token revoked",
                                    )
                                  }
                                >
                                  <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    strokeWidth={2}
                                  />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${token.name}`}
                                onClick={() =>
                                  setPendingDelete({
                                    _id: token._id,
                                    name: token.name,
                                  })
                                }
                              >
                                <HugeiconsIcon
                                  icon={Delete02Icon}
                                  strokeWidth={2}
                                />
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
        </div>
      </div>

      {/* ---- create ---- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New platform endpoint</DialogTitle>
              <DialogDescription>
                It acts as your staff account, so it can reach every workspace
                on the platform. Hand it only to an agent you would trust with
                your own sign-in.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                placeholder="Platform agent"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create endpoint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- the one time the URL is shown ---- */}
      <Dialog open={issued !== null} onOpenChange={() => setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your platform endpoint</DialogTitle>
            <DialogDescription>
              Copy it now — this is the only time it is shown.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <HugeiconsIcon icon={LockIcon} strokeWidth={2} />
            <AlertTitle>Treat this like a password</AlertTitle>
            <AlertDescription>
              Anyone holding this URL has your platform access. Prefer a client
              that sends it as an <code>Authorization: Bearer</code> header,
              since URLs end up in logs.
            </AlertDescription>
          </Alert>

          <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
            {origin}/api/mcp/{issued}
          </code>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${origin}/api/mcp/${issued}`,
                );
                toast.add({ title: "Endpoint URL copied" });
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              Copy URL
            </Button>
            <Button onClick={() => setIssued(null)}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- delete ---- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The endpoint stops working and the record disappears from this
              registry. Revoking instead keeps the row, which is usually what
              you want for an audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingDelete;
                if (!target) return;
                setPendingDelete(null);
                await guard(
                  () => removeToken({ tokenId: target._id }),
                  "Token deleted",
                );
              }}
            >
              Delete token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
