"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  Layers01Icon,
  Link03Icon,
  MoreHorizontalIcon,
  Note04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { readError } from "@/lib/format";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const STATUS_VARIANT = {
  published: "default",
  draft: "secondary",
  closed: "outline",
} as const;

type GroupDraft = {
  groupId: Id<"formGroups"> | null;
  name: string;
  description: string;
  chooserPrompt: string;
  publicPage: boolean;
};

const EMPTY_DRAFT: GroupDraft = {
  groupId: null,
  name: "",
  description: "",
  chooserPrompt: "",
  publicPage: true,
};

/**
 * Groups: a set of related forms behind one shared link.
 *
 * Everything a group needs is on this page — what is in it, what its public
 * chooser looks like, and the two ways to put another form in it (start a new
 * one, or copy a form that is already there).
 */
export default function GroupsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const groups = useQuery(api.formGroups.listByWorkspace, { workspaceId });
  const forms = useQuery(api.forms.listByWorkspace, { workspaceId });

  const createGroup = useMutation(api.formGroups.create);
  const updateGroup = useMutation(api.formGroups.update);
  const removeGroup = useMutation(api.formGroups.remove);
  const setFormGroup = useMutation(api.formGroups.setFormGroup);
  const createForm = useMutation(api.forms.create);
  const duplicateForm = useMutation(api.forms.duplicate);

  const [draft, setDraft] = React.useState<GroupDraft | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<Id<"formGroups"> | null>(null);
  const [newFormIn, setNewFormIn] = React.useState<Id<"formGroups"> | null>(null);
  const [newFormTitle, setNewFormTitle] = React.useState("");
  const [addExistingTo, setAddExistingTo] =
    React.useState<Id<"formGroups"> | null>(null);
  const [pickedForm, setPickedForm] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  function groupPath(slug: string) {
    return workspace ? `/g/${workspace.slug}/${slug}` : "";
  }

  async function onSaveGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      if (draft.groupId) {
        await updateGroup({
          groupId: draft.groupId,
          name: draft.name,
          description: draft.description,
          chooserPrompt: draft.chooserPrompt,
          publicPage: draft.publicPage,
        });
        toast.add({ title: "Group updated" });
      } else {
        await createGroup({
          workspaceId,
          name: draft.name,
          description: draft.description || undefined,
          chooserPrompt: draft.chooserPrompt || undefined,
          publicPage: draft.publicPage,
        });
        toast.add({ title: "Group created" });
      }
      setDraft(null);
    } catch (caught) {
      toast.add({
        title: "Could not save the group",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCreateFormInGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newFormIn) return;
    setBusy(true);
    try {
      const formId = await createForm({
        workspaceId,
        title: newFormTitle,
        groupId: newFormIn,
      });
      setNewFormIn(null);
      setNewFormTitle("");
      router.push(`/app/w/${workspaceId}/forms/${formId}`);
    } catch (caught) {
      toast.add({
        title: "Could not create the form",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onAddExisting(event: React.FormEvent) {
    event.preventDefault();
    if (!addExistingTo || !pickedForm) return;
    setBusy(true);
    try {
      await setFormGroup({
        formId: pickedForm as Id<"forms">,
        groupId: addExistingTo,
      });
      toast.add({ title: "Form added to the group" });
      setAddExistingTo(null);
      setPickedForm("");
    } catch (caught) {
      toast.add({
        title: "Could not add the form",
        description: readError(caught),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const addable = (forms ?? []).filter((form) => form.groupId !== addExistingTo);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Groups</span>
        <Badge variant="secondary" className="ml-1 tabular-nums">
          {groups?.length ?? 0}
        </Badge>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          <span className="hidden sm:inline">New group</span>
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {groups === undefined && (
          <div className="flex flex-col gap-4">
            {[0, 1].map((n) => (
              <Skeleton key={n} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        )}

        {groups?.length === 0 && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No groups yet</EmptyTitle>
              <EmptyDescription>
                A group gathers related forms behind one link. Whoever opens it
                picks the form that applies to them and continues — so you hand
                out one address instead of five.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Create your first group
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {groups?.map((group) => {
          const path = groupPath(group.slug);
          return (
            <Card key={group._id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="truncate">{group.name}</span>
                      <Badge variant={group.publicPage ? "default" : "outline"}>
                        {group.publicPage ? "link live" : "link off"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {group.description ||
                        "No description — the chooser falls back to a generic prompt."}
                    </CardDescription>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                      <span className="sr-only">Group actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 min-w-52">
                      <DropdownMenuItem
                        onClick={() =>
                          setDraft({
                            groupId: group._id,
                            name: group.name,
                            description: group.description ?? "",
                            chooserPrompt: group.chooserPrompt ?? "",
                            publicPage: group.publicPage,
                          })
                        }
                      >
                        <HugeiconsIcon icon={Edit02Icon} className="size-4" strokeWidth={2} />
                        Edit group
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          await navigator.clipboard.writeText(origin + path);
                          toast.add({ title: "Group link copied" });
                        }}
                      >
                        <HugeiconsIcon icon={Link03Icon} className="size-4" strokeWidth={2} />
                        Copy group link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewFormIn(group._id)}>
                        <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
                        New form in this group
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setAddExistingTo(group._id);
                          setPickedForm("");
                        }}
                      >
                        <HugeiconsIcon icon={Note04Icon} className="size-4" strokeWidth={2} />
                        Add an existing form
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setPendingDelete(group._id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                        Delete group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {origin + path}
                  </code>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(origin + path);
                      toast.add({ title: "Group link copied" });
                    }}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                    Copy
                  </Button>
                  {group.publicPage && (
                    <Button
                      nativeButton={false}
                      variant="ghost"
                      size="xs"
                      render={<a href={path} target="_blank" rel="noreferrer" />}
                    >
                      <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                      Open
                    </Button>
                  )}
                </div>

                {group.forms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This group is empty. Add a form and it shows up in the
                    chooser as soon as it is published.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y rounded-lg border">
                    {group.forms.map((form) => (
                      <div
                        key={form._id}
                        className="flex flex-wrap items-center gap-2 px-3 py-2"
                      >
                        <Link
                          href={`/app/w/${workspaceId}/forms/${form._id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                        >
                          {form.title}
                        </Link>
                        <Badge variant={STATUS_VARIANT[form.status]}>
                          {form.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {form.submissionCount}{" "}
                          {form.submissionCount === 1 ? "reply" : "replies"}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              // Duplicating keeps the group, which is the quick
                              // way to offer a variant in the same chooser.
                              const copyId = await duplicateForm({
                                formId: form._id,
                              });
                              toast.add({ title: "Copy added to this group" });
                              router.push(
                                `/app/w/${workspaceId}/forms/${copyId}`,
                              );
                            } catch (caught) {
                              toast.add({
                                title: "Could not duplicate",
                                description: readError(caught),
                                type: "error",
                              });
                            }
                          }}
                        >
                          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                          Copy into group
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              await setFormGroup({
                                formId: form._id,
                                groupId: null,
                              });
                              toast.add({ title: "Removed from the group" });
                            } catch (caught) {
                              toast.add({
                                title: "Could not remove",
                                description: readError(caught),
                                type: "error",
                              });
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNewFormIn(group._id)}
                  >
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                    New form in this group
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddExistingTo(group._id);
                      setPickedForm("");
                    }}
                  >
                    Add an existing form
                  </Button>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <HugeiconsIcon
                      icon={Layers01Icon}
                      className="size-3.5"
                      strokeWidth={2}
                    />
                    {group.publishedCount} of {group.forms.length} published
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ---- new / edit group ---- */}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
      >
        <DialogContent>
          {draft && (
            <form onSubmit={onSaveGroup} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {draft.groupId ? "Edit group" : "New group"}
                </DialogTitle>
                <DialogDescription>
                  The group gets its own link. Whoever opens it picks one of the
                  published forms inside and continues.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  required
                  placeholder="Onboarding"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="group-desc">Description</Label>
                <Textarea
                  id="group-desc"
                  rows={2}
                  placeholder="Shown under the group name."
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="group-prompt">Chooser prompt</Label>
                <Input
                  id="group-prompt"
                  placeholder="Which of these applies to you?"
                  value={draft.chooserPrompt}
                  onChange={(e) =>
                    setDraft({ ...draft, chooserPrompt: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Replaces the description above the list of forms.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="group-public">Public link</Label>
                  <p className="text-xs text-muted-foreground">
                    Off keeps the group for organising forms in here; its link
                    stops resolving.
                  </p>
                </div>
                <Switch
                  id="group-public"
                  checked={draft.publicPage}
                  onCheckedChange={(next) =>
                    setDraft({ ...draft, publicPage: next })
                  }
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : draft.groupId ? "Save group" : "Create group"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- new form straight into a group ---- */}
      <Dialog
        open={newFormIn !== null}
        onOpenChange={(open) => !open && setNewFormIn(null)}
      >
        <DialogContent>
          <form onSubmit={onCreateFormInGroup} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New form in this group</DialogTitle>
              <DialogDescription>
                It starts as a draft and joins the chooser once you publish it.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-form-title">Title</Label>
              <Input
                id="group-form-title"
                required
                placeholder="Contractor onboarding"
                value={newFormTitle}
                onChange={(e) => setNewFormTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFormIn(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create form"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- move an existing form into a group ---- */}
      <Dialog
        open={addExistingTo !== null}
        onOpenChange={(open) => !open && setAddExistingTo(null)}
      >
        <DialogContent>
          <form onSubmit={onAddExisting} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add an existing form</DialogTitle>
              <DialogDescription>
                A form belongs to one group at a time, so this moves it out of
                any group it is in now.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pick-form">Form</Label>
              <NativeSelect
                id="pick-form"
                required
                className="w-full"
                value={pickedForm}
                onChange={(e) => setPickedForm(e.target.value)}
              >
                <NativeSelectOption value="">Choose a form…</NativeSelectOption>
                {addable.map((form) => (
                  <NativeSelectOption key={form._id} value={form._id}>
                    {form.title}
                    {form.groupId ? " (in another group)" : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {addable.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every form in this workspace is already in this group.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddExistingTo(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !pickedForm}>
                {busy ? "Adding…" : "Add to group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- delete confirmation ---- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              The group and its shared link are removed. The forms inside are
              kept — they simply stop belonging to a group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await removeGroup({ groupId: pendingDelete });
                  toast.add({ title: "Group deleted" });
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
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
