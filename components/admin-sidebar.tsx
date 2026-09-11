"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Analytics01Icon,
  ArrowLeft02Icon,
  Building02Icon,
  Logout02Icon,
  Note04Icon,
  ShieldCheckIcon,
  UnfoldMoreIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { useSession } from "@/components/providers";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

type AdminNavItem = {
  href: string;
  label: string;
  icon: IconSvgElement;
  /** Which platform-wide count to show alongside the entry. */
  badge?: (overview: AdminOverview) => number;
};

type AdminOverview = FunctionReturnType<typeof api.admin.overview>;

const NAV: AdminNavItem[] = [
  { href: "/app/admin", label: "Stats", icon: Analytics01Icon },
  {
    href: "/app/admin/accounts",
    label: "Accounts",
    icon: UserMultiple02Icon,
    badge: (o) => o.userCount,
  },
  {
    href: "/app/admin/workspaces",
    label: "Workspaces",
    icon: Building02Icon,
    badge: (o) => o.workspaceCount,
  },
  {
    href: "/app/admin/mcp",
    label: "MCP",
    icon: AiBrain01Icon,
    badge: (o) => o.mcpTokenCount,
  },
];

/**
 * The admin console's own sidebar.
 *
 * The workspace sidebar is about one company; this one is about the platform,
 * so it swaps in wholesale rather than growing a section. `AppLayout` picks
 * between the two on the route.
 */
export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useSession();
  const { setOpenMobile } = useSidebar();

  const me = useQuery(api.auth.me);
  const isAdmin = me?.role === "admin";
  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip");
  const workspaces = useQuery(api.workspaces.list);

  /** Where "Exit admin" goes: the first workspace, or the chooser. */
  const exitHref = workspaces?.[0] ? `/app/w/${workspaces[0]._id}` : "/app";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Admin console"
              render={<Link href="/app/admin" />}
              onClick={() => setOpenMobile(false)}
            >
              <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <HugeiconsIcon
                  icon={ShieldCheckIcon}
                  className="size-4"
                  strokeWidth={2}
                />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">
                  Admin console
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Magic Forms platform
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ---- platform sections ---- */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const isActive =
                  item.href === "/app/admin"
                    ? pathname === "/app/admin"
                    : pathname.startsWith(item.href);
                const badge = overview ? item.badge?.(overview) : undefined;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      onClick={() => setOpenMobile(false)}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {badge !== undefined && badge > 0 && (
                      <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ---- at a glance ---- */}
        {isAdmin && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>At a glance</SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-1 px-2 py-1">
              {[
                { label: "Forms", value: overview?.formCount },
                { label: "Published", value: overview?.publishedFormCount },
                { label: "Submissions", value: overview?.submissionCount },
                { label: "API keys", value: overview?.apiKeyCount },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="tabular-nums">
                    {row.value === undefined
                      ? "—"
                      : row.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ---- back to the ordinary app ---- */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Back to workspaces"
                  render={<Link href={exitHref} />}
                  onClick={() => setOpenMobile(false)}
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} />
                  <span>Back to workspaces</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ---- account ---- */}
      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" tooltip={me?.name ?? "Account"} />
                }
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {initials(me?.name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">
                    {me?.name ?? "Loading…"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {me?.email ?? ""}
                  </span>
                </span>
                <HugeiconsIcon
                  icon={UnfoldMoreIcon}
                  className="ml-auto size-4"
                  strokeWidth={2}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 min-w-56"
                side="top"
                align="start"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{me?.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(exitHref)}>
                  <HugeiconsIcon
                    icon={Note04Icon}
                    className="size-4"
                    strokeWidth={2}
                  />
                  Back to workspaces
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    await signOut();
                    router.replace("/sign-in");
                  }}
                >
                  <HugeiconsIcon
                    icon={Logout02Icon}
                    className="size-4"
                    strokeWidth={2}
                  />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
