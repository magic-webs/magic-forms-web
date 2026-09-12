"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Note04Icon } from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { FormRenderer, FormSchema } from "@/components/form-renderer";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown at the foot of whatever fills the page. */
function PoweredBy() {
  return (
    <div className="flex items-center justify-center">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Logo size={14} />
        Powered by Magic Forms
      </Link>
    </div>
  );
}

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

  const live = schema && schema.form.status === "published";

  /**
   * Everything that is not the live form — loading, missing, closed — is a
   * short message, so it is centred with the brand line under it. The live form
   * lays out its own page: it has to, because its buttons stick to the bottom.
   */
  const message = (
    <div className="flex flex-1 flex-col px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        {schema === undefined && (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}

        {schema === null && (
          <Empty className="p-0">
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
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link href="/" />}
              >
                Go to Magic Forms
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {schema && schema.form.status === "closed" && (
          <Empty className="p-0">
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
      </div>

      <div className="shrink-0 pt-10">
        <PoweredBy />
      </div>
    </div>
  );

  return (
    // min-h-svh, not h-svh: the page scrolls with the document, which is what
    // keeps the sticky button bar behaving on a phone when the keyboard opens.
    <div className="flex min-h-svh flex-col bg-background">
      <header className="shrink-0 border-b">
        <div className="mx-auto flex h-12 w-full max-w-2xl items-center gap-2 px-4 sm:h-14 sm:px-6">
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

      <main className="flex flex-1 flex-col">
        {live ? (
          <FormRenderer
            schema={schema as FormSchema}
            fullScreen
            brand={<PoweredBy />}
          />
        ) : (
          message
        )}
      </main>
    </div>
  );
}
