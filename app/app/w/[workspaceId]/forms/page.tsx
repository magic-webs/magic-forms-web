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
  Layers01Icon,
  Link03Icon,
  MoreHorizontalIcon,
  Note04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatWhen, readError } from "@/lib/format";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const STATUS_VARIANT = {
  published: "default",
  draft: "secondary",
  closed: "outline",
} as const;

export default function FormsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const forms = useQuery(api.forms.listByWorkspace, { workspaceId });
  const createForm = useMutation(api.forms.create);
  const duplicateForm = useMutation(api.forms.duplicate);
  const removeForm = useMutation(api.forms.remove);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Id<"forms"> | null>(null);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const formId = await createForm({
        workspaceId,
        title,
        description: description.trim() || undefined,
      });
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      router.push(`/app/w/${workspaceId}/forms/${formId}`);
    } catch (caught) {
      toast.add({ title: "Could not create form", description: readError(caught), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Forms</span>
        <Badge variant="secondary" className="ml-1 tabular-nums">
          {forms?.length ?? 0}
        </Badge>
        <Button size="sm" className="ml-auto" onClick={() => setDialogOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          <span className="hidden sm:inline">New form</span>
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {forms === undefined && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        )}

        {forms?.length === 0 && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No forms in this workspace</EmptyTitle>
              <EmptyDescription>
                Create a form, add steps and fields, then publish it to get a
                shareable link.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setDialogOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Create your first form
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {forms && forms.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {forms.map((form) => {
              const publicPath = workspace ? `/f/${workspace.slug}/${form.slug}` : "";
              return (
                <Card key={form._id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant={STATUS_VARIANT[form.status]}>{form.status}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                          <span className="sr-only">Form actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 min-w-48">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/app/w/${workspaceId}/forms/${form._id}`)
                            }
                          >
                            <HugeiconsIcon icon={Layers01Icon} className="size-4" strokeWidth={2} />
                            Edit form
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(
                                `/app/w/${workspaceId}/forms/${form._id}/responses`,
                              )
                            }
                          >
                            <HugeiconsIcon icon={Note04Icon} className="size-4" strokeWidth={2} />
                            Responses
                          </DropdownMenuItem>
                          {form.status === "published" && (
                            <DropdownMenuItem
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  window.location.origin + publicPath,
                                );
                                toast.add({ title: "Form link copied" });
                              }}
                            >
                              <HugeiconsIcon icon={Link03Icon} className="size-4" strokeWidth={2} />
                              Copy link
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const copyId = await duplicateForm({ formId: form._id });
                                toast.add({ title: "Form duplicated" });
                                router.push(`/app/w/${workspaceId}/forms/${copyId}`);
                              } catch (caught) {
                                toast.add({
                                  title: "Could not duplicate",
                                  description: readError(caught),
                                  type: "error",
                                });
                              }
                            }}
                          >
                            <HugeiconsIcon icon={Copy01Icon} className="size-4" strokeWidth={2} />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPendingDelete(form._id)}
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <CardTitle className="mt-1 text-base">
                      <Link
                        href={`/app/w/${workspaceId}/forms/${form._id}`}
                        className="hover:underline"
                      >
                        {form.title}
                      </Link>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {form.description || "No description yet."}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="mt-auto flex flex-col gap-3">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Steps", value: form.stepCount },
                        { label: "Fields", value: form.fieldCount },
                        { label: "Views", value: form.viewCount },
                        { label: "Replies", value: form.submissionCount },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg bg-muted/60 px-1 py-1.5">
                          <div className="text-sm font-semibold tabular-nums">{stat.value}</div>
                          <div className="text-[0.65rem] text-muted-foreground">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        Updated {formatWhen(form.updatedAt)}
                      </span>
                      {form.status === "published" && workspace && (
                        <Button nativeButton={false}
                          variant="ghost"
                          size="xs"
                          render={<a href={publicPath} target="_blank" rel="noreferrer" />}
                        >
                          <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                          View
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- new form ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New form</DialogTitle>
              <DialogDescription>
                Start with a title — you can add steps and fields next.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-title">Title</Label>
              <Input
                id="form-title"
                required
                placeholder="Enterprise demo request"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-desc">Description</Label>
              <Textarea
                id="form-desc"
                rows={2}
                placeholder="Shown under the title on the public form."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create form"}
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
            <AlertDialogTitle>Delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              The form, its fields and every stored response are removed
              permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await removeForm({ formId: pendingDelete });
                  toast.add({ title: "Form deleted" });
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
              Delete form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
