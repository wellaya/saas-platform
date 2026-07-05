FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile

COPY packages/database ./packages/database
COPY apps/web ./apps/web

RUN pnpm --filter @repo/database db:generate
RUN pnpm --filter web build

EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]