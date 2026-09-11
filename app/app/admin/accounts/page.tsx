"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import {
  SecurityCheckIcon,
  UserBlock01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { formatWhen, initials, readError } from "@/lib/format";
import { AdminHeader } from "@/components/admin-header";
import {
  bucketByDay,
  DailyChart,
  RANGES,
  StatCard,
  useHourlyNow,
} from "@/components/admin-stats";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function AdminAccountsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [search, setSearch] = React.useState("");
  const now = useHourlyNow();

  const me = useQuery(api.auth.me);
  const users = useQuery(api.admin.listUsers, {});

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

  // The list already carries every join date, so the chart needs no second
  // round trip — it buckets what is on screen.
  const signups = React.useMemo(
    () =>
      users &&
      bucketByDay(
        users.map((user) => user.createdAt),
        now,
        days,
      ),
    [users, now, days],
  );

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!users || !needle) return users;
    return users.filter((user) =>
      [user.name, user.email, user.company ?? ""].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [users, search]);

  const newInWindow = signups?.reduce((n, row) => n + row.count, 0);

  return (
    <>
      <AdminHeader title="Accounts">
        <NativeSelect
          aria-label="Date range"
          className="w-40"
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {RANGES.map((range) => (
            <NativeSelectOption key={range.days} value={String(range.days)}>
              {range.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </AdminHeader>

      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* ---- headline numbers ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Accounts"
            value={users?.length}
            hint="everyone with a sign-in"
            icon={UserMultiple02Icon}
          />
          <StatCard
            label={`New in ${days} days`}
            value={newInWindow}
            hint="signed up in this window"
            icon={UserMultiple02Icon}
          />
          <StatCard
            label="Platform staff"
            value={users?.filter((user) => user.role === "admin").length}
            hint="hold the admin role"
            icon={SecurityCheckIcon}
          />
          <StatCard
            label="Disabled"
            value={users?.filter((user) => user.disabled).length}
            hint="cannot sign in"
            icon={UserBlock01Icon}
          />
        </div>

        <DailyChart
          title="Signups"
          description={`New accounts per day, last ${days} days`}
          data={signups}
          series={[{ key: "count", label: "Signups", slot: "teal" }]}
        />

        {/* ---- the register ---- */}
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Search accounts"
            placeholder="Search by name, email or company…"
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
                  No account matches “{search}”.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Person</TableHead>
                        <TableHead className="hidden w-40 md:table-cell">
                          Company
                        </TableHead>
                        <TableHead className="w-16 text-center">
                          Spaces
                        </TableHead>
                        <TableHead className="w-32">Role</TableHead>
                        <TableHead className="w-24 text-right">
                          Active
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((user) => (
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
                                  {user.email} · joined{" "}
                                  {formatWhen(user.createdAt)}
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
                              <NativeSelectOption value="user">
                                User
                              </NativeSelectOption>
                              <NativeSelectOption value="admin">
                                Admin
                              </NativeSelectOption>
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
                                  next
                                    ? "Account enabled"
                                    : "Account disabled",
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
        </div>
      </div>
    </>
  );
}
