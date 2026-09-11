"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Delete02Icon,
  Download01Icon,
  Note04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatDateTime, formatWhen, readError } from "@/lib/format";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

function readableValue(raw: string, isList: boolean): string {
  if (!isList) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.join(", ") : raw;
  } catch {
    return raw;
  }
}

export default function ResponsesPage() {
  const params = useParams<{ workspaceId: string; formId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;
  const formId = params.formId as Id<"forms">;
  const convex = useConvex();

  const form = useQuery(api.forms.getWithSchema, { formId });
  const columns = useQuery(api.submissions.columnsForForm, { formId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.submissions.listByForm,
    { formId },
    { initialNumItems: 25 },
  );

  const markRead = useMutation(api.submissions.markRead);
  const removeSubmission = useMutation(api.submissions.remove);

  const [openId, setOpenId] = React.useState<Id<"submissions"> | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Id<"submissions"> | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const detail = useQuery(
    api.submissions.get,
    openId ? { submissionId: openId } : "skip",
  );

  async function onExport() {
    setExporting(true);
    try {
      const result = await convex.query(api.submissions.exportCsv, { formId });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (form?.form.slug ?? "responses") + ".csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.add({
        title: "CSV downloaded",
        description: result.truncated
          ? "Capped at the 5,000 most recent responses."
          : undefined,
      });
    } catch (caught) {
      toast.add({
        title: "Export failed",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  }

  const visibleColumns = (columns ?? []).slice(0, 4);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <Button nativeButton={false}
          variant="ghost"
          size="icon-sm"
          aria-label="Back to the form"
          render={<Link href={`/app/w/${workspaceId}/forms/${formId}`} />}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} />
        </Button>
        <span className="truncate text-sm font-medium">
          {form?.form.title ?? "Responses"}
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {form?.form.submissionCount ?? 0}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || results.length === 0}
            onClick={onExport}
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
            <span className="hidden sm:inline">
              {exporting ? "Exporting…" : "Export CSV"}
            </span>
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        {status === "LoadingFirstPage" && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-11 w-full" />
            ))}
          </div>
        )}

        {status !== "LoadingFirstPage" && results.length === 0 && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No responses yet</EmptyTitle>
              <EmptyDescription>
                Publish the form and share its link. Responses appear here the
                moment they arrive.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false}
                variant="outline"
                render={<Link href={`/app/w/${workspaceId}/forms/${formId}`} />}
              >
                Back to the builder
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {results.length > 0 && (
          <Card className="min-w-0 py-0">
            <CardContent className="min-w-0 px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Received</TableHead>
                      {visibleColumns.map((column) => (
                        <TableHead key={column.key} className="min-w-32">
                          {column.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-20">Source</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((submission) => (
                      <TableRow
                        key={submission._id}
                        className={submission.read ? undefined : "font-medium"}
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {!submission.read && (
                              <span
                                aria-label="Unread"
                                className="size-1.5 shrink-0 rounded-full bg-primary"
                              />
                            )}
                            {formatWhen(submission.createdAt)}
                          </span>
                        </TableCell>
                        {visibleColumns.map((column) => (
                          <TableCell key={column.key} className="max-w-48 truncate">
                            {column.type === "file"
                              ? (submission.files.find((f) => f.key === column.key)
                                  ?.name ?? "—")
                              : readableValue(
                                  submission.data[column.key] ?? "",
                                  column.isList,
                                ) || "—"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[0.7rem]">
                            {submission.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="View response"
                              onClick={() => {
                                setOpenId(submission._id);
                                if (!submission.read) {
                                  markRead({
                                    submissionId: submission._id,
                                    read: true,
                                  }).catch(() => {});
                                }
                              }}
                            >
                              <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete response"
                              onClick={() => setPendingDelete(submission._id)}
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
            </CardContent>
          </Card>
        )}

        {status === "CanLoadMore" && (
          <Button variant="outline" className="self-center" onClick={() => loadMore(25)}>
            Load more responses
          </Button>
        )}
        {status === "LoadingMore" && (
          <Skeleton className="h-9 w-40 self-center" />
        )}
      </div>

      {/* ---- single response ---- */}
      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Response</SheetTitle>
            <SheetDescription>
              {detail ? formatDateTime(detail._creationTime) : "Loading…"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-6">
            {detail === undefined && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {detail && (
              <>
                <div className="flex flex-col gap-3">
                  {(columns ?? []).map((column) => {
                    const files = detail.files.filter((f) => f.key === column.key);
                    const raw = detail.data[column.key] ?? "";
                    return (
                      <div key={column.key} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {column.label}
                        </span>
                        {column.type === "file" ? (
                          files.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {files.map((file) => (
                                <a
                                  key={file.storageId}
                                  href={file.url ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-sm text-primary hover:underline"
                                >
                                  {file.name} ({Math.round(file.size / 1024)} KB)
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="text-sm break-words whitespace-pre-wrap">
                            {readableValue(raw, column.isList) || "—"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Separator />

                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Source</span>
                    <Badge variant="outline" className="font-mono text-[0.7rem]">
                      {detail.source}
                    </Badge>
                  </div>
                  {detail.referrer && (
                    <p className="break-all">
                      <span className="font-medium">Referrer</span> {detail.referrer}
                    </p>
                  )}
                  {detail.userAgent && (
                    <p className="break-all">
                      <span className="font-medium">User agent</span> {detail.userAgent}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      markRead({ submissionId: detail._id, read: !detail.read })
                    }
                  >
                    Mark as {detail.read ? "unread" : "read"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setPendingDelete(detail._id);
                      setOpenId(null);
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---- delete confirmation ---- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this response?</AlertDialogTitle>
            <AlertDialogDescription>
              The answers and any uploaded files are removed permanently, and a
              `submission.deleted` webhook fires.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await removeSubmission({ submissionId: pendingDelete });
                  toast.add({ title: "Response deleted" });
                } catch (caught) {
                  toast.add({
                    title: "Could not delete",
                    description: readError(caught),
                    type: "error",
                  });
                }
                setPendingDelete(null);
              }}
            >
              Delete response
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
