# Build Log: Notes from Building This Platform

This document covers the real engineering decisions, dead ends, and fixes that shaped this project. Most READMEs show you the finished architecture; this one shows some of the reasoning and debugging that got it there, because that context is often more useful than the final diagram on its own.

## The starting architecture

The plan was straightforward on paper: a Next.js frontend, an Express API, a shared PostgreSQL database with row-level tenant isolation, Stripe for subscription billing, all wired together in a Turborepo monorepo. Multi-tenancy, RBAC, and billing are problems every real SaaS product has to solve, so this project was built around solving them properly rather than around a toy feature.

## Working against a moving target

A meaningful part of this build involved tooling that changed mid-project, not just application logic. Turborepo renamed its config schema from `pipeline` to `tasks`. Prisma 7 removed the `url` field from `schema.prisma` entirely, moving connection configuration into a separate `prisma.config.ts` file and requiring an explicit driver adapter (`@prisma/adapter-pg`) rather than connecting directly. Express 5 changed how async errors propagate to middleware. Next.js renamed the `middleware.ts` convention to `proxy.ts`, including the name of the exported function itself.

None of these were bugs — they were current, intentional changes in actively maintained tools. The practical takeaway: verify the current API surface of a dependency rather than trusting cached knowledge of "how this framework normally works," especially for anything that changed a major version recently.

## Debugging: the error message is a starting point, not the answer

Several bugs in this project produced error messages that pointed in the wrong direction entirely.

Stripe's webhook signature verification failed with a message about payloads needing to be a raw Buffer instead of a parsed object. The real cause was middleware ordering: `express.json()` was parsing the request body globally before the webhook route could access the raw bytes needed for signature verification. The fix was a one-line reorder — mounting the webhook route before the global JSON parser — but finding it required tracing the full request lifecycle, not just reading the Stripe SDK's error text.

Similarly, a `"Tenant not found"` error turned out to be caused by tenant-resolution middleware treating `localhost` itself as if it were a tenant subdomain. A `PrismaClientValidationError` on a `tenant.update()` call turned out to be a `null` slug field from a manually inserted test row, not a schema problem. A generic `"Internal server error"` masked a missing per-route `express.json()` call.

In each case, the fix was small once found. Finding it required treating the error message as a symptom and reconstructing what had to be true about the data at that point in the flow for the failure to occur.

## Making failures visible during development

At one point, every failure surfaced as an opaque `{"error": "Internal server error"}` with no further detail. The turning point was temporarily modifying the error handler to return the actual error message and stack trace in the response body during local development:

```ts
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  res.status(500).json({
    error: "Internal server error",
    debug: err instanceof Error ? err.message : String(err),
  });
}
```

This turned every subsequent bug from a guessing exercise into a direct fix, and it's worth calling out as a deliberate practice rather than an accident: error visibility during development is infrastructure, not an afterthought. It gets reverted before anything resembling production.

## The real complexity was in the seams

Individually, every tool in this stack is mature and well-documented. The friction consistently showed up in the interactions between tools rather than any single one:

- Prisma 7's new driver-adapter model needed to be reconciled with a CommonJS-based Express setup.
- Stripe's webhook lifecycle doesn't map cleanly onto intuition — a new subscription fires `customer.subscription.created`, not `customer.subscription.updated`, so handling only one of these silently drops the very first event of every subscription's life.
- A Turborepo monorepo's shared TypeScript config (`@repo/typescript-config`) has to be explicitly extended by every workspace package, or type-checking passes locally while quietly missing coverage.

This is the pattern worth naming: most of the actual engineering work in a system like this isn't inside any one framework, it's in the boundaries where assumptions from one tool meet assumptions from another.

## Testing strategy that actually caught bugs

Testing the webhook handler in isolation first, using `stripe trigger` to fire synthetic events, surfaced bugs (missing metadata guards, unhandled event types) before a single real checkout was ever attempted. Only after the webhook handler was confirmed correct in isolation was the full checkout-to-webhook flow tested end to end. Debugging one layer at a time, with the other layers already trusted, made root-causing dramatically faster than testing the whole flow from the start.

## Current state

Working end to end: tenant creation and row-level isolation, JWT-based auth resolution independent of the frontend session layer, and a complete Stripe subscription flow with idempotent webhook handling backed by Redis. CI runs lint, type-checking, and build on every push via GitHub Actions.

Open next: the invite flow, deployment to free-tier hosting (Vercel, Render, Neon, Upstash), and usage metering for seat-based billing.
