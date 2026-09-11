"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon,
  Note04Icon,
  ShieldCheckIcon,
  UserMultiple02Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { formatWhen, initials, readError } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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

export default function AdminPage() {
  const me = useQuery(api.auth.me);
  const isAdmin = me?.role === "admin";

  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip");
  const users = useQuery(api.admin.listUsers, isAdmin ? {} : "skip");
  const workspaces = useQuery(api.admin.listWorkspaces, isAdmin ? {} : "skip");

  const setUserRole = useMutation(api.admin.setUserRole);
  const setUserDisabled = useMutation(api.admin.setUserDisabled);

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

  if (me !== undefined && !isAdmin) {
    return (
      <>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium">Admin console</span>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ShieldCheckIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>Administrators only</EmptyTitle>
              <EmptyDescription>
                This console is for Magic Forms platform staff. Your workspaces are
                unaffected.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Admin console</span>
        <Badge variant="secondary" className="ml-1">
          platform
        </Badge>
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* ---- platform stats ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Accounts",
              value: overview?.userCount,
              hint: overview ? overview.adminCount + " admins" : "",
              icon: UserMultiple02Icon,
            },
            {
              label: "Workspaces",
              value: overview?.workspaceCount,
              hint: "active",
              icon: Building02Icon,
            },
            {
              label: "Forms",
              value: overview?.formCount,
              hint: overview ? overview.publishedFormCount + " published" : "",
              icon: Note04Icon,
            },
            {
              label: "Submissions",
              value: overview?.submissionCount,
              hint: overview ? overview.viewCount + " views" : "",
              icon: WebhookIcon,
            },
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
                  <CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle>
                )}
                <p className="text-xs text-muted-foreground">{stat.hint}</p>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="min-w-0">
          <TabsList>
            <TabsTrigger value="users">Accounts</TabsTrigger>
            <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
          </TabsList>

          {/* ===== accounts ===== */}
          <TabsContent value="users" className="min-w-0">
            <Card className="min-w-0 py-0">
              <CardContent className="min-w-0 px-0">
                {users === undefined ? (
                  <div className="flex flex-col gap-2 p-4">
                    {[0, 1, 2].map((n) => (
                      <Skeleton key={n} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead className="hidden w-40 md:table-cell">Company</TableHead>
                          <TableHead className="w-16 text-center">Spaces</TableHead>
                          <TableHead className="w-32">Role</TableHead>
                          <TableHead className="w-24 text-right">Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user._id}>
                            <TableCell>
                              <div className="flex min-w-0 items-center gap-2.5">
                                <Avatar className="size-8">
                                  <AvatarFallback className="text-xs">
                                    {initials(user.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm font-medium">
                                    {user.name}
                                  </span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {user.email} · joined {formatWhen(user.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                              {user.company ?? "—"}
                            </TableCell>
                            <TableCell className="text-center tabular-nums">
                              {user.workspaceCount}
                            </TableCell>
                            <TableCell>
                              <NativeSelect
                                aria-label="Platform role"
                                value={user.role}
                                disabled={user._id === me?._id}
                                onChange={(e) =>
                                  guard(
                                    () =>
                                      setUserRole({
                                        userId: user._id,
                                        role: e.target.value as "admin" | "user",
                                      }),
                                    "Role updated",
                                  )
                                }
                              >
                                <NativeSelectOption value="user">User</NativeSelectOption>
                                <NativeSelectOption value="admin">Admin</NativeSelectOption>
                              </NativeSelect>
                            </TableCell>
                            <TableCell className="text-right">
                              <Switch
                                aria-label="Account enabled"
                                checked={!user.disabled}
                                disabled={user._id === me?._id}
                                onCheckedChange={(next) =>
                                  guard(
                                    () =>
                                      setUserDisabled({
                                        userId: user._id,
                                        disabled: !next,
                                      }),
                                    next ? "Account enabled" : "Account disabled",
                                  )
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== workspaces ===== */}
          <TabsContent value="workspaces" className="min-w-0">
            <Card className="min-w-0 py-0">
              <CardContent className="min-w-0 px-0">
                {workspaces === undefined ? (
                  <div className="flex flex-col gap-2 p-4">
                    {[0, 1, 2].map((n) => (
                      <Skeleton key={n} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Workspace</TableHead>
                          <TableHead className="hidden lg:table-cell">Owner</TableHead>
                          <TableHead className="w-20 text-center">Forms</TableHead>
                          <TableHead className="w-20 text-center">Members</TableHead>
                          <TableHead className="w-24 text-center">Responses</TableHead>
                          <TableHead className="w-24">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workspaces.map((workspace) => (
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
