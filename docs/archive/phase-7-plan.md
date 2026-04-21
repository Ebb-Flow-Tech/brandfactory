# Phase 7 — Frontend skeleton (`packages/web`)

Goal: the Vite + React app boots, authenticates, and renders the three
surfaces the vision hinges on — a **workspace settings page** where the
active LLM provider is chosen, a **brand editor** where guidelines are
captured, and a **project split-screen** where the agent streams into a chat
pane while the canvas mutates live. Dropping an image, pinning a block,
toggling shortlist view, and refreshing the page all preserve state.

Starting point: 0.7.0 (post-Phase-6). The server streams
`POST /projects/:id/agent` end-to-end, but the HTTP surface it exposes is
**not yet complete for a human user** — there's no way to read canvas
blocks, list prior agent messages, create a user-authored block, or mint a
signed upload URL for a dropped file. Closing those gaps is Step 0 of this
phase, not a separate phase, because the frontend is inert without them.

Scaffolding reference: [./scaffolding-plan.md](./scaffolding-plan.md)
§ Phase 7. Post-Phase-6 deferred items from
[../changelog.md](../changelog.md) (advisory-lock concurrency, token
redaction, per-user rate limit, live-DB `agent_messages` tests,
`projects.template_id` CHECK) are **not** in scope — they ride separately.

---

## What's already in place (don't rebuild)

- **`@brandfactory/shared`** — full domain + zod surface: `Brand`,
  `BrandWithSections`, `Project`, `Canvas`, `CanvasBlock` discriminated
  union, `ShortlistView`, `AgentEvent` (message / tool-call / canvas-op /
  pin-op), `PostAgentBodySchema`, `WorkspaceSettings` +
  `ResolvedWorkspaceSettings`, `RealtimeClientMessage` +
  `RealtimeServerMessage`, `LLM_PROVIDER_IDS`. Frontend imports these
  directly; no DTOs to hand-maintain.
- **`@brandfactory/server`** — Hono app with typed routes, exports
  `AppType = ReturnType<typeof createApp>` (see
  `packages/server/src/app.ts:93`). `hono/client` + that type gives us
  end-to-end type safety on the frontend for the routes that exist today:
  `/me`, `/workspaces`, `/workspaces/:id`, `/workspaces/:id/brands`,
  `/workspaces/:id/settings`, `/brands/:id`, `/brands/:id/guidelines`,
  `/brands/:id/projects`, `/projects/:id`, `/projects/:id/agent`, WS at
  `/rt`, `/blobs/:key` (signed URL transport).
- **Realtime WS wire envelope** — `RealtimeClientMessageSchema` /
  `RealtimeServerMessageSchema` in `packages/shared/src/realtime/envelope.ts`.
  The server's `NativeWsRealtimeBus` speaks exactly this; the client
  subscribes to `project:<uuid>` and receives `{ type: 'event', channel,
  payload: AgentEvent }` frames.
- **Auth flow** — `/me` requires a bearer token; `?token=<jwt>` query-string
  fallback works on `/rt` (see `packages/server/src/ws.ts:30`). Two auth
  providers ship: `local` (dev-only) and `supabase`.
- **Blob signed-URL primitives** — `BlobStore.getSignedReadUrl` and
  `.getSignedWriteUrl` exist on the port and both `local-disk` and
  `supabase` adapters (see `packages/adapters/storage/src/port.ts:28`).
  Local-disk's `/blobs/:key` GET/PUT route verifies the signature. **What
  doesn't exist:** an authed HTTP endpoint the frontend can call to *mint*
  a signed write URL. Step 0 adds it.

## Non-goals (explicitly deferred)

- **Standardized project templates** (content calendar etc.). The
  split-screen is freeform-only for v1. `projects.kind === 'standardized'`
  renders the same freeform surface with a "template UI coming soon" hint.
  First template lands after scaffolding.
- **Collaborative cursors / CRDT editing.** Realtime broadcast of discrete
  canvas-ops is sufficient — last-write-wins per block.
- **Mobile / responsive polish.** Desktop viewport only; layout must not
  break on 1280×800 but there's no tablet/phone sweep.
- **Offline / optimistic UI.** Every mutation round-trips. The latency is
  fine for single-user self-hosted; optimistic apply is a later concern.
- **Rich-text embeds beyond TipTap's default set** — no `@`-mentions, no
  slash-command menu, no custom nodes. Paragraphs, headings, lists.
- **Public-share brand pages.** Separate app per architecture doc.
- **i18n.** English only.
- **SSR.** Plain SPA — `pnpm build` produces static assets served by any
  web server.

---

## Step 0 — Close the server gaps the frontend needs

**Outcome:** the existing HTTP surface grows four read endpoints, four
user-canvas-op endpoints, and one blob-upload-URL endpoint. All added
before any React code is written so the frontend has a stable contract to
consume. This is the **single largest backend touch in Phase 7** and it's
front-loaded on purpose.

Each endpoint below is auth-gated (reuses `createAuthMiddleware` +
`requireProjectAccess` / `requireBrandAccess`), validates params/body via
zod schemas in `@brandfactory/shared`, and — where applicable — fans the
mutation out on the realtime bus on `project:<id>` using the same event
shapes the agent applier already emits. That's the invariant: **every
canvas mutation, agent or human, emits an event on the same channel with
the same envelope.**

### Step 0.1 — Read endpoints

- **`GET /projects/:id/canvas/blocks`** — returns the active blocks for
  the project's canvas (the agent route already calls
  `deps.db.listActiveBlocks(canvas.id)` internally; this just exposes it
  on the wire). Response: `CanvasBlock[]` (ordered by `position` ASC).
- **`GET /projects/:id/shortlist`** — returns `ShortlistView`. Wraps
  `deps.db.getShortlistView(projectId)`.
- **`GET /projects/:id/messages`** — returns `AgentMessage[]` (oldest
  first, default limit 40). Wraps `deps.db.listAgentMessages`. Optional
  `?limit=<n>` (capped at 200).
- **`GET /projects/:id` widened** — extend the existing response to
  include `blocks`, `shortlistBlockIds`, `recentMessages`, and
  `brand: BrandWithSections`. Single round-trip on project load is worth
  an extra 40-row SELECT. Shape:
  ```ts
  ProjectDetail = Project & {
    canvas: Canvas
    blocks: CanvasBlock[]
    shortlistBlockIds: CanvasBlockId[]
    recentMessages: AgentMessage[]
    brand: BrandWithSections
  }
  ```
  New schema `ProjectDetailSchema` in `packages/shared/src/project/detail.ts`.
  Back-compat isn't a concern — we have one consumer (the frontend).

### Step 0.2 — User canvas-op endpoints

Same shape as the agent's applier, but `createdBy: 'user'`, `actor: 'user'`
on the canvas event log, and `userId` is the caller:

- **`POST /projects/:id/canvas/blocks`** — body matches
  `CreateCanvasBlockInputSchema` (new in shared). v1 supports the three
  kinds already modeled in shared (`text` / `image` / `file`). Server
  inserts, appends a `canvas_events` row, publishes a `canvas-op` event
  with `op: 'add-block'`. Returns the created `CanvasBlock`.
- **`PATCH /projects/:id/canvas/blocks/:blockId`** — body is
  `UpdateCanvasBlockInputSchema` (the patch shape — partial `body` for
  text, partial `alt`/`width`/`height` for image, etc., discriminated on
  the target block's current `kind`). Authz re-checks the block belongs
  to the project. Publishes a `canvas-op` with `op: 'update-block'`.
- **`POST /projects/:id/canvas/blocks/:blockId/pin`** — `isPinned: true` +
  `pinnedAt: now()`. Publishes `pin-op` with `op: 'pin'`.
- **`POST /projects/:id/canvas/blocks/:blockId/unpin`** — mirror.
- **`DELETE /projects/:id/canvas/blocks/:blockId`** — soft delete
  (`deleted_at = now()`). Publishes `canvas-op` with `op: 'remove-block'`.
  Matches the vision's "discarded ideas aren't gone, just hidden"
  requirement — a follow-up "restore" affordance is deferred.

These get a shared helper in `packages/server/src/routes/canvas.ts` that
wraps *DB write → event append → realtime publish* in one function, so the
four mutating routes are one-liners. This is the same invariant the agent
applier already respects (`packages/server/src/agent/applier.ts:16`); the
human path and the agent path must produce **bit-identical** realtime
events so sibling clients can't tell them apart.

### Step 0.3 — Blob signed-URL mint endpoint

- **`POST /blobs/upload-url`** — authed. Body: `{ filename: string, contentType:
  string, size: number }`. Server validates `contentType` against a small
  allowlist (`image/*`, `application/pdf`, a handful of common doc mimes
  — full list in `packages/shared/src/blob/allowed-mimes.ts`), checks
  `size <= BLOB_MAX_BYTES`, generates a key
  (`uploads/<yyyy>/<mm>/<uuid>-<safe-filename>`), and calls
  `deps.storage.getSignedWriteUrl(key, { contentType, ttlSeconds: 300 })`.
  Returns `{ key, url, headers }`.
- **`GET /blobs/:key/read-url`** — authed. Returns `{ url }` for a
  short-TTL read URL. Frontend hits this to render image blocks when the
  storage adapter is local-disk (signed URL in query). For supabase
  storage we could embed the URL in the block response, but keeping a
  uniform flow is simpler and the extra round-trip is cheap.
- **Authz** — the mint endpoints require auth and, for reads, can
  optionally check block ownership (`projectId` via the DB). v1 trusts
  any authed user in the deployment (single-seat self-hosted is the
  default); cross-workspace leakage is a follow-up.

### Files touched in Step 0

- `packages/shared/src/project/canvas-op.ts` (new) — `CreateCanvasBlockInputSchema`,
  `UpdateCanvasBlockInputSchema`.
- `packages/shared/src/project/detail.ts` (new) — `ProjectDetailSchema`.
- `packages/shared/src/blob/upload.ts` (new) — `BlobUploadRequestSchema`,
  `BlobUploadResponseSchema`, `BlobReadUrlResponseSchema`,
  `ALLOWED_UPLOAD_MIMES` const tuple.
- `packages/shared/src/index.ts` — re-export.
- `packages/server/src/routes/canvas.ts` (new) — five user canvas-op routes
  + the shared `applyUserCanvasOp` helper.
- `packages/server/src/routes/messages.ts` (new) — `GET /projects/:id/messages`.
- `packages/server/src/routes/projects.ts` — widen `GET /:id` per 0.1;
  mount the two new sub-routes under `/projects`.
- `packages/server/src/routes/blobs.ts` — split into two files: the
  public-signed surface stays, a new `blobs-auth.ts` hosts
  `/upload-url` + `/:key/read-url` mounted under a **different** prefix
  (e.g. `/blob-urls`) that goes through the auth middleware. The existing
  `/blobs/:key` prefix stays auth-free because the signature *is* the
  capability. Alternative path discussed in Q2 below.
- `packages/server/src/db.ts` + `test-helpers.ts` — expose
  `updateBlock`, `softDeleteBlock` on the facade if not already present.

### Tests for Step 0

Each new route gets 3–4 vitest cases against the in-memory `Db` and fake
`RealtimeBus`: happy path, 401, 404/403, and — for mutating routes — an
assertion that the realtime bus saw the expected envelope. Patterned on
`packages/server/src/routes/agent.test.ts`. Estimated count: ~30 new test
cases. `pnpm test` target: **~170** after Step 0.

**Q1 — Why not put all canvas ops behind `/projects/:id/canvas`?** Because
per-block mutations route on `blockId`, and `/canvas/blocks/:blockId`
reads as "a block of a canvas", which it is. `/projects/:id/canvas` as a
singular endpoint exists already implicitly via `GET /projects/:id`. Flat
`/projects/:id/canvas/blocks[/:blockId]` keeps the REST shape clean.

**Q2 — Signed-URL mint under `/blobs` or `/blob-urls`?** Under a separate
prefix so the `/blobs/*` auth-exempt rule doesn't need a negative-lookahead
exception. Callers who land on `/blobs/upload-url` without a signature get
a clean 404 from the public router — still a correct outcome.

---

## Step 1 — Vite + React scaffold

**Outcome:** `pnpm --filter @brandfactory/web dev` boots a Vite dev server
on `:5173` rendering a "hello" page. `pnpm --filter @brandfactory/web build`
produces `packages/web/dist`.

- Replace the `src/index.ts` scaffold with `index.html`, `src/main.tsx`,
  `src/App.tsx`. `type: "module"`, `react` + `react-dom` as deps,
  `@vitejs/plugin-react` + `vite` + `typescript` as devDeps, `vitest`
  already present at the root.
- `vite.config.ts` at `packages/web/` with: React plugin, `@/` path alias
  → `src/`, dev proxy of `/api → http://localhost:3001` and
  `/rt → ws://localhost:3001/rt` so the dev frontend hits the real backend
  without CORS gymnastics. Production builds assume reverse-proxy
  (documented in Phase 8's `docker-compose.yaml` task).
- `tsconfig.json` already configured — widen `include` for `src/**/*.tsx`,
  `jsx: 'react-jsx'`, `moduleResolution: 'bundler'`.
- ESLint: extend the root flat config, add `react` + `react-hooks` +
  `jsx-a11y` plugin rules. `.eslintrc`-free; lives in the root
  `eslint.config.ts`.
- Scripts: `dev: vite`, `build: tsc --noEmit && vite build`,
  `preview: vite preview`, `typecheck: tsc --noEmit`, `test: vitest run`,
  `test:watch: vitest`.

**Smoke check:** `pnpm --filter @brandfactory/web dev` → open
`http://localhost:5173` → "BrandFactory" title renders. `pnpm typecheck
&& pnpm lint` green.

---

## Step 2 — Tailwind + shadcn/ui

**Outcome:** Tailwind v4 configured, shadcn CLI initialized, `Button`,
`Input`, `Label`, `Card`, `Select`, `Dialog`, `Toast` primitives
available.

- `tailwindcss` + `postcss` + `autoprefixer` as devDeps (or Tailwind v4's
  `@tailwindcss/vite` if stable at scaffolding time — pick one, document
  in the commit).
- `src/index.css` imports Tailwind base + the shadcn CSS variables layer.
  Token palette: neutral slate-ish background, single accent (pick now,
  document; subject to design polish later).
- `components.json` at `packages/web/`. `src/components/ui/` holds shadcn
  primitives; `src/components/` holds app-level components.
- Fonts: system-ui for now. Custom font rollout is deferred.
- Dark mode: class-based via `.dark` on `<html>`. Toggle wired up in
  Step 7's shell.

---

## Step 3 — Router

**Outcome:** TanStack Router with file-based routes. Top-level tree:

```
/                          → redirects to last-visited workspace or /login
/login                     → auth shell
/workspaces                → list / create
/workspaces/:wsId          → workspace home (brands list)
/workspaces/:wsId/settings → LLM provider / model selection
/brands/:brandId           → brand editor (guideline sections)
/projects/:projectId       → split-screen workspace
```

- `@tanstack/react-router` + vite plugin. File-based routes in
  `src/routes/`. Root layout in `src/routes/__root.tsx`: top nav
  (workspace picker, dark-mode toggle, user menu), outlet below,
  toast mount point.
- Route guards: `beforeLoad` on every authed route checks the auth store
  and redirects to `/login` if missing. Prevents flash-of-unauthed-UI.
- `src/router.tsx` — typed router export for the `RouterProvider` in
  `main.tsx`.

**Q3 — Why TanStack Router vs React Router?** End-to-end type-safe search
params and `beforeLoad` data prefetch are a natural fit with `hono/client`.
The plan's only alternative is React Router; either works. Pick TanStack
unless the implementer has a strong reason.

---

## Step 4 — Auth shell

**Outcome:** `/login` renders either a Supabase magic-link form or a
dev-token prompt depending on `VITE_AUTH_PROVIDER`. On success, token is
persisted in `sessionStorage`, an `AuthStore` exposes
`{ userId, token, logout }`, and `RouterProvider` re-renders into the
authed tree.

- Two implementations keyed off `VITE_AUTH_PROVIDER` (built-time env):
  - `supabase` — `@supabase/supabase-js` client, email magic-link
    sign-in. On redirect callback, call `/me` to confirm and stash the
    access token.
  - `local` — bare token input field. Accepts any JWT the server's
    local auth adapter will verify. Dev seed script prints one at boot
    (see Phase 8 `scripts/bootstrap.sh`).
- `AuthStore` is a tiny Zustand store (one of the few pieces of global
  state we need). Listens for 401 responses from the API client and
  auto-logouts.
- The token is read once at app boot and passed into the API client +
  realtime client. **Never** embed it in URLs except the `/rt?token=`
  fallback, which is the one place browsers force our hand.

### Files

- `src/auth/store.ts` — Zustand store.
- `src/auth/providers/supabase.tsx` — supabase-js integration.
- `src/auth/providers/local.tsx` — token input.
- `src/auth/AuthBoundary.tsx` — guards the authed subtree.
- `src/routes/login.tsx` — shell that picks the provider component based
  on `import.meta.env.VITE_AUTH_PROVIDER`.

---

## Step 5 — Typed API client via `hono/client`

**Outcome:** a single `api` object on the frontend whose methods are typed
against `AppType` from `@brandfactory/server`. Changing a route signature
in the server breaks the frontend typecheck immediately.

```ts
// src/api/client.ts
import { hc } from 'hono/client'
import type { AppType } from '@brandfactory/server'

export function createApiClient(opts: { baseUrl: string; getToken: () => string | null }) {
  return hc<AppType>(opts.baseUrl, {
    headers: () => {
      const t = opts.getToken()
      return t ? { authorization: `Bearer ${t}` } : {}
    },
  })
}
```

- Consumers use `api.workspaces.$get()`, `api.brands[':id'].$get({ param: { id } })`.
- Error handling: a thin wrapper (`callJson<T>(promise)`) that narrows
  responses to `2xx → parsed JSON` and `!2xx → throw AppError` with the
  same `{ code, message }` shape the server's `onError` returns. Feeds
  the toast mount point for non-route-boundary failures (404s inside a
  route boundary are handled explicitly; network blips and 5xx get
  toasts).
- **Does `hono/client` work in a monorepo with `packages/server` as a
  workspace dep?** Yes — we already depend on `@brandfactory/shared` from
  web; adding `@brandfactory/server` as a type-only dep (`peerDependencies`
  with `peerDependenciesMeta.optional` or plain `devDependencies`)
  exposes the `AppType` without pulling the server runtime. Plan: import
  `type { AppType }` only; `tsc` tree-shakes the type-only import and the
  build output has no server code.

### React Query

- `@tanstack/react-query` — the async state layer. One `QueryClient` in
  `main.tsx`, query hooks in `src/api/queries/`. Route loaders prefetch
  what the route needs; components re-read via hooks and stay in sync
  when the realtime layer invalidates cache.

---

## Step 6 — Realtime client

**Outcome:** a `useRealtime(channel, handler)` hook that opens (and
shares) a single WebSocket to `/rt`, sends
`{ type: 'subscribe', channel }`, dispatches incoming
`{ type: 'event', channel, payload }` frames to registered handlers, and
tears down subscriptions on unmount. Auto-reconnects on drop with
exponential backoff.

- Single-socket multiplexing — many components subscribing to the same
  project don't open many WS connections. Ref-count per channel; when
  the last subscriber unmounts, send `unsubscribe`.
- `payload` is validated against `RealtimeEventPayloadSchema` (imported
  from shared) — guards against a compromised bus poisoning React state.
- On reconnect, re-send subscribe for every active channel. Emit a local
  `resynced` event so the consumer can trigger a React Query
  invalidation (the canvas state could have drifted during the outage).
- Token: query-string (`/rt?token=<jwt>`) — matches the server's
  existing fallback. Rotate on token refresh.

### Files

- `src/realtime/client.ts` — the singleton WS client.
- `src/realtime/useRealtime.ts` — React hook.
- `src/realtime/useProjectStream.ts` — thin wrapper that subscribes to
  `project:<id>` and applies `AgentEvent`s to the React Query cache for
  blocks / shortlist / messages.

---

## Step 7 — Workspaces + brands list screens

**Outcome:** the user can log in, land on `/workspaces`, create a
workspace, click into it, create a brand, and navigate to
`/brands/:brandId`.

- `/workspaces` — list from `GET /workspaces`, "New workspace" dialog
  posts to `POST /workspaces`.
- `/workspaces/:wsId` — brand list from `GET /workspaces/:wsId/brands`,
  "New brand" dialog posts to `POST /workspaces/:wsId/brands`.
- Empty-state copy inline (no onboarding flow yet; skeleton only).
- Workspace picker in the top nav: dropdown populated from the
  workspaces query, switches persist last-visited in `localStorage`.

---

## Step 8 — Settings page

**Outcome:** `/workspaces/:wsId/settings` reads via
`GET /workspaces/:wsId/settings`, renders a provider dropdown + model
input, saves via `PATCH /workspaces/:wsId/settings`. `ResolvedWorkspaceSettings.source`
shows a badge ("using workspace setting" vs "using env default").

- Provider dropdown options come from `LLM_PROVIDER_IDS` (imported from
  shared — widening the list anywhere propagates here for free).
- Model field is free-text for v1. A future pass can fetch a model list
  per provider (OpenRouter has an API for it; Anthropic/OpenAI model
  names are small enumerated sets).
- API-key inputs are **not rendered** in v1 — keys stay in env per
  Phase-1 decision. Surface a note: "API keys for this provider are read
  from the server's env. DB-persisted keys are a later pass." Keeping it
  honest > adding a non-functional field.
- Save → toast on success. Next agent turn in any project on this
  workspace routes through the new provider.

---

## Step 9 — Brand editor

**Outcome:** `/brands/:brandId` renders the brand name and a list of
guideline sections. Each section is a TipTap editor + a label field +
priority reorder handle. Save writes the whole list via
`PATCH /brands/:id/guidelines` (upsert-and-reorder per
`UpdateBrandGuidelinesInputSchema`).

- TipTap setup: `@tiptap/core`, `@tiptap/starter-kit`,
  `@tiptap/react`. Schema matches the server's `ProseMirrorDocSchema`
  shape — paragraphs, headings (H1–H3), bullet + ordered lists, bold /
  italic / link. No custom nodes.
- The TipTap schema used here is **the same schema** the canvas text
  blocks use (Step 11). Extract a single
  `src/editor/proseMirrorSchema.ts` so both surfaces share it —
  divergence would mean a brand-section body couldn't become a canvas
  block and vice versa (promotion is a post-scaffolding feature per the
  vision's "finalized outputs can be promoted into the brand's
  guidelines" line).
- Section reorder uses dnd-kit's sortable. On drop, priorities get
  rewritten to sparse integers (1000, 2000, 3000) locally and the whole
  list is sent to the server — the server's single-tx helper is fine
  with it.
- Add / remove section: local-only until save. On save, server returns
  the canonical list; frontend replaces state.
- "Suggested categories" surfacing — the server exposes
  `packages/shared/src/brand/suggested-categories.ts`; render a
  "quick-add" strip that inserts a labelled empty section.

---

## Step 10 — Project split-screen layout

**Outcome:** `/projects/:projectId` fetches `GET /projects/:id` (the Step-0
widened shape) in a route loader, renders a two-pane layout — chat left,
canvas right — and subscribes to `project:<id>` via `useProjectStream`.

- Layout: CSS grid `grid-cols-[minmax(360px,1fr)_2fr]` with a draggable
  divider (vaul or a minimal hand-rolled split pane — implementer's
  call, document in the commit).
- Top bar shows brand name + project name. Brand name is a link back to
  `/brands/:brandId`.
- Shortlist toggle pill above the canvas: "All blocks" / "Shortlist".
  Shortlist mode filters canvas blocks client-side to `shortlistBlockIds`.
- Route loader prefetches all four things in `ProjectDetail` in one
  round-trip (Step 0.1).

### Files

- `src/routes/projects.$projectId.tsx` — the route.
- `src/components/project/SplitScreen.tsx` — the layout shell.
- `src/components/project/TopBar.tsx`.
- `src/components/project/ShortlistToggle.tsx`.

---

## Step 11 — Chat pane (`useAgentChat`)

**Outcome:** left pane renders the transcript from `recentMessages` + any
live messages streamed since mount. Input at the bottom POSTs to
`/projects/:projectId/agent` and reads the SSE stream.

### Why a custom hook, not Vercel's `useChat` directly

Phase 6's SSE format is `event: <kind>\ndata: <JSON AgentEvent>\n\n`
terminated by `event: done\ndata: {}\n\n`. Vercel AI SDK UI's `useChat`
expects the AI SDK's **data stream protocol** (`0:"text"`, `2:{"data"}`,
etc.) — not plain SSE. Two ways to reconcile:

- **(a)** Rewrite the server route to use `streamText(...).toDataStreamResponse()`
  — throws away our typed `AgentEvent` envelope and the event kinds
  (`canvas-op`, `pin-op`) that `useChat` has no vocabulary for.
- **(b)** Write a small custom hook that reads our SSE stream and
  exposes a `useChat`-shaped API locally.

**Pick (b).** Our event taxonomy is richer than AI SDK UI's message
shape (we stream canvas mutations alongside text), and parsing SSE +
dispatching 4 event kinds is ~60 lines of code. Benefit: we own the wire
shape, frontend and backend speak the same `AgentEvent` union, and the
chat hook can dispatch `canvas-op` / `pin-op` directly to the same
React-Query cache the realtime subscription writes to — so the canvas
updates in the current-user's browser during a streaming turn without
waiting for the realtime fan-out to round-trip.

```ts
// src/agent/useAgentChat.ts
export interface UseAgentChatResult {
  messages: AgentMessage[]
  streamingAssistant: string           // in-progress text
  status: 'idle' | 'streaming' | 'error'
  error: string | null
  send: (content: string) => Promise<void>
  stop: () => void
}

export function useAgentChat(projectId: ProjectId): UseAgentChatResult
```

### Wire details

- `send` POSTs `{ message: { content } }` (matches `PostAgentBodySchema`).
- Reads body as a stream, parses SSE frame-by-frame (re-use a tiny
  hand-rolled parser; don't bring in `eventsource-parser` unless we need
  multi-byte edge cases).
- On `event: message` with `role === 'assistant'`, append to
  `streamingAssistant` and render live. On `event: done`, flush the
  completed message into `messages` and clear the buffer.
- On `event: canvas-op` / `pin-op`, dispatch into the same cache-apply
  function the realtime subscription uses. Deduplication: when the
  realtime fan-out later arrives for the same op, drop it — track a set
  of `block.id`s updated in the current turn keyed by the response's
  first-observed timestamp. Simple policy, room to improve.
- On `event: error`, set `error` + `status = 'error'`, toast, and stop
  streaming.
- `stop()` calls `AbortController.abort()` on the fetch; the server's
  SSE helper already releases the concurrency slot on `onClose` so the
  next turn can start.
- **409 `AGENT_BUSY`** (per-project concurrency guard from Phase 6) —
  dedicated toast: "Another turn is running on this project." Don't
  auto-retry.

### Chat UI

- Message list: user bubbles right-aligned, assistant left. Assistant
  content is markdown-rendered (`react-markdown` + `remark-gfm`). Keep
  the markdown extension set tight.
- Tool-call frames render inline as collapsed "🛠 add_canvas_block
  {…}" accordions — useful for debugging, collapsed by default.
- Autoscroll to bottom on new message, preserve scroll position if the
  user has scrolled up.
- Cmd-Enter submits; Enter inserts a newline. Shift-Enter also newline.

---

## Step 12 — Canvas pane (blocks + TipTap + pinning + drop zone)

**Outcome:** right pane renders every block from the React-Query cache,
mutating lives in-place on realtime events and on local writes.

### Block renderers

- **Text block** — `TextBlockView` wraps TipTap in editable mode. On
  blur or 500ms idle, PATCH `/projects/:id/canvas/blocks/:blockId` with
  the new `ProseMirrorDoc`. Uses the same schema as the brand editor
  (Step 9). Placeholder: "Type something, or drop an image here…".
- **Image block** — `<img>` rendered from
  `GET /blobs/:key/read-url` (cached, auto-refreshed before TTL). Click
  opens a lightbox. Alt text is editable inline.
- **File block** — icon + filename + "Download" link to the read URL.
  Rare path for v1 — plain presentation, no preview.

### Block chrome

- Each block has a hover toolbar: pin / unpin (star), delete (trash).
  Pin calls `POST .../blocks/:blockId/pin|unpin`; delete calls
  `DELETE .../blocks/:blockId`.
- Drag handle on the left edge for reordering — dnd-kit's vertical
  sortable. On drop, recompute positions locally (sparse integers) and
  PATCH the moved block with its new `position`. Server re-emits a
  `canvas-op` `update-block`, realtime fans out.
- A "+" button below the last block → "New text block" shortcut. First
  Enter in the new block focuses it.

### Drop zone

- A full-pane drop target listens for `dragover` / `drop`. On drop:
  1. For each file, call `POST /blob-urls/upload-url` → `{ key, url,
     headers }`.
  2. `fetch(url, { method: 'PUT', headers, body: file })` — direct upload.
  3. `POST /projects/:id/canvas/blocks` with
     `{ kind: 'image' | 'file', blobKey: key, ... }`.
  4. Server persists + publishes — our React Query cache already
     shows it from the realtime echo (de-duped by the response we got
     in step 3).
- Progress indicator: one skeleton block per upload, replaced when the
  server confirms. Upload failures clear the skeleton with a toast.
- Paste handler on the pane: images pasted from clipboard run the same
  flow; text paste creates a text block pre-filled with the content.

### Shortlist toggle

- Client-side filter on the same rendered list. "Shortlist" shows only
  blocks whose id is in `shortlistBlockIds` (from the React Query
  cache). No server round-trip.

### Files

- `src/components/canvas/CanvasPane.tsx` — layout + drop zone.
- `src/components/canvas/blocks/TextBlockView.tsx`.
- `src/components/canvas/blocks/ImageBlockView.tsx`.
- `src/components/canvas/blocks/FileBlockView.tsx`.
- `src/components/canvas/blocks/BlockChrome.tsx` — hover toolbar.
- `src/hooks/useCanvasMutations.ts` — thin wrappers over the API client,
  optimistic updates off by default.
- `src/hooks/useSignedReadUrl.ts` — key → url, TTL-aware.

---

## Step 13 — Wire everything into a single project-store update loop

**Outcome:** the three mutation paths — local `useCanvasMutations`,
`useAgentChat` in-turn canvas-ops, realtime out-of-turn canvas-ops —
all land in the same React Query cache via one `applyAgentEvent(cache,
event)` function. No divergent state.

- `src/realtime/applyAgentEvent.ts` — switch on `event.kind`:
  - `message` → push onto the messages query cache for the project.
  - `tool-call` → (no-op for state; surfaces in the chat pane only).
  - `canvas-op` → add-block / update-block / remove-block → `queryClient.setQueryData`
    on the blocks cache for the project.
  - `pin-op` → flip the block's `isPinned`, add/remove from the
    shortlist cache.
- Every incoming event is zod-validated against `AgentEventSchema`
  (once at the boundary — the SSE hook and the realtime hook each call
  this function).
- Duplicate events (same turn's op seen via SSE then again via
  realtime) are de-duped by `block.id + updatedAt`. Idempotency is a
  state-machine property of `applyAgentEvent`, not a caller concern.

---

## Step 14 — Polish the shell

- Dark-mode toggle in the top nav (already stubbed Step 2).
- Keyboard shortcuts: `Cmd-K` command palette (stretch goal — drop if
  scope pressure). `Cmd-Enter` in chat / `Cmd-S` saves a section in the
  brand editor.
- Toast component: shadcn `Sonner`-based. Used by the API client on
  unhandled errors and by the chat hook on 409 / error frames.
- Route error boundaries: TanStack Router's `errorComponent` renders a
  friendly "something went wrong" with retry, not a white screen.
- Loading boundaries: `pendingComponent` on each route with a 400ms
  delay so fast routes don't flash a spinner.

---

## Step 15 — Tests

**Outcome:** `pnpm --filter @brandfactory/web test` runs vitest with
jsdom, covering the hairy parts (SSE parsing, realtime apply, signed-URL
upload flow) and leaving screen-level tests for Phase 9's Playwright
pass.

- `src/agent/useAgentChat.test.ts` — mock `fetch` to return an SSE
  stream of canned events; assert `messages`, `streamingAssistant`,
  canvas cache updates, and error paths.
- `src/realtime/applyAgentEvent.test.ts` — table-driven over every
  `AgentEvent` kind, with before/after cache snapshots.
- `src/realtime/client.test.ts` — fake WS (`vitest-websocket-mock` or
  hand-rolled), assert subscribe/unsubscribe ref-counting and
  reconnect backoff.
- `src/api/client.test.ts` — assert the client sends the bearer token
  and throws typed errors for non-2xx responses.
- `src/editor/proseMirrorSchema.test.ts` — the schema is identical to
  the server's; round-trip a doc through both to prove it.
- Component tests for `TextBlockView`, `BlockChrome`, `DropZone` with
  React Testing Library — minimal, golden-path only.

Estimated count: **~30 frontend cases**. Combined with Step 0's ~30
backend cases and whatever hardening shakes out, Phase 7 target:
**~200 tests total** (up from 140 at 0.7.0).

---

## Step 16 — Dev & env plumbing

- `packages/web/.env.example` — enumerates `VITE_API_BASE_URL`
  (default `/api` → proxied), `VITE_RT_URL` (default `/rt` →
  proxied), `VITE_AUTH_PROVIDER` (`local` | `supabase`),
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `vite.config.ts` — the dev proxy outlined in Step 1; prod builds
  consume the env vars directly (absolute URLs for cross-origin
  deploys, relative for reverse-proxy deploys).
- Root `pnpm dev` script: concurrently run `packages/server` and
  `packages/web` dev servers (pick `concurrently` or `turbo dev`,
  document the choice). `scripts/dev.sh` wires both up.
- Root `README.md` — already a Phase-8 task; **this phase documents
  the frontend-specific bits** (how to configure auth provider,
  Supabase keys, LLM provider choices, local dev token flow).

---

## Step 17 — Smoke verification

Manual script (document in the changelog; not in CI):

```
# Terminal 1 — backend.
pnpm --filter @brandfactory/db db:migrate
pnpm --filter @brandfactory/server dev

# Terminal 2 — frontend.
pnpm --filter @brandfactory/web dev

# Browser: http://localhost:5173
```

Happy-path checklist:

- [ ] Log in (local dev token printed by bootstrap script).
- [ ] Land on `/workspaces` empty state, create "Test workspace".
- [ ] Open workspace, open settings, set LLM to OpenRouter + a Claude
      model, save. Confirm toast + badge shows "workspace".
- [ ] Back to workspace, create "Test brand". Open brand, add two
      sections (Voice, Audience), fill them, save.
- [ ] Under brand, create "Test project" (freeform). Land on
      split-screen.
- [ ] Send "Give me three tagline options." in chat. Observe streamed
      assistant reply.
- [ ] Send "Add the first one to the canvas." Observe tool-call chip,
      canvas block appears within the turn.
- [ ] Pin the block — star fills, shortlist toggle shows it.
- [ ] Drop an image onto the canvas — upload progress, image renders.
- [ ] Hard refresh — all state persists.
- [ ] Open a second browser tab on the same project — send a message
      from tab 1, watch tab 2's canvas update live via realtime.
- [ ] Switch provider to Anthropic native in settings, confirm the
      next message routes there (check server logs).

---

## Verification checklist

Before declaring Phase 7 done:

```
pnpm install        ✔  web workspace has all deps resolved
pnpm typecheck      ✔  10/10 workspaces (web now included)
pnpm lint           ✔  clean (React + JSX rules)
pnpm format:check   ✔  clean
pnpm test           ✔  ~200 tests — Step 0 backend (+30), Step 15 frontend (+30)
pnpm --filter @brandfactory/web build   ✔  produces dist/ without warnings
```

Plus the Step 17 manual smoke checklist, run against a real OpenRouter
key and dev Postgres.

---

## Suggested commit order

Each commit is independently green on `pnpm test && pnpm typecheck &&
pnpm lint`:

1. `shared: canvas-op / project-detail / blob-upload schemas` (Step 0 prep)
2. `server: list canvas blocks + shortlist + messages routes` (Step 0.1)
3. `server: widen GET /projects/:id to ProjectDetail` (Step 0.1)
4. `server: user canvas-op routes (create/update/pin/unpin/delete)` (Step 0.2)
5. `server: blob signed-URL mint endpoints` (Step 0.3)
6. `web: Vite + React scaffold` (Step 1)
7. `web: Tailwind + shadcn primitives` (Step 2)
8. `web: TanStack Router + route skeletons` (Step 3)
9. `web: auth shell (local + supabase)` (Step 4)
10. `web: hono/client API client + React Query` (Step 5)
11. `web: realtime client + useRealtime hook` (Step 6)
12. `web: workspace + brand list screens` (Step 7)
13. `web: settings page` (Step 8)
14. `web: brand editor with TipTap` (Step 9)
15. `web: project split-screen layout` (Step 10)
16. `web: useAgentChat + chat pane` (Step 11)
17. `web: canvas pane + blocks + drop zone` (Step 12)
18. `web: applyAgentEvent unified dispatcher` (Step 13)
19. `web: shell polish (toasts, error boundaries, dark mode)` (Step 14)
20. `web: tests for hooks + applier + SSE parser` (Step 15)
21. `web: dev env + .env.example + README additions` (Step 16)
22. `docs: changelog 0.8.0` (Phase 7 entry, mirroring the 0.5.0 / 0.6.0
    / 0.7.0 prose style)

Step 16 **big-bang** is tempting but would be unreviewable. The above
keeps each PR reviewable on its own — steps 6–11 are each <500 lines
added, step 12 is the largest at ~800 lines (canvas is the feature-rich
surface), steps 13–15 are incremental.

---

## Items flagged for the post-Phase-7 hardening pass

Surfaced now so they don't get forgotten; not worked on during Phase 7.
Same cadence as 0.4.1 / 0.5.1 / 0.6.1 / the post-Phase-6 list in 0.7.0.

- **Optimistic canvas mutations.** Every write round-trips today; for
  typing into a TipTap block this is fine (debounced), for pin toggles
  it's visible latency. Optimistic apply + rollback-on-error is the fix.
- **Deletion restore UI.** Server soft-deletes; frontend has no "trash"
  view. Vision-level feature, but the schema already supports it.
- **Full-tab dedup key for SSE-vs-realtime echo.** The Step-11 scheme
  ("track block.ids during the streaming turn") is correct enough for
  v1 but can drop a late-arriving realtime event whose `updatedAt` is
  newer than the in-turn apply. Switch to a monotonic op-id if it
  bites.
- **Cross-workspace blob read authz.** Step 0.3's `/blob-urls/:key/read-url`
  mints for any authed user. Scope to workspace once we have >1 seat.
- **Server-sent errors for rate limit / timeouts**. The agent guard's
  409 is covered; the SSE `error` frame is covered. A `/projects/:id/agent`
  that *hangs* (stale upstream) has no client-side timeout yet — add a
  60 s hard cap on the fetch.
- **Supabase row-level security.** Supabase Auth works today, but
  Supabase Storage + Realtime adapters don't enforce per-user RLS
  because the server mediates everything. When we do want the adapter
  to participate (browser uploads directly to Supabase Storage without
  server-minted URLs), RLS policies are the right gate.
- **Playwright e2e** covering Step 17's happy path. Scheduled for
  Phase 9.
- **Screen-reader pass.** shadcn primitives are ARIA-correct out of the
  box; custom components (drop zone, block chrome, split pane handle)
  need a sweep.
- **Bundle budget.** No target yet; measure at end of Phase 7, set a
  budget before Phase 8 ships the Docker image.
