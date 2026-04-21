# Scaffolding Implementation Plan

Goal: stand up a minimal, runnable BrandFactory skeleton that matches
[../architecture.md](../architecture.md). This plan is about the *frame*, not
features. Each phase ends with something you can boot and verify.

## Conventions

- **Monorepo:** pnpm workspaces, flat layout. All workspaces under
  `packages/*` (and `packages/adapters/*`). Package names are scoped:
  `@brandfactory/web`, `@brandfactory/server`, `@brandfactory/shared`,
  `@brandfactory/db`, `@brandfactory/agent`, `@brandfactory/adapter-auth`,
  etc.
- **Node:** pinned via `.nvmrc` / `engines`. Target Node 20 LTS minimum.
- **TypeScript:** strict mode everywhere. Shared `tsconfig.base.json` at the
  root, extended by each package.
- **Lint/format:** ESLint (flat config) + Prettier at the root.
- **Commit style:** Conventional Commits (`feat:`, `chore:`, etc.).
- **Done = runnable.** Every phase ends with a smoke check you can run.

---

## Phase 0 — Repo foundation

**Outcome:** empty but well-shaped monorepo that installs cleanly and lints.

Tasks:
- [ ] Initialize pnpm workspaces (`pnpm-workspace.yaml`, root `package.json`).
- [ ] Add `.nvmrc`, `.editorconfig`, `.gitignore`, `.gitattributes`.
- [ ] Root `tsconfig.base.json` with strict compiler settings + path aliases.
- [ ] Root ESLint flat config + Prettier config + `.prettierignore`.
- [ ] Husky + lint-staged for pre-commit lint/format (optional but cheap).
- [ ] `scripts/dev.sh` and root `package.json` scripts: `dev`, `build`,
      `lint`, `format`, `typecheck`, `test`.
- [ ] `pnpm-workspace.yaml` includes both `packages/*` and
      `packages/adapters/*`.
- [ ] Create empty workspaces: `packages/web`, `packages/server`,
      `packages/shared`, `packages/db`, `packages/agent`,
      `packages/adapters/auth`, `packages/adapters/storage`,
      `packages/adapters/realtime`, `packages/adapters/llm`.

**Smoke check:** `pnpm install && pnpm lint && pnpm typecheck` succeeds on an
empty repo.

---

## Phase 1 — Shared package

**Outcome:** `packages/shared` exports initial domain types + zod schemas
consumable by both frontend and backend.

Tasks:
- [ ] Brand schema: `Brand`, `BrandGuidelines` (voice, audience, values,
      visual, messaging, custom fields).
- [ ] Workspace, Project (freeform | standardized discriminator), Canvas,
      CanvasBlock (text | image | file | snippet), Pin, ShortlistView.
- [ ] Agent event stream types: `AgentMessage`, `AgentToolCall`, `CanvasOp`,
      `PinOp`.
- [ ] Zod schemas mirroring the types, plus `infer` helpers.
- [ ] Export barrel + package `exports` field (ESM-only).

**Smoke check:** import a type and a zod schema from `packages/server` and
`packages/web`. Both typecheck.

---

## Phase 2 — Database package

**Outcome:** `packages/db` defines schema, runs migrations, talks to any
Postgres.

Tasks:
- [ ] Install `drizzle-orm`, `drizzle-kit`, `pg`.
- [ ] Connection module reading `DATABASE_URL` only (Supabase connection
      string = plain Postgres URL).
- [ ] Drizzle schema for initial tables: `users`, `workspaces`, `brands`,
      `brand_guidelines`, `projects`, `canvases`, `canvas_blocks`, `pins`.
      (Keep columns minimal — we can evolve.)
- [ ] `drizzle.config.ts` + migration output folder.
- [ ] Query helpers grouped by aggregate: `brands.ts`, `projects.ts`,
      `canvas.ts`. No business rules here.
- [ ] `pnpm db:generate`, `db:migrate`, `db:studio` scripts.
- [ ] Local dev Postgres via `docker/compose.yaml` (see Phase 8) OR reuse
      Supabase project.

**Smoke check:** `pnpm db:migrate` against a local Postgres creates the
tables. A simple query (`select 1`) runs via Drizzle from a scratch script.

---

## Phase 3 — Adapters: ports + default implementations

**Outcome:** `packages/adapters/*` exposes ports used by `packages/server`,
with one working default implementation per port.

Tasks:
- [ ] Define `AuthProvider`, `BlobStore`, `RealtimeBus`, `LLMProvider`
      interfaces. Ports can live in `packages/shared` (they're just types)
      or in a small `packages/adapters/core` package — pick one and be
      consistent.
- [ ] `adapters/auth/supabase`: verify JWT via Supabase Auth, `getUser` by id.
- [ ] `adapters/auth/local` (stub): dev-only bearer token, reads users from
      the `users` table. Lets us run without Supabase.
- [ ] `adapters/storage/local-disk`: writes under a configured path, serves
      via signed URLs issued by the api.
- [ ] `adapters/storage/supabase`: bucket upload + signed URL.
- [ ] `adapters/realtime/native-ws`: in-process pub/sub + WebSocket fan-out.
- [ ] `adapters/realtime/supabase` (stub, filled in later if needed).
- [ ] `adapters/llm`: provider factory supporting OpenRouter
      (`@openrouter/ai-sdk-provider`), Anthropic (`@ai-sdk/anthropic`),
      OpenAI (`@ai-sdk/openai`), and Ollama (`ollama-ai-provider`). Reads
      active provider + model from a settings source (env for dev, DB
      later). Multiple providers can be installed simultaneously.
- [ ] Env-driven wiring helper: `buildAdapters(env)` returns the concrete
      adapters the server should use.

**Smoke check:** unit test each default adapter against a temp fixture
(filesystem for local-disk, in-memory bus for native-ws).

---

## Phase 4 — Backend skeleton (`packages/server`)

**Outcome:** Hono server boots, serves `/health`, wires adapters, exposes a
typed HTTP surface.

Tasks:
- [ ] Install `hono`, `@hono/node-server`, `zod`, runtime env loader.
- [ ] Entry point: load env, call `buildAdapters(env)`, mount routes.
- [ ] Middleware: request id, structured logging, error handler, auth guard
      using `AuthProvider`.
- [ ] Routes (minimal CRUD, no business logic yet):
      - `GET /health`
      - `GET /me` (returns authed user)
      - `GET /workspaces`, `POST /workspaces`
      - `GET /workspaces/:id/brands`, `POST .../brands`
      - `GET /brands/:id`, `PATCH /brands/:id/guidelines`
      - `GET /brands/:id/projects`, `POST .../projects`
      - `GET /projects/:id`
- [ ] Settings routes (workspace-level): `GET /workspaces/:id/settings`,
      `PATCH /workspaces/:id/settings` — includes active LLM provider +
      model. Keys can start env-only; DB-persisted keys are a later pass.
- [ ] Zod validation at every boundary using `packages/shared` schemas.
- [ ] WebSocket upgrade endpoint `/rt` wired to `RealtimeBus`.
- [ ] Dev script: `pnpm --filter @brandfactory/server dev` (tsx watch).

**Smoke check:** `curl /health` returns ok. `curl -H 'Authorization: ...' /me`
returns the dev user. Creating a workspace → brand → project round-trips
through Postgres.

---

## Phase 5 — Agent package

**Outcome:** `packages/agent` (server-only) can take a brand + canvas state
+ user message and stream a response using a model obtained from
`adapters/llm`. Never imported by the frontend.

Tasks:
- [ ] Install `ai` (Vercel AI SDK) in `packages/agent`. Provider packages
      live in `packages/adapters/llm` (see Phase 3), not here — `agent`
      stays provider-agnostic and asks the adapter for a model.
- [ ] `buildSystemPrompt(brand)` composing brand guidelines into the prompt.
- [ ] `buildCanvasContext(canvas)` serializing pinned vs unpinned blocks +
      recent deltas into a compact structure the model can reason over.
- [ ] Tool definitions (initially): `addCanvasBlock`, `pinBlock`,
      `unpinBlock`. Tool handlers take a `CanvasOpApplier` injected by the
      caller — the agent package itself never writes to the DB.
- [ ] `streamResponse({ brand, canvas, messages, llmProvider, applier })`
      returns an async iterable of typed agent events. `llmProvider` is the
      adapter; agent does not know which vendor is behind it.

**Smoke check:** a scratch script wires a fake applier, a fake brand, a fake
canvas, and an `LLMProvider` pointed at OpenRouter (or any other configured
provider). Tokens and tool calls arrive on the iterable.

---

## Phase 6 — Agent endpoint in `packages/server`

**Outcome:** end-to-end streaming agent call hits the canvas and broadcasts
ops.

Tasks:
- [ ] `POST /projects/:id/agent` — loads brand + canvas, resolves the active
      `LLMProvider` from workspace settings, constructs a `CanvasOpApplier`
      that writes via `packages/db` and publishes on `RealtimeBus`, calls
      `streamResponse`, proxies events to the HTTP response as SSE
      (compatible with Vercel AI SDK UI).
- [ ] Persist assistant messages on completion.
- [ ] Rate-limit / concurrency guard per project (simple in-memory is fine).

**Smoke check:** `curl` the endpoint with a message, see streamed tokens +
tool events. A second `curl` on `/projects/:id` reflects any canvas mutations
the agent performed.

---

## Phase 7 — Frontend skeleton (`packages/web`)

**Outcome:** Vite + React app boots, authenticates, and renders a real
project split-screen + a settings page for LLM provider selection.

Tasks:
- [ ] `pnpm create vite` with React + TS. Strip defaults.
- [ ] Install Tailwind, configure. Add shadcn/ui init.
- [ ] Router: TanStack Router or React Router. Routes: `/`,
      `/workspaces/:id`, `/workspaces/:id/settings`, `/brands/:id`,
      `/projects/:id`.
- [ ] API client: thin `fetch` wrapper with typed endpoints (hand-rolled or
      `hono/client` against the server's types — the latter gives us
      end-to-end type safety for free).
- [ ] Auth shell: login page for Supabase Auth (or local dev token).
- [ ] Workspace / brand / project list screens — CRUD against the server.
- [ ] **Settings page (workspace scope):** pick active LLM provider
      (OpenRouter, Anthropic, OpenAI, Ollama, ...), pick a model from that
      provider, persist via `PATCH /workspaces/:id/settings`. API key input
      fields where applicable (store env-only for v1; DB-persisted with
      encryption is a later pass).
- [ ] Project screen split-screen layout:
      - Left: `useChat` from Vercel AI SDK UI pointed at
        `/projects/:id/agent`.
      - Right: TipTap editor + a simple drop zone for files/images (upload
        via the server's signed-URL flow).
- [ ] Realtime subscription: open `/rt` WebSocket, apply incoming canvas-ops.
- [ ] Pinning UI (star on each block), shortlist-only view toggle.

**Smoke check:** log in, create a workspace, set its LLM provider to
OpenRouter in settings, create a brand → project, send a message, see the
agent stream into the chat pane, drop an image onto the canvas, pin a
block, toggle shortlist view. Refresh — state persists. Switch the provider
to Anthropic native in settings and confirm the next message routes there.

---

## Phase 8 — Dev & deploy tooling

**Outcome:** one command gets a contributor from clone to running app.

Tasks:
- [ ] `docker/compose.yaml` with `postgres` + `server` + `web` services
      (web served via Caddy or a tiny node static server).
- [ ] `Dockerfile` for `server` (multi-stage, slim runtime).
- [ ] `Dockerfile` for `web` (static build + web server).
- [ ] `.env.example` at root enumerating every env var with a comment.
- [ ] `scripts/bootstrap.sh`: install, migrate, seed, boot.
- [ ] Seed script creating a demo user + workspace + brand so first-run is
      not empty.
- [ ] GitHub Actions: lint, typecheck, test on PR. Build images on main.
- [ ] `README.md` at root covering: prerequisites, quickstart, env vars,
      adapter toggles, how to swap LLM provider.

**Smoke check:** on a fresh machine, `git clone && cp .env.example .env &&
docker compose up` yields a working local BrandFactory at `localhost:5173`.

---

## Phase 9 — Hardening pass (before we call scaffolding "done")

**Outcome:** the skeleton is safe to build features on.

Tasks:
- [ ] Error taxonomy: `AppError` with codes, mapped to HTTP + UI toasts.
- [ ] Request logging with correlation ids across server + agent calls.
- [ ] Basic integration test suite (Vitest) covering one happy path per
      aggregate (create brand, add canvas block, run agent with a stub
      provider).
- [ ] One end-to-end test (Playwright) covering the project split-screen
      flow against a running stack with a stub LLM provider.
- [ ] Document adapter contracts in `docs/adapters.md` so extension authors
      know what to implement.

**Smoke check:** `pnpm test` and `pnpm test:e2e` both pass in CI.

---

## What we are *not* doing in scaffolding

- Standardized project templates (e.g. content calendar). First template
  lands after scaffolding, as the inaugural extension-surface consumer.
- Public shareable brand pages.
- Collaborative cursors / CRDT editing.
- Integrations (Buffer, Figma, etc.).
- Billing, teams, org-level permissions beyond "user belongs to workspace".

These are tracked separately once the skeleton is in place.
