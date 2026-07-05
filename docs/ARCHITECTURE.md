# Architecture & Component Reference

This document explains what each part of the codebase does and why it exists. Where `BUILD_LOG.md` covers the debugging journey, this doc covers the finished structure — read this first if you want to understand how the system fits together before diving into any single file.

## High-level shape

The project is a Turborepo monorepo with two applications and one shared package:

```
saas-platform/
├── apps/
│   ├── web/     — Next.js frontend (what users see)
│   └── api/     — Express backend (business logic, billing, auth verification)
├── packages/
│   └── database/ — Shared Prisma schema and client, used by both apps
```

The frontend and backend are deployed and scaled independently, but they share one source of truth for the database schema through `packages/database`. Neither app owns the schema itself — they both consume it.

## packages/database — the shared data layer

**Responsibility:** define the data model once, and give both `apps/web` and `apps/api` a type-safe way to query it.

- **`prisma/schema.prisma`** — defines four models: `Tenant`, `User`, `UserTenant`, and `Invite`. `Tenant` represents a customer workspace. `User` is a person, independent of any tenant. `UserTenant` is the join table that connects a user to a tenant with a specific `Role` (`OWNER`, `ADMIN`, `MEMBER`) — this is what makes the RBAC model work, since a single user can belong to multiple tenants with different roles in each. `Invite` stores pending invitations with an expiring token.

- **`prisma.config.ts`** — holds the database connection configuration. In Prisma 7, this moved out of the schema file itself; the schema now only describes structure, not connection details.

- **`src/client.ts`** — creates the actual `PrismaClient` instance, wired to a `PrismaPg` driver adapter. This adapter is what actually opens the PostgreSQL connection; without it, Prisma 7 has no way to talk to the database.

- **`src/index.ts`** — re-exports the client and all generated types, so other packages import everything through one path: `@repo/database`.

**Why this exists as its own package** rather than living inside `apps/api`: both the frontend and backend need to read the same `Tenant` and `User` shapes. Duplicating the schema in two places would let them drift out of sync.

## apps/api — the backend

**Responsibility:** enforce business rules that shouldn't live in the browser — tenant isolation, authentication verification, and billing logic.

### Entry point

- **`src/server.ts`** — wires every middleware and router together, in a specific order that matters. Security headers (`helmet`) and CORS are applied first. The Stripe billing router is mounted *before* the global JSON body parser, because Stripe's webhook signature verification needs the raw, unparsed request body — parsing it into an object first would make verification impossible. Everything else gets JSON parsing and tenant resolution as normal.

### Middleware

- **`src/middleware/tenant.ts`** — runs on tenant-scoped routes. It reads a `x-tenant-slug` header (or falls back to the request's subdomain), looks up the matching `Tenant` row, and attaches it to `req.tenant`. Every downstream handler then trusts `req.tenant`, never a raw ID from the request body — this is what actually enforces row-level isolation, rather than isolation being a suggestion each route has to remember to implement itself.

- **`src/middleware/auth.ts`** — verifies the JWT sent in the `Authorization` header and attaches the decoded payload (`sub`, `email`, `tenantId`, `role`) to `req.user`. This runs independently of the frontend's own session handling — the API never trusts the frontend blindly, it re-verifies the token itself on every protected request.

- **`src/middleware/errorHandler.ts`** — the last middleware in the chain. Any error thrown or rejected anywhere upstream (including inside `async` route handlers — Express 5 auto-forwards these) ends up here, gets logged, and returns a generic message to the client so internal details never leak in a production response.

- **`src/types/express.d.ts`** — a TypeScript declaration file that extends Express's built-in `Request` type to know about `req.tenant` and `req.user`. Without this, TypeScript would reject any code that reads those properties, since they don't exist on the vanilla Express type.

### Modules (feature areas)

Each module folder groups a router with its related service logic — this is the "domain-driven" structure mentioned in the build log, as opposed to organizing files by technical type (all routes in one folder, all services in another).

- **`src/modules/tenants/tenants.router.ts`** — exposes `GET /api/tenants/me` (returns the current tenant plus its member list) and `POST /api/tenants` (creates a new tenant and assigns the creating user as `OWNER`).

- **`src/modules/billings/billing.service.ts`** — contains `createCheckoutSession`, which looks up a tenant, then asks Stripe to create a subscription checkout session for it. This is pure business logic with no HTTP concerns — it doesn't know or care that it's being called from a route handler, which makes it independently testable.

- **`src/modules/billings/billing.router.ts`** — exposes two routes. `POST /api/billing/checkout` accepts a `tenantId` and `priceId` and returns a Stripe-hosted checkout URL. `POST /api/billing/webhook` receives events from Stripe, verifies each one's signature, and reacts to subscription lifecycle events (`customer.subscription.created` and `customer.subscription.updated`) by updating the tenant's `plan` field. It checks Redis before processing each event, and records the event ID afterward — this idempotency check is what prevents the same event from updating the database twice if Stripe retries a delivery.

### Supporting libraries

- **`src/lib/redis.ts`** — a single shared Redis client instance, used specifically for the webhook idempotency cache described above.

## apps/web — the frontend

**Responsibility:** everything the end user directly interacts with, plus the client-facing half of authentication.

- **`app/api/auth/[...nextauth]/route.ts`** — configures NextAuth with a credentials provider. It looks up a `User` by email, and on success issues a session. This is the frontend's own auth layer — separate from, but ultimately trusted by, the API's independent JWT verification.

- **`proxy.ts`** (project root) — Next.js's request-interception layer, run on every incoming request before it reaches a page. It inspects the request's hostname, extracts a subdomain as the tenant slug, and attaches it as a header. This is what makes multi-tenant routing possible — `acme.yoursaas.com` and `other.yoursaas.com` can both hit the same deployed app and get routed to the correct tenant's data.

- **Route groups under `app/`** — Next.js route groups (the parenthesized folder names) organize pages by audience without affecting the URL structure:
  - **`(marketing)`** — the public landing page, accessible with no auth and no tenant context.
  - **`(auth)/login`, `(auth)/signup`** — authentication pages, also public.
  - **`(app)/[tenantSlug]/dashboard`** — the actual product surface, scoped to a specific tenant via the dynamic `[tenantSlug]` segment.
  - **`(admin)/admin/tenants`** — a super-admin view with cross-tenant visibility, intended for internal use only, not for regular tenant users.

## How a request actually flows

To make the pieces above concrete, here's what happens on a real request — a tenant user loading their dashboard:

1. The browser requests `acme.yoursaas.com/dashboard`.
2. `proxy.ts` intercepts it, extracts `acme` as the slug, attaches it as a header.
3. The `(app)/[tenantSlug]/dashboard/page.tsx` server component renders, reading the session via NextAuth to know who's logged in.
4. If that page needs backend data, it calls the API, which runs `tenantMiddleware` (resolving `acme` to a real `Tenant` row) and `authMiddleware` (verifying the user's JWT) before any route handler logic executes.
5. The route handler reads `req.tenant.id` and `req.user`, never a raw value from the request body, and queries Prisma scoped to that tenant.

And on a billing event:

1. A user completes Stripe Checkout.
2. Stripe sends a webhook to `/api/billing/webhook`, with a raw, signed body.
3. `billing.router.ts` verifies the signature using the raw body, checks Redis for a duplicate, and if new, updates the relevant `Tenant.plan` field directly in Postgres via `@repo/database`.

## Where to look if you're extending this

- **Adding a new tenant-scoped resource** (e.g., "Projects"): add a model to `schema.prisma`, then a new module folder under `apps/api/src/modules/`, following the same router + service split as `billings`.
- **Adding a new protected page**: add it under `(app)/[tenantSlug]/`, and call `getServerSession()` the same way the dashboard page does.
- **Adding a new Stripe event type to handle**: extend the `if` condition in `billing.router.ts`'s webhook handler — the idempotency and error-handling scaffolding around it already applies to any event type you add.
