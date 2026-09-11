"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Note04Icon } from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen } from "@/lib/format";
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

export default function WorkspaceResponsesPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const { results, status, loadMore } = usePaginatedQuery(
    api.submissions.listByWorkspace,
    { workspaceId },
    { initialNumItems: 30 },
  );

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">All responses</span>
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        {status === "LoadingFirstPage" && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((n) => (
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
              <EmptyTitle>Nothing has come in yet</EmptyTitle>
              <EmptyDescription>
                Responses from every form in this workspace collect here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" render={<Link href={`/app/w/${workspaceId}/forms`} />}>
                Go to forms
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
                      <TableHead>Form</TableHead>
                      <TableHead className="hidden md:table-cell">Preview</TableHead>
                      <TableHead className="w-28">Received</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead className="w-16 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((submission) => (
                      <TableRow key={submission._id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/app/w/${workspaceId}/forms/${submission.formId}/responses`}
                            className="hover:underline"
                          >
                            {submission.formTitle}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">
                          {submission.preview || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatWhen(submission.createdAt)}
                        </TableCell>
                        <TableCell>
                          {submission.read ? (
                            <Badge variant="outline">Read</Badge>
                          ) : (
                            <Badge>New</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button nativeButton={false}
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Open form responses"
                            render={
                              <Link
                                href={`/app/w/${workspaceId}/forms/${submission.formId}/responses`}
                              />
                            }
                          >
                            <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
                          </Button>
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
          <Button variant="outline" className="self-center" onClick={() => loadMore(30)}>
            Load more
          </Button>
        )}
      </div>
    </>
  );
}
