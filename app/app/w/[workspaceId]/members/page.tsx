"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  UserAdd01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { formatWhen, initials, readError } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type MemberRole = Doc<"members">["role"];

const ROLES: { value: MemberRole; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Full control, including deleting the workspace" },
  { value: "admin", label: "Admin", hint: "Manages members, webhooks and API keys" },
  { value: "editor", label: "Editor", hint: "Builds forms and manages responses" },
  { value: "viewer", label: "Viewer", hint: "Read-only access" },
];

/**
 * The roles a member can be moved to. Ownership transfers are a separate
 * operation, so "owner" is never on offer — and an owner's row shows a badge
 * rather than this picker, so their role is always one of these.
 */
const ASSIGNABLE_ROLES = ROLES.filter((role) => role.value !== "owner");

export default function MembersPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const members = useQuery(api.workspaces.listMembers, { workspaceId });
  const addMember = useMutation(api.workspaces.addMember);
  const updateRole = useMutation(api.workspaces.updateMemberRole);
  const removeMember = useMutation(api.workspaces.removeMember);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<MemberRole>("editor");
  const [adding, setAdding] = React.useState(false);

  const canManage = workspace?.role === "owner" || workspace?.role === "admin";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Members</span>
        <Badge variant="secondary" className="tabular-nums">
          {members?.length ?? 0}
        </Badge>
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
            <span className="hidden sm:inline">Add member</span>
          </Button>
        )}
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={UserMultiple02Icon}
                className="size-4 text-primary"
                strokeWidth={2}
              />
              Who can work in {workspace?.name ?? "this workspace"}
            </CardTitle>
            <CardDescription>
              Roles decide what each person can change. Only owners and admins can
              manage this list.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {members === undefined ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead className="w-40">Role</TableHead>
                      <TableHead className="hidden w-28 sm:table-cell">Joined</TableHead>
                      <TableHead className="w-12 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const isOwner = member.userId === workspace?.ownerId;
                      return (
                        <TableRow key={member._id}>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar className="size-8">
                                <AvatarFallback className="text-xs">
                                  {initials(member.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-medium">
                                  {member.name}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {member.email}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManage && !isOwner ? (
                              <Select
                                items={ASSIGNABLE_ROLES}
                                value={member.role}
                                onValueChange={async (next) => {
                                  try {
                                    await updateRole({
                                      memberId: member._id,
                                      role: next as MemberRole,
                                    });
                                    toast.add({ title: "Role updated" });
                                  } catch (caught) {
                                    toast.add({
                                      title: "Could not update role",
                                      description: readError(caught),
                                      type: "error",
                                    });
                                  }
                                }}
                              >
                                <SelectTrigger aria-label="Role" className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={isOwner ? "default" : "secondary"}>
                                {member.role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {formatWhen(member.joinedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && !isOwner && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Remove member"
                                onClick={async () => {
                                  try {
                                    await removeMember({ memberId: member._id });
                                    toast.add({ title: "Member removed" });
                                  } catch (caught) {
                                    toast.add({
                                      title: "Could not remove",
                                      description: readError(caught),
                                      type: "error",
                                    });
                                  }
                                }}
                              >
                                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What each role can do</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {ROLES.map((r) => (
              <div key={r.value} className="flex items-start gap-3">
                <Badge variant="outline" className="w-16 shrink-0 justify-center">
                  {r.label}
                </Badge>
                <span className="text-sm text-muted-foreground">{r.hint}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ---- add member ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setAdding(true);
              try {
                await addMember({ workspaceId, email, role });
                toast.add({ title: "Member added", description: email });
                setDialogOpen(false);
                setEmail("");
              } catch (caught) {
                toast.add({
                  title: "Could not add member",
                  description: readError(caught),
                  type: "error",
                });
              } finally {
                setAdding(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a member</DialogTitle>
              <DialogDescription>
                They need a Magic Forms account already — ask them to sign up
                first, then add their email here.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-role">Role</Label>
              <Select
                items={ASSIGNABLE_ROLES}
                value={role}
                onValueChange={(next) => setRole(next as MemberRole)}
              >
                <SelectTrigger id="member-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* The trigger shows the bare label; the hint only has room
                      to be spelled out here, where a row can wrap. */}
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="py-1.5">
                      <span className="flex flex-col gap-0.5 whitespace-normal">
                        <span>{r.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.hint}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? "Adding…" : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
