"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ClipboardIcon,
  Note04Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/logo";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

/**
 * The magic link from the submission notification.
 *
 * The token in the URL is the whole credential: whoever received the WhatsApp
 * message can read this one response without signing in, and nothing else.
 */
export default function SubmissionLinkPage() {
  const params = useParams<{ token: string }>();
  const submission = useQuery(api.publicForms.getSubmissionByToken, {
    token: params.token,
  });

  async function onCopy() {
    if (!submission) return;
    try {
      await navigator.clipboard.writeText(submission.formattedText);
      toast.add({ title: "Response copied" });
    } catch {
      toast.add({ title: "Could not copy", type: "error" });
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
          <Logo size={24} />
          <span className="truncate text-sm font-medium">
            {submission?.workspace.name ?? "Magic Forms"}
          </span>
          {submission && (
            <Badge variant="outline" className="ml-auto font-mono text-[0.7rem]">
              {submission.source}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
        {submission === undefined && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {submission === null && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Note04Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>This response link is not valid</EmptyTitle>
              <EmptyDescription>
                The link may have been mistyped, or the response has since been
                deleted. Open the workspace dashboard to see current responses.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} variant="outline" render={<Link href="/app" />}>
                Go to the dashboard
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {submission && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                {submission.form.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                Submitted {formatDateTime(submission.submittedAt)}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Answers</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {submission.whatsapp && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      WhatsApp
                    </span>
                    <a
                      href={"https://wa.me/" + submission.whatsapp.replace(/\D/g, "")}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary tabular-nums hover:underline"
                    >
                      {submission.whatsapp}
                    </a>
                  </div>
                )}
                {submission.rows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No answers were recorded.
                  </p>
                )}
                {submission.rows.map((row) => (
                  <div key={row.key} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="text-sm break-words whitespace-pre-wrap">
                      {row.value}
                    </span>
                  </div>
                ))}

                {submission.files.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Attachments
                      </span>
                      {submission.files.map((file) => (
                        <a
                          key={file.name + file.size}
                          href={file.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-sm text-primary hover:underline"
                        >
                          {file.name} ({Math.round(file.size / 1024)} KB)
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {submission.formattedText}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onCopy}>
                    <HugeiconsIcon icon={ClipboardIcon} strokeWidth={2} />
                    Copy
                  </Button>
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={
                          "https://wa.me/?text=" +
                          encodeURIComponent(submission.formattedText)
                        }
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <HugeiconsIcon icon={WhatsappIcon} strokeWidth={2} />
                    Forward on WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
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
