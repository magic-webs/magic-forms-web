import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Analytics01Icon,
  ArrowRight02Icon,
  Building02Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Database01Icon,
  Layers01Icon,
  Link03Icon,
  Mail01Icon,
  RadioButtonIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StarIcon,
  Upload01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

const FIELD_TYPES = [
  "Short answer",
  "Long answer",
  "Email",
  "Phone",
  "URL",
  "Password",
  "Number",
  "Date",
  "Time",
  "Dropdown",
  "Multi-select",
  "Radio group",
  "Checkbox group",
  "Single checkbox",
  "Switch",
  "Slider",
  "Star rating",
  "One-time code",
  "File upload",
  "Hidden field",
  "Heading",
  "Paragraph",
  "Divider",
];

const FEATURES = [
  { icon: Layers01Icon, title: "Multi-step", body: "Up to 20 steps, with a progress bar." },
  { icon: Building02Icon, title: "Workspaces", body: "One per company, with member roles." },
  { icon: Link03Icon, title: "Shareable links", body: "One per form, one per workspace." },
  { icon: Database01Icon, title: "Submissions", body: "Stored, filterable, CSV on demand." },
  { icon: WebhookIcon, title: "Webhooks", body: "10 events, signed and retried." },
  { icon: CodeIcon, title: "REST API", body: "Read schemas, post, pull responses." },
];

const FIELD_ICONS = [
  { icon: Mail01Icon, label: "Email" },
  { icon: Calendar03Icon, label: "Date" },
  { icon: RadioButtonIcon, label: "Choice" },
  { icon: SlidersHorizontalIcon, label: "Slider" },
  { icon: StarIcon, label: "Rating" },
  { icon: Upload01Icon, label: "Upload" },
];

const STEPS = [
  { icon: Building02Icon, title: "Create a workspace" },
  { icon: Layers01Icon, title: "Build the form" },
  { icon: Link03Icon, title: "Share the link" },
  { icon: Analytics01Icon, title: "Watch it land" },
];

const PAYLOAD_SAMPLE = `{
  "event": "submission.created",
  "formSlug": "demo-request",
  "data": {
    "full_name": "Ada Lovelace",
    "work_email": "ada@analytical.dev",
    "use_cases": ["Onboarding", "Support"]
  }
}`;

const CURL_SAMPLE = `curl -X POST \\
  .../api/v1/submit/acme-inc/demo-request \\
  -H 'content-type: application/json' \\
  -d '{ "full_name": "Ada Lovelace" }'`;

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      {/* ---------- nav ---------- */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} priority />
            <span className="text-sm font-semibold tracking-tight">Magic Forms</span>
          </Link>

          <div className="ml-4 hidden items-center gap-1 md:flex">
            <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="#features" />}>
              Features
            </Button>
            <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="#fields" />}>
              Fields
            </Button>
            <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="#developers" />}>
              Developers
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
            <Button nativeButton={false} size="sm" render={<Link href="/sign-up" />}>
              Start building
              <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5" strokeWidth={2} />
            </Button>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ---------- hero ---------- */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_-10%,var(--primary)_0%,transparent_45%)] opacity-[0.10]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
          />

          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <div className="flex flex-col items-start gap-6">
              <Badge variant="secondary" className="gap-1.5">
                <HugeiconsIcon icon={SparklesIcon} className="size-3.5" strokeWidth={2} />
                23 field types · multi-step · webhooks
              </Badge>

              <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Forms your whole company
                <span className="block text-primary">can actually ship.</span>
              </h1>

              <p className="max-w-md text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Build it, share one link, collect the answers.
              </p>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button nativeButton={false} size="lg" render={<Link href="/sign-up" />}>
                  Create your workspace
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" strokeWidth={2} />
                </Button>
                <Button nativeButton={false} size="lg" variant="outline" render={<Link href="#developers" />}>
                  <HugeiconsIcon icon={CodeIcon} className="size-4" strokeWidth={2} />
                  API
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                {["No credit card", "Realtime", "Mobile ready"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      className="size-3.5 text-primary"
                      strokeWidth={2}
                    />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* a real form, built from the same components the renderer uses */}
            <Card className="relative w-full shadow-xl shadow-black/[0.06] lg:rotate-[0.6deg]">
              <CardHeader className="gap-3">
                <Progress value={66} className="gap-1.5">
                  <div className="flex w-full items-center justify-between">
                    <ProgressLabel className="text-xs font-medium text-muted-foreground">
                      Step 2 of 3 · About your team
                    </ProgressLabel>
                    <ProgressValue className="text-xs" />
                  </div>
                </Progress>
                <CardTitle className="text-lg">Enterprise demo request</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="lp-name">Full name</Label>
                    <Input id="lp-name" defaultValue="Ada Lovelace" readOnly />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="lp-email">Work email</Label>
                    <Input
                      id="lp-email"
                      type="email"
                      defaultValue="ada@analytical.dev"
                      readOnly
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Team size</Label>
                  <RadioGroup defaultValue="51-200" className="grid grid-cols-3 gap-2">
                    {["1-50", "51-200", "200+"].map((size) => (
                      <Label
                        key={size}
                        className="flex items-center gap-2 rounded-lg border p-2.5 text-xs font-normal"
                      >
                        <RadioGroupItem value={size} />
                        {size}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="lp-notes">What would you like to see?</Label>
                  <Textarea
                    id="lp-notes"
                    rows={2}
                    readOnly
                    defaultValue="Onboarding intake and support triage."
                  />
                </div>

                <Label className="flex items-start gap-2.5 text-xs font-normal text-muted-foreground">
                  <Checkbox defaultChecked className="mt-0.5" />
                  Send me the recording afterwards.
                </Label>

                <Separator />

                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm">
                    Back
                  </Button>
                  <Button size="sm">
                    Continue
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      className="size-3.5"
                      strokeWidth={2}
                    />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ---------- stat strip ---------- */}
        <section className="border-b bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-y px-4 sm:px-6 lg:grid-cols-4 lg:divide-y-0">
            {[
              { value: "23", label: "field types", icon: Add01Icon },
              { value: "20", label: "steps per form", icon: Layers01Icon },
              { value: "10", label: "webhook events", icon: WebhookIcon },
              { value: "3", label: "REST endpoints", icon: CodeIcon },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 p-5 lg:p-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
                  <HugeiconsIcon icon={stat.icon} className="size-4 text-primary" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-xl font-semibold tracking-tight">{stat.value}</div>
                  <div className="truncate text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section id="features" className="scroll-mt-16 border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="max-w-lg text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything from first field to fired webhook
            </h2>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="h-full">
                  <CardHeader>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <HugeiconsIcon icon={feature.icon} className="size-4.5" strokeWidth={2} />
                    </span>
                    <CardTitle className="mt-3 text-base">{feature.title}</CardTitle>
                    <CardDescription>{feature.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- field types ---------- */}
        <section id="fields" className="scroll-mt-16 border-b bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
            <div className="flex flex-col gap-5">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Every input you were going to ask for
              </h2>
              <div className="flex flex-wrap gap-2">
                {FIELD_ICONS.map((item) => (
                  <span
                    key={item.label}
                    className="flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-xs ring-1 ring-border"
                  >
                    <HugeiconsIcon icon={item.icon} className="size-3.5 text-primary" strokeWidth={2} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap content-start gap-2">
              {FIELD_TYPES.map((type) => (
                <Badge key={type} variant="secondary" className="px-2.5 py-1 text-xs font-normal">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <div key={step.title} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <HugeiconsIcon
                      icon={step.icon}
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={2}
                    />
                    <span className="truncate text-sm font-medium">{step.title}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- developers ---------- */}
        <section id="developers" className="scroll-mt-16 border-b bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
            <div className="flex flex-col gap-4">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Signed webhooks, plain REST
              </h2>
              <div className="flex flex-wrap gap-2">
                {["HMAC-SHA256", "Auto retries", "Delivery log", "CORS open"].map((chip) => (
                  <Badge key={chip} variant="outline" className="font-normal">
                    {chip}
                  </Badge>
                ))}
              </div>
            </div>

            <Tabs defaultValue="payload" className="min-w-0">
              <TabsList>
                <TabsTrigger value="payload">Webhook</TabsTrigger>
                <TabsTrigger value="curl">REST</TabsTrigger>
              </TabsList>
              {[
                { value: "payload", code: PAYLOAD_SAMPLE },
                { value: "curl", code: CURL_SAMPLE },
              ].map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="min-w-0">
                  <Card className="overflow-hidden bg-background py-0">
                    <div className="overflow-x-auto">
                      <pre className="p-4 text-[0.78rem] leading-6">
                        <code className="font-mono">{tab.code}</code>
                      </pre>
                    </div>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        {/* ---------- final cta ---------- */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,var(--primary)_0%,transparent_55%)] opacity-[0.12]"
          />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6">
            <Logo size={56} />
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Your first form is minutes away
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button nativeButton={false} size="lg" render={<Link href="/sign-up" />}>
                Start building free
                <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" strokeWidth={2} />
              </Button>
              <Button nativeButton={false} size="lg" variant="outline" render={<Link href="/sign-in" />}>
                Sign in
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="text-sm font-medium">Magic Forms</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built with Next.js, shadcn/ui and Convex.
          </p>
        </div>
      </footer>
    </div>
  );
}
