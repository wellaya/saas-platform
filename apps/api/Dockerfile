FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile

COPY packages/database ./packages/database
COPY apps/api ./apps/api

RUN pnpm --filter @repo/database db:generate
RUN pnpm --filter api build

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]