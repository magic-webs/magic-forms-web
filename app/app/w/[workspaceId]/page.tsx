"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Analytics01Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Link03Icon,
  Note04Icon,
  ViewIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen } from "@/lib/format";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function WorkspaceOverviewPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const stats = useQuery(api.workspaces.stats, { workspaceId });

  const directoryUrl =
    typeof window !== "undefined" && workspace
      ? `${window.location.origin}/w/${workspace.slug}`
      : "";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">
          {workspace?.name ?? "Workspace"}
        </span>
        <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">
          Overview
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button nativeButton={false}
            size="sm"
            render={<Link href={`/app/w/${workspaceId}/forms`} />}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            <span className="hidden sm:inline">New form</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* ---- share links ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={Link03Icon}
                className="size-4 text-primary"
                strokeWidth={2}
              />
              Workspace link
            </CardTitle>
            <CardDescription>
              One URL that lists every published form in this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {directoryUrl || "…"}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(directoryUrl);
                  toast.add({ title: "Workspace link copied" });
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                Copy
              </Button>
              {workspace && (
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={`/w/${workspace.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                  Open
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---- stats ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Forms", value: stats?.formCount, icon: Note04Icon, hint: stats ? `${stats.publishedCount} published` : "" },
            { label: "Submissions", value: stats?.totalSubmissions, icon: CheckmarkCircle02Icon, hint: stats ? `${stats.unreadCount} unread` : "" },
            { label: "Views", value: stats?.totalViews, icon: ViewIcon, hint: stats ? `${stats.conversionRate}% completion` : "" },
            { label: "Active webhooks", value: stats?.webhookCount, icon: WebhookIcon, hint: "enabled" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="gap-1">
                <div className="flex items-center justify-between">
                  <CardDescription>{stat.label}</CardDescription>
                  <HugeiconsIcon
                    icon={stat.icon}
                    className="size-4 text-muted-foreground"
                    strokeWidth={2}
                  />
                </div>
                {stat.value === undefined ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <CardTitle className="text-2xl tabular-nums">
                    {stat.value}
                  </CardTitle>
                )}
                <p className="text-xs text-muted-foreground">{stat.hint}</p>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* ---- recent submissions ---- */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Recent responses</CardTitle>
            <CardDescription>
              The latest submissions across every form in this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {stats === undefined ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : stats.recentSubmissions.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No responses yet</EmptyTitle>
                  <EmptyDescription>
                    Publish a form and share its link — responses appear here in
                    real time.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Form</TableHead>
                      <TableHead className="hidden sm:table-cell">Source</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentSubmissions.map((submission) => (
                      <TableRow key={submission._id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/app/w/${workspaceId}/forms/${submission.formId}/responses`}
                            className="hover:underline"
                          >
                            {submission.formTitle}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="font-mono text-[0.7rem]">
                            {submission.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatWhen(submission.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {submission.read ? (
                            <Badge variant="outline">Read</Badge>
                          ) : (
                            <Badge>New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- quick links ---- */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              href: `/app/w/${workspaceId}/forms`,
              title: "Build a form",
              body: "Add steps and fields, then publish.",
              icon: Note04Icon,
            },
            {
              href: `/app/w/${workspaceId}/webhooks`,
              title: "Wire up webhooks",
              body: "Push every event to your own endpoint.",
              icon: WebhookIcon,
            },
            {
              href: `/app/w/${workspaceId}/api`,
              title: "Use the API",
              body: "Read schemas and pull responses.",
              icon: Analytics01Icon,
            },
          ].map((item) => (
            <Card key={item.href} className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <HugeiconsIcon
                    icon={item.icon}
                    className="size-4 text-primary"
                    strokeWidth={2}
                  />
                  <HugeiconsIcon
                    icon={ArrowRight02Icon}
                    className="size-4 text-muted-foreground"
                    strokeWidth={2}
                  />
                </div>
                <CardTitle className="mt-2 text-sm">
                  <Link href={item.href} className="block">
                    {item.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-xs">{item.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
