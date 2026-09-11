"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Copy01Icon, Link03Icon } from "@hugeicons/core-free-icons";

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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId as Id<"workspaces">;

  const workspace = useQuery(api.workspaces.get, { workspaceId });
  const updateWorkspace = useMutation(api.workspaces.update);
  const removeWorkspace = useMutation(api.workspaces.remove);

  // Only edits are tracked; anything untouched falls back to the server value,
  // so there is no effect copying props into state.
  const [nameEdit, setNameEdit] = React.useState<string | null>(null);
  const [descriptionEdit, setDescriptionEdit] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  const name = nameEdit ?? workspace?.name ?? "";
  const description = descriptionEdit ?? workspace?.description ?? "";

  const canEdit = workspace?.role === "owner" || workspace?.role === "admin";
  const isOwner = workspace?.role === "owner";
  const directoryUrl =
    typeof window !== "undefined" && workspace
      ? window.location.origin + "/w/" + workspace.slug
      : "";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <span className="truncate text-sm font-medium">Workspace settings</span>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
        {workspace === undefined && (
          <>
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </>
        )}

        {workspace && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
                <CardDescription>
                  The name appears in the sidebar and on the public workspace page.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ws-name">Name</Label>
                  <Input
                    id="ws-name"
                    value={name}
                    disabled={!canEdit}
                    onChange={(e) => setNameEdit(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ws-desc">Description</Label>
                  <Textarea
                    id="ws-desc"
                    rows={3}
                    value={description}
                    disabled={!canEdit}
                    onChange={(e) => setDescriptionEdit(e.target.value)}
                  />
                </div>

                <Separator />

                <Label className="flex items-center justify-between gap-3 font-normal">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Public form directory</span>
                    <span className="text-xs text-muted-foreground">
                      Let anyone with the workspace link browse published forms.
                    </span>
                  </span>
                  <Switch
                    checked={workspace.publicDirectory}
                    disabled={!canEdit}
                    onCheckedChange={async (next) => {
                      try {
                        await updateWorkspace({ workspaceId, publicDirectory: next });
                        toast.add({
                          title: next
                            ? "Directory is public"
                            : "Directory is now private",
                        });
                      } catch (caught) {
                        toast.add({
                          title: "Could not update",
                          description: readError(caught),
                          type: "error",
                        });
                      }
                    }}
                  />
                </Label>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  disabled={!canEdit || saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await updateWorkspace({
                        workspaceId,
                        name,
                        description,
                      });
                      toast.add({ title: "Workspace saved" });
                    } catch (caught) {
                      toast.add({
                        title: "Could not save",
                        description: readError(caught),
                        type: "error",
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <HugeiconsIcon
                    icon={Link03Icon}
                    className="size-4 text-primary"
                    strokeWidth={2}
                  />
                  Public link
                </CardTitle>
                <CardDescription>
                  Renaming the workspace changes this URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  {directoryUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(directoryUrl);
                    toast.add({ title: "Link copied" });
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  Copy
                </Button>
              </CardContent>
            </Card>

            {isOwner && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <HugeiconsIcon icon={Alert02Icon} className="size-4" strokeWidth={2} />
                    Delete this workspace
                  </CardTitle>
                  <CardDescription>
                    Removes every form, response, webhook and API key in{" "}
                    {workspace.name}. This cannot be undone.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                    Delete workspace
                  </Button>
                </CardFooter>
              </Card>
            )}
          </>
        )}
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {workspace?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every form, response, webhook and API key is removed permanently.
              Type the workspace name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            aria-label="Workspace name"
            placeholder={workspace?.name}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== workspace?.name}
              onClick={async () => {
                try {
                  await removeWorkspace({ workspaceId });
                  toast.add({ title: "Workspace deleted" });
                  router.replace("/app");
                } catch (caught) {
                  toast.add({
                    title: "Could not delete",
                    description: readError(caught),
                    type: "error",
                  });
                }
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
