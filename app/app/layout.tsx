"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";

import { AppSidebar } from "@/components/app-sidebar";
import { useSession } from "@/components/providers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();

  // Bounce to sign-in as soon as we know there is no usable session.
  React.useEffect(() => {
    if (!session.isLoading && !session.isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [session.isLoading, session.isAuthenticated, router]);

  if (session.isLoading || (session.isAuthenticated && isLoading)) {
    return (
      <div className="flex min-h-svh flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-svh flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
