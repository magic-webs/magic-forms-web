"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Building02Icon,
  Key01Icon,
  Layers01Icon,
  Logout02Icon,
  MagicWand01Icon,
  Note04Icon,
  SecurityCheckIcon,
  Settings02Icon,
  ShieldCheckIcon,
  UnfoldMoreIcon,
  UserMultiple02Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/components/providers";
import { initials, readError } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const NAV = [
  { slug: "", label: "Overview", icon: Layers01Icon },
  { slug: "forms", label: "Forms", icon: Note04Icon },
  { slug: "responses", label: "Responses", icon: Building02Icon },
  { slug: "webhooks", label: "Webhooks", icon: WebhookIcon },
  { slug: "api", label: "API keys", icon: Key01Icon },
  { slug: "members", label: "Members", icon: UserMultiple02Icon },
  { slug: "settings", label: "Settings", icon: Settings02Icon },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string }>();
  const { signOut } = useSession();
  const { setOpenMobile } = useSidebar();

  const me = useQuery(api.auth.me);
  const workspaces = useQuery(api.workspaces.list);
  const createWorkspace = useMutation(api.workspaces.create);

  const workspaceId = params.workspaceId as Id<"workspaces"> | undefined;
  const active = workspaces?.find((w) => w._id === workspaceId);

  const forms = useQuery(
    api.forms.listByWorkspace,
    workspaceId ? { workspaceId } : "skip",
  );

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const base = workspaceId ? `/app/w/${workspaceId}` : "/app";

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await createWorkspace({
        name,
        description: description.trim() || undefined,
      });
      setDialogOpen(false);
      setName("");
      setDescription("");
      toast.add({ title: "Workspace created", description: name });
      router.push(`/app/w/${result.workspaceId}`);
    } catch (caught) {
      toast.add({
        title: "Could not create workspace",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Sidebar collapsible="icon">
        {/* ---- workspace switcher ---- */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      tooltip={active?.name ?? "Workspaces"}
                      className="data-[state=open]:bg-sidebar-accent"
                    />
                  }
                >
                  <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <HugeiconsIcon
                      icon={MagicWand01Icon}
                      className="size-4"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">
                      {active?.name ?? "Magic Forms"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {active ? active.role : "Pick a workspace"}
                    </span>
                  </span>
                  <HugeiconsIcon
                    icon={UnfoldMoreIcon}
                    className="ml-auto size-4"
                    strokeWidth={2}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 min-w-56" align="start" side="bottom">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                    {workspaces === undefined && (
                      <div className="flex flex-col gap-1 p-1">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                      </div>
                    )}
                    {workspaces?.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace._id}
                        onClick={() => {
                          setOpenMobile(false);
                          router.push(`/app/w/${workspace._id}`);
                        }}
                      >
                        <HugeiconsIcon
                          icon={Building02Icon}
                          className="size-4"
                          strokeWidth={2}
                        />
                        <span className="truncate">{workspace.name}</span>
                      </DropdownMenuItem>
                    ))}
                    {workspaces?.length === 0 && (
                      <div className="px-1.5 py-2 text-xs text-muted-foreground">
                        No workspaces yet.
                      </div>
                    )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                    <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
                    New workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {/* ---- workspace nav ---- */}
          {workspaceId && (
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => {
                    const href = item.slug ? `${base}/${item.slug}` : base;
                    const isActive =
                      item.slug === ""
                        ? pathname === base
                        : pathname.startsWith(href);
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.label}
                          render={<Link href={href} />}
                          onClick={() => setOpenMobile(false)}
                        >
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ---- forms in this workspace ---- */}
          {workspaceId && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Forms</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {forms === undefined && (
                    <div className="flex flex-col gap-1.5 px-2 py-1">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-2/3" />
                    </div>
                  )}
                  {forms?.slice(0, 8).map((form) => (
                    <SidebarMenuItem key={form._id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={pathname.includes(form._id)}
                        render={<Link href={`${base}/forms/${form._id}`} />}
                        onClick={() => setOpenMobile(false)}
                      >
                        <span className="truncate">{form.title}</span>
                      </SidebarMenuButton>
                      {form.submissionCount > 0 && (
                        <SidebarMenuBadge>{form.submissionCount}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                  {forms?.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      No forms yet.
                    </div>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="sm"
                      className="text-muted-foreground"
                      render={<Link href={`${base}/forms`} />}
                      onClick={() => setOpenMobile(false)}
                    >
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                      <span>All forms</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ---- platform admin ---- */}
          {me?.role === "admin" && (
            <SidebarGroup className="mt-auto">
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/app/admin")}
                      tooltip="Admin console"
                      render={<Link href="/app/admin" />}
                      onClick={() => setOpenMobile(false)}
                    >
                      <HugeiconsIcon icon={ShieldCheckIcon} strokeWidth={2} />
                      <span>Admin console</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
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
                <DropdownMenuContent className="w-56 min-w-56" side="top" align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{me?.email}</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {me?.role === "admin" && (
                    <DropdownMenuItem onClick={() => router.push("/app/admin")}>
                      <HugeiconsIcon
                        icon={SecurityCheckIcon}
                        className="size-4"
                        strokeWidth={2}
                      />
                      Admin console
                    </DropdownMenuItem>
                  )}
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

      {/* ---- new workspace ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                A workspace holds a company&apos;s forms, responses and webhooks.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                required
                minLength={2}
                placeholder="Acme Inc"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea
                id="ws-desc"
                rows={2}
                placeholder="Shown on the public workspace page."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
