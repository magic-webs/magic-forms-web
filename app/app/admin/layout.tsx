"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldCheckIcon } from "@hugeicons/core-free-icons";

import { api } from "@/convex/_generated/api";
import { AdminHeader } from "@/components/admin-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/**
 * Guards the whole console in one place, so each page below can assume the
 * caller is staff and query straight away. Convex re-checks the role on every
 * function underneath — this only decides what to render.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = useQuery(api.auth.me);

  if (me === undefined) {
    return (
      <>
        <AdminHeader title="Admin console" />
        <div className="flex flex-1 items-center justify-center p-6">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </>
    );
  }

  if (me?.role !== "admin") {
    return (
      <>
        <AdminHeader title="Admin console" />
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ShieldCheckIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>Administrators only</EmptyTitle>
              <EmptyDescription>
                This console is for Magic Forms platform staff. Your workspaces
                are unaffected.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
