"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** The bar every admin console page opens with. */
export function AdminHeader({
  title,
  badge = "platform",
  children,
}: {
  title: string;
  badge?: string;
  /** Actions pinned to the right of the bar. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <span className="truncate text-sm font-medium">{title}</span>
      <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">
        {badge}
      </Badge>
      {children && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </header>
  );
}
