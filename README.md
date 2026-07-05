# SaaS Platform

A production-grade multi-tenant SaaS boilerplate — workspace isolation,
RBAC, subscription billing, built as a Turborepo monorepo.

## Architecture decisions

- **Tenancy**: row-level isolation via tenant_id, enforced through
  Express middleware that resolves tenant context before every request.
- **Auth**: JWT-based, issued via NextAuth on the frontend and verified
  independently by the API's own auth middleware.
- **Billing**: Stripe webhooks are idempotent — processed event IDs are
  cached in Redis (7-day TTL) to prevent double-processing on replay.
- **Database**: Prisma 7 with the @prisma/adapter-pg driver adapter,
  connection managed via prisma.config.ts rather than the schema file.

## Stack

| Layer    | Technology                         |
| -------- | ---------------------------------- |
| Frontend | Next.js 15 (App Router)            |
| Backend  | Node.js + Express 5                |
| Database | PostgreSQL + Prisma 7 (adapter-pg) |
| Cache    | Redis                              |
| Auth     | NextAuth.js                        |
| Billing  | Stripe                             |
| Monorepo | Turborepo + pnpm workspaces        |
| Infra    | Docker + GitHub Actions            |

## Running locally

\`\`\`bash
cp apps/api/.env.example apps/api/.env
cp packages/database/.env.example packages/database/.env
docker compose up -d
pnpm install
pnpm --filter @repo/database db:generate
pnpm --filter @repo/database exec prisma migrate dev
pnpm dev
\`\`\`

## What I'd add in production

- BullMQ job queue for async tasks (email, webhook retries)
- Per-tenant audit log table
- Usage metering for seat-based billing
- OpenTelemetry distributed tracing

## Documentation

- [Architecture & component reference](docs/ARCHITECTURE.md) — what each part of the codebase does and why
- [Build log](docs/BUILD_LOG.md) — the debugging journey behind this project
