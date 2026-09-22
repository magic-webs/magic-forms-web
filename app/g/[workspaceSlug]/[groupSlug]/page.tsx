"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  Folder01Icon,
  Layers01Icon,
  Note04Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A group's public link: one address that offers every form in the group, so
 * whoever arrives picks the one that applies to them and continues into it.
 */
export default function GroupChooserPage() {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string; groupSlug: string }>();
  const group = useQuery(api.publicForms.getGroupDirectory, {
    workspaceSlug: params.workspaceSlug,
    groupSlug: params.groupSlug,
  });

  const [picked, setPicked] = React.useState<string | null>(null);
  // A group with a single form has nothing to choose, so it starts selected —
  // derived rather than set in an effect, so it survives the query resolving.
  const chosen =
    picked ?? (group && group.forms.length === 1 ? group.forms[0].slug : null);

  function onContinue() {
    if (!group || !chosen) return;
    // A prefilled group link carries its values on to whichever form is
    // picked; the form drops the parameters it has no field for.
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.push(`/f/${group.workspace.slug}/${chosen}${search}`);
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
          <Logo size={24} />
          {group ? (
            group.workspace.publicDirectory ? (
              <Link
                href={`/w/${group.workspace.slug}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {group.workspace.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">
                {group.workspace.name}
              </span>
            )
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:py-14">
        {group === undefined && (
          <>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </>
        )}

        {group === null && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>This link is not available</EmptyTitle>
              <EmptyDescription>
                The address may be wrong, or whoever owns these forms has turned
                the shared link off.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
                Go to Magic Forms
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {group && (
          <>
            <div className="flex flex-col gap-3">
              <Badge variant="secondary" className="w-fit">
                {group.forms.length}{" "}
                {group.forms.length === 1 ? "form" : "forms"} in this group
              </Badge>
              <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {group.group.name}
              </h1>
              <p className="max-w-xl text-pretty text-muted-foreground">
                {group.group.chooserPrompt ||
                  group.group.description ||
                  "Choose the form that applies to you, then continue."}
              </p>
            </div>

            {group.forms.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Nothing to fill in yet</EmptyTitle>
                  <EmptyDescription>
                    No form in this group has been published. Check back soon.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <RadioGroup
                  value={chosen}
                  onValueChange={(value) => setPicked(String(value))}
                  aria-label="Available forms"
                >
                  {group.forms.map((form) => (
                    <label
                      key={form.slug}
                      // Whole row is the hit target: on a phone the radio alone
                      // is a 16px dot.
                      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 has-data-checked:border-primary has-data-checked:ring-3 has-data-checked:ring-primary/20"
                    >
                      <RadioGroupItem value={form.slug} className="mt-0.5" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{form.title}</span>
                        <span className="text-sm text-muted-foreground">
                          {form.description || "Open the form to get started."}
                        </span>
                        <span className="flex items-center gap-3 pt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon
                              icon={Layers01Icon}
                              className="size-3.5"
                              strokeWidth={2}
                            />
                            {form.stepCount}{" "}
                            {form.stepCount === 1 ? "step" : "steps"}
                          </span>
                          <span>
                            {form.fieldCount}{" "}
                            {form.fieldCount === 1 ? "question" : "questions"}
                          </span>
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>

                <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {chosen
                      ? group.forms.find((f) => f.slug === chosen)?.title
                      : "Select a form to continue"}
                  </span>
                  <Button disabled={!chosen} onClick={onContinue}>
                    Continue
                    <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        <footer className="mt-auto flex items-center justify-center pt-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Logo size={14} />
            Powered by Magic Forms
          </Link>
        </footer>
      </main>
    </div>
  );
}
