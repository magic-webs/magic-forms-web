import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  MagicWand01Icon,
} from "@hugeicons/core-free-icons";

const HIGHLIGHTS = [
  "23 field types, from short answer to file upload",
  "Multi-step forms with a progress bar, responsive on any screen",
  "One link per form, one directory link per workspace",
  "Submissions stored, exportable, and pushed over webhooks",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-1 flex-col lg:grid lg:grid-cols-2">
      {/* left: the pitch, hidden on small screens */}
      <div className="relative hidden overflow-hidden border-r bg-muted/30 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,var(--primary)_0%,transparent_50%)] opacity-[0.12]"
        />
        <Link href="/" className="relative flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon icon={MagicWand01Icon} className="size-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Magic Forms</span>
        </Link>

        <div className="relative flex flex-col gap-6">
          <h2 className="max-w-md text-balance text-3xl font-semibold leading-tight tracking-tight">
            Forms your whole company can actually ship.
          </h2>
          <ul className="flex flex-col gap-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  strokeWidth={2}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Built with Next.js, shadcn/ui and Convex.
        </p>
      </div>

      {/* right: the form */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon icon={MagicWand01Icon} className="size-4" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold tracking-tight">Magic Forms</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
