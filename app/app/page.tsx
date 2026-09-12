"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Building02Icon, MagicWand01Icon } from "@hugeicons/core-free-icons";

import { Logo } from "@/components/logo";

import { api } from "@/convex/_generated/api";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function AppHomePage() {
  const router = useRouter();
  const workspaces = useQuery(api.workspaces.list);

  // Land people straight in their workspace; the switcher handles the rest.
  React.useEffect(() => {
    if (workspaces && workspaces.length > 0) {
      router.replace(`/app/w/${workspaces[0]._id}`);
    }
  }, [workspaces, router]);

  if (workspaces === undefined || workspaces.length > 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <Logo size={20} />
        <span className="text-sm font-medium">Magic Forms</span>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Building02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No workspaces yet</EmptyTitle>
            <EmptyDescription>
              A workspace holds one company&apos;s forms, responses and webhooks.
              Create your first one from the switcher at the top of the sidebar.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={MagicWand01Icon}
                className="size-3.5"
                strokeWidth={2}
              />
              Open the sidebar switcher and choose “New workspace”.
            </span>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}
