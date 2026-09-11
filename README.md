# Magic Forms

A multi-tenant form platform: every company gets a workspace, every workspace
gets a multi-step form builder with 23 field types, and every form gets a public
link, a submissions store, a REST API and webhooks on each event.

- **Frontend** — Next.js 16 (App Router) + shadcn/ui (`base-nova` style, built on Base UI)
- **Backend** — Convex only: database, queries/mutations/actions, file storage,
  scheduling, HTTP endpoints and authentication

## Getting started

```bash
bun install
npx convex dev      # deploys convex/ and watches for changes
bun dev             # http://localhost:3000
```

`.env.local` needs `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`.

### First-time deployment setup

Magic Forms signs its own access tokens, so each deployment needs a signing key.
One command generates the keypair and stores it — there is nothing to copy by
hand:

```bash
node scripts/setup-auth-keys.mjs
```

It sets `JWT_PRIVATE_KEY`, `JWKS` and `JWT_KID` on the deployment `npx convex`
is currently pointed at, refuses to overwrite keys that already look valid, and
reads them back to confirm. Pass `--force` to rotate, which signs everyone out.

> If sign-in fails with `Failed to execute 'atob'`, `JWT_PRIVATE_KEY` is not
> valid base64 — run the script again to repair it.

Create the platform administrator (never exposed to clients):

```bash
npx convex run auth:createAdmin '{"email":"you@example.com","name":"Your Name","password":"a-strong-password"}'
```

## Deploying

### Convex (production)

Dev and prod are separate databases with separate keys, so production needs the
same two setup steps once:

```bash
npx convex deploy                       # push functions, schema and indexes
node scripts/setup-auth-keys.mjs --prod # signing keys for THIS deployment
npx convex run auth:createAdmin '{"email":"…","name":"…","password":"…"}' --prod
```

Without the keys, every sign-in on production fails with
`Failed to execute 'atob'` — a token signed for dev is meaningless to prod.

### Vercel

Point the project at this directory and override the build command so Convex
deploys in the same step and hands the build its URL:

```
Build command:  npx convex deploy --cmd 'next build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
Install:        (leave as detected)
Output:         (leave as detected)
```

Environment variables:

| Name | Value | Notes |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | production deploy key | Convex dashboard → Settings → Deploy keys. This is what targets prod; keep it secret |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<deployment>.convex.site` | The `.site` domain, not `.cloud`. Nothing injects this — it backs the API endpoints shown in the UI |

`NEXT_PUBLIC_CONVEX_URL` is supplied by `convex deploy --cmd`, so do not set it
by hand. Do **not** set `CONVEX_DEPLOYMENT` on Vercel — that variable selects
your *dev* deployment and is for local use only.

Both `NEXT_PUBLIC_*` values are inlined at build time, so changing either one
needs a redeploy, not just a restart.

For preview deployments, add a *preview* deploy key instead and give each
preview its own signing keys with
`node scripts/setup-auth-keys.mjs --preview-name <branch>`.

## How authentication works

There is no third-party auth provider. Convex is the identity provider:

1. `auth.signIn` verifies a PBKDF2-SHA256 password hash and mints a 30-minute
   RS256 access token plus a 30-day refresh token (stored only as a SHA-256 hash).
2. `convex/http.ts` publishes `/.well-known/openid-configuration` and
   `/.well-known/jwks.json`.
3. `convex/auth.config.ts` points Convex at its own site URL, so
   `ctx.auth.getUserIdentity()` validates those tokens natively.
4. The browser holds the refresh token and `ConvexProviderWithAuth` exchanges it
   for access tokens as they expire.

No function ever takes a user id as an argument for authorization; every check
derives the caller from `ctx.auth`.

## Roles

| Scope | Role | Can do |
| --- | --- | --- |
| Platform | `admin` | Sees every account and workspace; can change roles and disable accounts |
| Workspace | `owner` | Everything, including deleting the workspace |
| Workspace | `admin` | Members, webhooks, API keys, forms, responses |
| Workspace | `editor` | Builds forms, manages responses |
| Workspace | `viewer` | Read-only |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/sign-in`, `/sign-up` | Authentication |
| `/app` | Redirects into your first workspace |
| `/app/w/{workspaceId}` | Workspace overview |
| `/app/w/{workspaceId}/forms` | Form list |
| `/app/w/{workspaceId}/forms/{formId}` | Builder — Build / Preview / Settings / Share |
| `/app/w/{workspaceId}/forms/{formId}/responses` | One form's responses + CSV export |
| `/app/w/{workspaceId}/responses` | Every response in the workspace |
| `/app/w/{workspaceId}/webhooks` | Endpoints and the delivery log |
| `/app/w/{workspaceId}/api` | API keys and endpoint reference |
| `/app/w/{workspaceId}/members` | Members and roles |
| `/app/w/{workspaceId}/settings` | Workspace settings |
| `/app/admin` | Platform admin console |
| `/w/{workspaceSlug}` | **Public** — every published form in a workspace |
| `/f/{workspaceSlug}/{formSlug}` | **Public** — a single form |

## Field types

Text · Long answer · Email · Phone · URL · Password · Number · Date · Time ·
Dropdown · Multi-select · Radio group · Checkbox group · Single checkbox ·
Switch · Slider · Star rating · One-time code · File upload · Hidden ·
Heading · Paragraph · Divider

Each field is full, half or third width and collapses to one column on a phone.
Validation (required, min/max, length, regex, file size and type) runs in the
renderer *and* again in Convex, so the HTTP API cannot bypass it.

## REST API

Base URL is `NEXT_PUBLIC_CONVEX_SITE_URL`. CORS is open on all three endpoints.

```bash
# Published forms in a workspace
GET /api/v1/forms/{workspaceSlug}

# One form's steps, fields, options and validation rules
GET /api/v1/forms/{workspaceSlug}/{formSlug}

# Create a submission — values may be strings, numbers, booleans or arrays
POST /api/v1/submit/{workspaceSlug}/{formSlug}
     {"full_name": "Ada Lovelace", "use_cases": ["onboarding"]}
     -> 201 | 422 with {issues:[{key,message}]} | 404

# Read stored responses (requires a workspace API key)
GET /api/v1/submissions?form={formSlug}&limit=50
    Authorization: Bearer mf_live_...
```

API keys are shown once and stored only as a SHA-256 digest.

## Webhooks

Ten events: `form.created`, `form.updated`, `form.published`,
`form.unpublished`, `form.deleted`, `form.viewed`, `form.step_completed`,
`submission.created`, `submission.updated`, `submission.deleted`.

A webhook is scoped to the whole workspace, or to a single form. Deliveries are
scheduled (never blocking the mutation), retried twice on a network error or 5xx
with a 15s then 60s backoff, and logged with status code, response body and
duration.

Every request carries:

```
x-magicforms-event      submission.created
x-magicforms-delivery   <delivery id>
x-magicforms-timestamp  <unix seconds>
x-magicforms-signature  sha256=<hmac>
```

where the HMAC is `HMAC-SHA256(secret, timestamp + "." + rawBody)`.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const expected =
  "sha256=" +
  createHmac("sha256", secret)
    .update(req.headers["x-magicforms-timestamp"] + "." + rawBody)
    .digest("hex");

timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-magicforms-signature"]));
```

## Backend layout

```
convex/
  schema.ts          tables, field types, webhook events
  auth.ts            sign up / in / out, token refresh, createAdmin
  auth.config.ts     points Convex at its own JWKS
  http.ts            JWKS + OIDC discovery, and the public REST API
  workspaces.ts      workspaces, members, roles, stats
  forms.ts           forms, steps, fields, ordering
  submissions.ts     responses, CSV export, read state
  webhooks.ts        endpoints, signed delivery with retries, delivery log
  apiKeys.ts         hashed keys
  admin.ts           platform console
  publicForms.ts     unauthenticated form rendering and submission
  api.ts             query/mutation backends for the REST endpoints
  cleanup.ts         batched cascade deletes, scheduled pruning
  crons.ts           six-hourly housekeeping
  lib/
    crypto.ts        PBKDF2, SHA-256, HMAC, RS256 JWT signing (actions only)
    authz.ts         requireUser / requireWorkspaceAccess / requireFormAccess
    events.ts        webhook fan-out
    validate.ts      server-side submission validation
```

## UI

Everything is composed from `components/ui/*` (shadcn) — no bespoke UI
primitives. The three app-level compositions are `components/app-sidebar.tsx`
(the workspace sidebar), `components/field-control.tsx` (renders one field of any
type) and `components/form-renderer.tsx` (the multi-step form used by both the
public page and the builder preview).
