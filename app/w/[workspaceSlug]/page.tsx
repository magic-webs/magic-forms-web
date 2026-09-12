"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  Building02Icon,
  Layers01Icon,
  Note04Icon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceDirectoryPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const directory = useQuery(api.publicForms.getWorkspaceDirectory, {
    workspaceSlug: params.workspaceSlug,
  });

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
          <Logo size={24} />
          <span className="truncate text-sm font-medium">
            {directory?.workspace.name ?? "Forms"}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:py-14">
        {directory === undefined && (
          <>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          </>
        )}

        {directory === null && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Building02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>This workspace is not public</EmptyTitle>
              <EmptyDescription>
                The link may be wrong, or the workspace has turned off its public
                directory.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
                Go to Magic Forms
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {directory && (
          <>
            <div className="flex flex-col gap-3">
              <Badge variant="secondary" className="w-fit">
                {directory.forms.length}{" "}
                {directory.forms.length === 1 ? "form" : "forms"} available
              </Badge>
              <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {directory.workspace.name}
              </h1>
              {directory.workspace.description && (
                <p className="max-w-xl text-pretty text-muted-foreground">
                  {directory.workspace.description}
                </p>
              )}
            </div>

            {directory.forms.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No published forms yet</EmptyTitle>
                  <EmptyDescription>
                    This workspace has not published any forms. Check back soon.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {directory.forms.map((form) => (
                  <Card
                    key={form.slug}
                    className="group transition-colors hover:border-primary/40 hover:bg-background"
                  >
                    <CardHeader className="gap-2">
                      <div className="flex items-center justify-between">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <HugeiconsIcon
                            icon={Note04Icon}
                            className="size-4"
                            strokeWidth={2}
                          />
                        </span>
                        <HugeiconsIcon
                          icon={ArrowRight02Icon}
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          strokeWidth={2}
                        />
                      </div>
                      <CardTitle className="text-base">
                        <Link
                          href={`/f/${directory.workspace.slug}/${form.slug}`}
                          className="block"
                        >
                          {form.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {form.description || "Open the form to get started."}
                      </CardDescription>
                      <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <HugeiconsIcon
                            icon={Layers01Icon}
                            className="size-3.5"
                            strokeWidth={2}
                          />
                          {form.stepCount} {form.stepCount === 1 ? "step" : "steps"}
                        </span>
                        <span>
                          {form.fieldCount}{" "}
                          {form.fieldCount === 1 ? "question" : "questions"}
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
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
