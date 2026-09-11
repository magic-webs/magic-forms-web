"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

import { useSession } from "@/components/providers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, isAuthenticated, isLoading } = useSession();
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/app");
  }, [isLoading, isAuthenticated, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        name,
        email,
        password,
        workspaceName: company.trim() || undefined,
      });
      router.replace("/app");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message.replace(/^\[.*?\]\s*/, "").split("\n")[0]
          : "Could not create your account.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          One account, one company workspace, forms straight away.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} className="size-4" strokeWidth={2} />
          <AlertTitle>Could not sign you up</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="company">Company / workspace name</Label>
          <Input
            id="company"
            autoComplete="organization"
            placeholder="Acme Inc"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Becomes your workspace link. You can rename it later.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button type="submit" size="lg" disabled={submitting} className="mt-1">
          {submitting && <Spinner />}
          {submitting ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>

      <Separator />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
