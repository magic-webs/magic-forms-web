"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon,
  Building02Icon,
  Note04Icon,
  UserMultiple02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen, readError } from "@/lib/format";
import { AdminHeader } from "@/components/admin-header";
import {
  bucketByDay,
  CategoryChart,
  DailyChart,
  RANGE_ITEMS,
  StatCard,
  useHourlyNow,
} from "@/components/admin-stats";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function AdminWorkspacesPage() {
  const [days, setDays] = React.useState<number>(30);
  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<{
    _id: Id<"workspaces">;
    name: string;
  } | null>(null);
  const now = useHourlyNow();

  const workspaces = useQuery(api.admin.listWorkspaces, {});
  const deleteWorkspace = useMutation(api.admin.deleteWorkspace);

  const created = React.useMemo(
    () =>
      workspaces &&
      bucketByDay(
        workspaces.map((workspace) => workspace.createdAt),
        now,
        days,
      ),
    [workspaces, now, days],
  );

  // The busiest tenants, which is what a platform operator actually looks for.
  const busiest = React.useMemo(
    () =>
      workspaces &&
      [...workspaces]
        .filter((workspace) => !workspace.archived)
        .sort((a, b) => b.submissionCount - a.submissionCount)
        .slice(0, 8)
        .map((workspace) => ({
          label: workspace.name,
          value: workspace.submissionCount,
        })),
    [workspaces],
  );

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!workspaces || !needle) return workspaces;
    return workspaces.filter((workspace) =>
      [
        workspace.name,
        workspace.slug,
        workspace.ownerName,
        workspace.ownerEmail,
      ].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [workspaces, search]);

  const active = workspaces?.filter((workspace) => !workspace.archived);

  return (
    <>
      <AdminHeader title="Workspaces">
        <Select
          items={RANGE_ITEMS}
          value={days}
          onValueChange={(next) => setDays(Number(next))}
        >
          <SelectTrigger aria-label="Date range" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_ITEMS.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AdminHeader>

      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* ---- headline numbers ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Workspaces"
            value={active?.length}
            hint="not archived"
            icon={Building02Icon}
          />
          <StatCard
            label={`New in ${days} days`}
            value={created?.reduce((n, row) => n + row.count, 0)}
            hint="created in this window"
            icon={Building02Icon}
          />
          <StatCard
            label="Forms"
            value={active?.reduce((n, w) => n + w.formCount, 0)}
            hint="across every workspace"
            icon={Note04Icon}
          />
          <StatCard
            label="Members"
            value={active?.reduce((n, w) => n + w.memberCount, 0)}
            hint="seats in use"
            icon={UserMultiple02Icon}
          />
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <DailyChart
            title="New workspaces"
            description={`Workspaces created per day, last ${days} days`}
            data={created}
            series={[{ key: "count", label: "Workspaces", slot: "orange" }]}
          />
          <CategoryChart
            title="Busiest workspaces"
            description="Responses received, all time — top 8"
            data={busiest}
            valueLabel="Responses"
            orientation="horizontal"
          />
        </div>

        {/* ---- the register ---- */}
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Search workspaces"
            placeholder="Search by workspace, slug or owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />

          <Card className="min-w-0 py-0">
            <CardContent className="min-w-0 px-0">
              {filtered === undefined ? (
                <div className="flex flex-col gap-2 p-4">
                  {[0, 1, 2].map((n) => (
                    <Skeleton key={n} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No workspace matches “{search}”.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workspace</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          Owner
                        </TableHead>
                        <TableHead className="w-20 text-center">
                          Forms
                        </TableHead>
                        <TableHead className="w-20 text-center">
                          Members
                        </TableHead>
                        <TableHead className="w-24 text-center">
                          Responses
                        </TableHead>
                        <TableHead className="w-24">Created</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((workspace) => (
                        <TableRow key={workspace._id}>
                          <TableCell>
                            <div className="flex min-w-0 flex-col">
                              <span className="flex items-center gap-2 truncate text-sm font-medium">
                                {workspace.name}
                                {workspace.archived && (
                                  <Badge variant="outline">archived</Badge>
                                )}
                              </span>
                              <code className="truncate font-mono text-xs text-muted-foreground">
                                /w/{workspace.slug}
                              </code>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm">
                                {workspace.ownerName}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {workspace.ownerEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {workspace.formCount}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {workspace.memberCount}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {workspace.submissionCount}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatWhen(workspace.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                nativeButton={false}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Open ${workspace.name}`}
                                render={
                                  <a
                                    href={`/w/${workspace.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  />
                                }
                              >
                                <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                              </Button>
                              {!workspace.archived && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Archive ${workspace.name}`}
                                  onClick={() =>
                                    setPendingDelete({
                                      _id: workspace._id,
                                      name: workspace.name,
                                    })
                                  }
                                >
                                  <HugeiconsIcon
                                    icon={Archive02Icon}
                                    strokeWidth={2}
                                  />
                                </Button>
                              )}
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

      {/* ---- archive + purge ---- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {pendingDelete?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The workspace is archived immediately, then its forms, responses,
              members, webhooks, API keys and agent tokens are deleted in the
              background. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingDelete;
                if (!target) return;
                setPendingDelete(null);
                try {
                  await deleteWorkspace({ workspaceId: target._id });
                  toast.add({
                    title: "Workspace archived",
                    description: target.name,
                  });
                } catch (caught) {
                  toast.add({
                    title: "Could not archive workspace",
                    description: readError(caught),
                    type: "error",
                  });
                }
              }}
            >
              Archive and purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
