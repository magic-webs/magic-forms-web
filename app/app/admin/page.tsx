"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import {
  AiBrain01Icon,
  Building02Icon,
  Key01Icon,
  Note04Icon,
  UserMultiple02Icon,
  ViewIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { AdminHeader } from "@/components/admin-header";
import {
  CategoryChart,
  DailyChart,
  RANGE_ITEMS,
  StatCard,
  useHourlyNow,
} from "@/components/admin-stats";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminStatsPage() {
  const [days, setDays] = React.useState<number>(30);
  const now = useHourlyNow();

  const overview = useQuery(api.admin.overview, {});
  const activity = useQuery(api.admin.activity, { now, days });

  const formStatus = overview && [
    { label: "Draft", value: overview.draftFormCount },
    { label: "Published", value: overview.publishedFormCount },
    { label: "Closed", value: overview.closedFormCount },
  ];

  return (
    <>
      <AdminHeader title="Platform stats">
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
            label="Accounts"
            value={overview?.userCount}
            hint={
              overview
                ? `${overview.adminCount} staff · ${overview.disabledUserCount} disabled`
                : undefined
            }
            icon={UserMultiple02Icon}
          />
          <StatCard
            label="Workspaces"
            value={overview?.workspaceCount}
            hint={
              overview
                ? `${overview.archivedWorkspaceCount} archived`
                : undefined
            }
            icon={Building02Icon}
          />
          <StatCard
            label="Forms"
            value={overview?.formCount}
            hint={
              overview ? `${overview.publishedFormCount} published` : undefined
            }
            icon={Note04Icon}
          />
          <StatCard
            label="Submissions"
            value={overview?.submissionCount}
            hint={
              overview
                ? `${overview.conversionRate}% of ${overview.viewCount.toLocaleString()} views`
                : undefined
            }
            icon={ViewIcon}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="MCP tokens"
            value={overview?.mcpTokenCount}
            hint={
              overview
                ? `${overview.revokedMcpTokenCount} revoked`
                : undefined
            }
            icon={AiBrain01Icon}
          />
          <StatCard
            label="API keys"
            value={overview?.apiKeyCount}
            hint="live, across every workspace"
            icon={Key01Icon}
          />
          <StatCard
            label="Webhooks"
            value={overview?.webhookCount}
            hint="endpoints registered"
            icon={WebhookIcon}
          />
          <StatCard
            label="Conversion"
            value={overview ? `${overview.conversionRate}%` : undefined}
            hint="submissions per form view"
            icon={Note04Icon}
          />
        </div>

        {/* ---- trends ----
            Growth and response volume are different scales, so they are two
            charts rather than one chart with two y-axes. */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <DailyChart
            title="Growth"
            description={`New accounts and workspaces, last ${days} days`}
            data={activity?.series}
            series={[
              { key: "signups", label: "Accounts", slot: "teal" },
              { key: "workspaces", label: "Workspaces", slot: "orange" },
            ]}
          />
          <DailyChart
            title="Submissions"
            description={`Responses received, last ${days} days`}
            data={activity?.series}
            series={[{ key: "submissions", label: "Submissions", slot: "teal" }]}
            footer={
              activity?.truncated
                ? "Too many responses in this window to count them all — the oldest days are undercounted. Pick a shorter range for exact figures."
                : undefined
            }
          />
        </div>

        <CategoryChart
          title="Forms by status"
          description="Every form on the platform, by where it is in its life"
          data={formStatus}
          valueLabel="Forms"
        />
      </div>
    </>
  );
}
