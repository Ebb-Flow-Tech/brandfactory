# syntax=docker/dockerfile:1.7
#
# Production image for `@brandfactory/server`. Two stages:
#   1. builder — pnpm install + `pnpm deploy --prod` to materialize a
#      standalone tree under /out with workspace deps copied (not symlinked)
#      into /out/node_modules/@brandfactory/*.
#   2. runtime — node:20-alpine, copies /out into /app, runs via tsx.
#
# Notes:
#   - No TypeScript build step. The monorepo has no `tsc` pipeline (see
#     docs/completions/phase2-hosted.md for the rationale); we ship source
#     and run with `tsx` at runtime. `tsx` is a prod dep of
#     @brandfactory/server so `--prod` keeps it.
#   - `pnpm deploy` needs `--legacy` under pnpm v10 unless
#     `inject-workspace-packages=true` is set repo-wide. The legacy impl
#     does what we need (copy workspace packages into node_modules) without
#     touching workspace config.

ARG NODE_VERSION=20.11.0

############################
# Stage 1 — builder
############################
FROM node:${NODE_VERSION}-alpine AS builder

RUN corepack enable
WORKDIR /repo

# Manifests first for a stable `pnpm install` layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/adapters/auth/package.json packages/adapters/auth/package.json
COPY packages/adapters/llm/package.json packages/adapters/llm/package.json
COPY packages/adapters/realtime/package.json packages/adapters/realtime/package.json
COPY packages/adapters/storage/package.json packages/adapters/storage/package.json
COPY packages/server/package.json packages/server/package.json
# Web's manifest has to be present or pnpm's workspace resolution warns;
# its source is excluded via .dockerignore so the image stays server-only.
COPY packages/web/package.json packages/web/package.json

RUN pnpm install --frozen-lockfile

# Sources for the server + every workspace package it depends on at runtime.
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/agent packages/agent
COPY packages/adapters packages/adapters
COPY packages/server packages/server

# Materialize a standalone deploy target at /out. --prod strips
# devDependencies; --legacy is required under pnpm v10 (see file header).
RUN pnpm --filter=@brandfactory/server deploy --prod --legacy /out

############################
# Stage 2 — runtime
############################
FROM node:${NODE_VERSION}-alpine AS runtime

# tini forwards SIGINT/SIGTERM cleanly; main.ts' graceful-shutdown path
# depends on receiving the signal rather than PID 1's default SIGKILL.
RUN apk add --no-cache tini

WORKDIR /app
COPY --from=builder /out /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/main.ts"]
