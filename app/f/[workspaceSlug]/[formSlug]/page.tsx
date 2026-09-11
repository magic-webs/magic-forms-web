"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MagicWand01Icon, Note04Icon } from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { FormRenderer, FormSchema } from "@/components/form-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicFormPage() {
  const params = useParams<{ workspaceSlug: string; formSlug: string }>();
  const { workspaceSlug, formSlug } = params;

  const schema = useQuery(api.publicForms.getFormSchema, {
    workspaceSlug,
    formSlug,
  });
  const recordView = useMutation(api.publicForms.recordView);

  // Count the view once per mount, after the form is known to exist.
  const counted = React.useRef(false);
  React.useEffect(() => {
    if (schema && !counted.current) {
      counted.current = true;
      recordView({ workspaceSlug, formSlug }).catch(() => {});
    }
  }, [schema, recordView, workspaceSlug, formSlug]);

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
          {schema ? (
            <Link
              href={`/w/${schema.workspace.slug}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {schema.workspace.name}
            </Link>
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:py-12">
        <div className="my-auto flex w-full flex-col">
        {schema === undefined && (
          <Card>
            <CardContent className="flex flex-col gap-5 py-8">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-32 self-end" />
            </CardContent>
          </Card>
        )}

        {schema === null && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>This form is not available</EmptyTitle>
              <EmptyDescription>
                The link may be wrong, or the form has not been published yet.
                Check with whoever shared it.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
                Go to Magic Forms
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {schema && schema.form.status === "closed" && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{schema.form.title}</EmptyTitle>
              <EmptyDescription>
                {schema.form.settings.closedMessage ||
                  "This form is no longer accepting responses."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {schema && schema.form.status === "published" && (
          <FormRenderer schema={schema as FormSchema} />
        )}

        </div>

        <footer className="mt-8 flex shrink-0 items-center justify-center">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon
              icon={MagicWand01Icon}
              className="size-3.5"
              strokeWidth={2}
            />
            Powered by Magic Forms
          </Link>
        </footer>
      </main>
    </div>
  );
}
