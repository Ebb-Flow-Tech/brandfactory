# Phase 6 Completion — `POST /projects/:id/agent`

**Status:** complete (route + persistence + realtime fan-out + SSE wire format + concurrency guard; live boot smoke gated on `OPENROUTER_API_KEY` + `DATABASE_URL`, run locally).
**Scope:** [phase-6-plan.md](../executing/phase-6-plan.md).
**Verification:** `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` — all green across 9 workspaces. Test count grew from 120 (0.6.1) to 140 (+20). No new peer-dep warnings beyond the pre-existing zod v4 vs AI-SDK v3 ones.

Single phase-level writeup organized by step order from the plan. The phase touches three packages — `@brandfactory/db` adds one table + queries, `@brandfactory/shared` adds one wire schema, `@brandfactory/server` lands the route plus three new building blocks (applier, concurrency guard, SSE helper).

---

## What Phase 6 shipped

The first end-to-end streaming agent call. A `POST /projects/:id/agent` request returns an SSE stream of `AgentEvent`s; canvas mutations the model issues via tools are persisted, broadcast on the realtime bus, and visible on a subsequent `GET /projects/:id`. User and assistant messages are persisted so the next turn carries history.

### Surface added

```
packages/db
├── src/schema/agent_messages.ts          # new pgTable + enum
├── src/schema/index.ts                   # re-exports the new module
├── src/queries/agent-messages.ts         # listAgentMessages, appendAgentMessage
├── src/index.ts                          # re-exports the new queries
├── src/mappers.ts                        # rowToAgentMessage
├── src/mappers.test.ts                   # +1 happy-path case
└── drizzle/0002_oval_pet_avengers.sql    # generated migration

packages/shared
├── src/agent/api.ts                      # PostAgentBodySchema (wire schema)
└── src/index.ts                          # re-exports api

packages/server
├── package.json                          # +@brandfactory/agent dep, +smoke-agent script
├── tsconfig.json                         # rootDir dropped, scripts/ included
├── src/agent/applier.ts                  # createDbRealtimeApplier
├── src/agent/applier.test.ts             # 5 cases
├── src/agent/concurrency.ts              # AgentConcurrencyGuard (per-project)
├── src/agent/concurrency.test.ts         # 3 cases
├── src/agent/sse.ts                      # streamResponseToSse
├── src/agent/sse.test.ts                 # 4 cases
├── src/agent/test-fakes.ts               # fakeModel / fakeProvider / makeAsyncModel
├── src/routes/agent.ts                   # POST /projects/:id/agent
├── src/routes/agent.test.ts              # 7 cases
├── src/db.ts                             # facade widened: blocks, events, agent messages
├── src/test-helpers.ts                   # in-memory fakes for new helpers + agentGuard
├── src/errors.ts                         # ConflictError (HTTP 409)
├── src/middleware/error.ts               # widen status union to include 409
├── src/app.ts                            # AppDeps.agentGuard + mount agent router
├── src/main.ts                           # createAgentConcurrencyGuard at boot
└── scripts/smoke-agent.ts                # live-boot smoke (gated)
```

---

## Step 1 — `agent_messages` table + queries

`@brandfactory/db` gains a third event-shaped table (after `canvas_events` and `workspace_settings`). It stores the per-turn user/assistant transcript so context survives across HTTP requests; the next turn's `streamText` call needs the prior messages.

### Schema (`packages/db/src/schema/agent_messages.ts`)

- New `agent_message_role` `pgEnum('user' | 'assistant')`.
- `agent_messages(id uuid pk, project_id uuid fk projects.id ON DELETE cascade, role enum, content text, user_id uuid fk users.id ON DELETE set null, created_at timestamptz default now())`.
- One index: `agent_messages_project_created_idx (project_id, created_at)` — every read is "last N for project in insert order".

### Why this shape

- **Why a new table, not `canvas_events`.** Canvas events model *canvas mutations*. An assistant reply with no tool calls produces no canvas event; reusing that table would mean either mixing semantics or losing rows. They're separate concerns kept separate.
- **`content` as `text`, not `jsonb`.** v1 `AgentMessage.content` is a plain string in `@brandfactory/shared`. If we later carry reasoning/citations/mixed parts, migrate to `jsonb` then — no speculative columns today.
- **`user_id` nullable + `set null` on delete.** Assistant rows have no human author; user rows survive account deletion as historical record. Same pattern as `canvas_events.user_id`.

### Migration

Generated via `pnpm --filter @brandfactory/db db:generate` (with a dummy `DATABASE_URL`; drizzle-kit doesn't actually need a live DB for `generate`). Output: `drizzle/0002_oval_pet_avengers.sql` — `CREATE TYPE`, `CREATE TABLE`, two `ALTER TABLE` FK additions, one `CREATE INDEX`. Snapshot file `meta/0002_snapshot.json` updated; `meta/_journal.json` extended.

### Queries (`packages/db/src/queries/agent-messages.ts`)

Two helpers, both keyed on `ProjectId`:

- `appendAgentMessage({ projectId, role, content, userId? })` — single insert, returns the mapped `AgentMessage`.
- `listAgentMessages(projectId, opts?)` — defaults `limit: 40`, returns oldest-first. Implementation: subquery `SELECT … WHERE project_id = ? ORDER BY created_at DESC LIMIT N` aliased as `latest`, outer `SELECT * FROM latest ORDER BY created_at ASC`. We need the latest N rows but the AI SDK's `streamText` expects them chronologically, so we trim then reverse rather than fetch-all-then-slice.

### Mapper (`packages/db/src/mappers.ts`)

`rowToAgentMessage(row)` returns `{ kind: 'message', id, role, content }` — drops `createdAt` and `userId` because the wire `AgentMessage` type in shared carries neither. Callers that need the timestamp read the row directly. No `safeParse` — `content` is plain text and can't be malformed in the same way `ProseMirrorDoc` JSON can be.

### Tests

`mappers.test.ts` gets one happy-path case: a row with `role: 'assistant'` and a fixed timestamp produces the expected `AgentMessage` wire shape. **Live-DB integration tests deferred** for the queries themselves — same call as 0.6.1 (the package still has no Postgres harness; the smoke script + the route tests cover the path indirectly).

---

## Step 2 — `Db` facade widening

`packages/server/src/db.ts` now exposes seven additional helpers:

- Canvas blocks/events: `listActiveBlocks`, `createBlock`, `setPinned`, `getShortlistView`, `appendCanvasEvent`.
- Agent messages: `listAgentMessages`, `appendAgentMessage`.

Same one-line-per-helper pattern as the existing entries. The interface uses `typeof db.helperName` so a signature change in `@brandfactory/db` surfaces here as a TS error, not at runtime.

`packages/server/src/test-helpers.ts` grows in-memory fakes for all seven. The fake state (`FakeDbState`) gets three new fields — `canvasBlocks: Map`, `canvasEvents: FakeCanvasEventRow[]`, `agentMessages: FakeAgentMessageRow[]` — so route tests can assert on persisted rows without touching a database. Existing fakes are unchanged; tests that don't use the new helpers don't pay anything.

---

## Step 3 — `createDbRealtimeApplier`

`packages/server/src/agent/applier.ts` is the side-effect seam Phase 5's `streamResponse` injects through. Implements the agent's `CanvasOpApplier` interface (`addCanvasBlock` / `pinBlock` / `unpinBlock`).

### Each method's flow

1. **DB write** (`createBlock` for add, `setPinned(true|false)` for pin/unpin) — atomic by `@brandfactory/db`.
2. **Event log append** (`appendCanvasEvent` with `actor: 'agent'`, `userId: <human triggering the turn>`).
3. **Realtime publish** to `project:<projectId>` with the right event envelope (`{ kind: 'canvas-op', op: { op: 'add-block', block } }` or the pin/unpin variants).

### Why this ordering

- **DB write → event → publish, not the reverse.** A failed publish leaves a persisted mutation that a refetching client will observe — strictly better than a phantom realtime event for a mutation that never landed. The two failure modes diverge in the right direction for self-hosted operations.
- **No transaction across the three.** The event log is append-only and replay-safe by design (see `canvas_events` schema comments). A missing event for an existing block is no worse than today's un-logged user writes — also un-wrapped. If we ever promote the event log to the source of truth, revisit.
- **`userId` is the *human* who triggered the turn, not the agent.** Surfaced via `appendCanvasEvent.userId` so the audit trail stays readable even when `actor: 'agent'`. The applier closes over `userId` once at construction.

### Tests (5)

Against the in-memory fake `Db` and a capturing fake `RealtimeBus`:

1. `addCanvasBlock` writes a `text` block with `createdBy: 'agent'`, appends `add_block` event, publishes `canvas-op` on `project:<id>`. Returned block matches the published event.
2. `pinBlock` flips `isPinned: true`, appends `pin` event, publishes `pin-op`.
3. `unpinBlock` mirrors with `op: 'unpin'`.
4. **Ordering invariant**: if `createBlock` throws, no realtime publish happens.
5. The applier identifies the canvas via the closed-over `deps.canvasId`, not anything from the input.

---

## Step 4 — In-memory per-project concurrency guard

`packages/server/src/agent/concurrency.ts`. Tiny: a `Set<ProjectId>` plus an `acquire(projectId)` that returns `{ release } | null` and an idempotent `release()`. Built once in `main.ts`, threaded through `AppDeps.agentGuard`.

### Design notes

- **One concurrent turn per project, not per user.** Two browser tabs on the same project would otherwise race the same canvas. User-level rate-limiting is a separate concern for later.
- **Process-local.** Fine for self-hosted v1. A horizontally-scaled deploy needs a Postgres advisory lock keyed on `hashtext(project_id)` — flagged for the post-Phase-6 hardening list.
- **No queue / wait.** Explicit 409 over hidden delays. The frontend can surface "another turn is running" without guessing latency.
- **Idempotent release.** A double-release won't free a different project's slot. Important because the route's pre-stream catch path *and* the SSE `onClose` both call `release()` — the SSE path is the canonical owner once the stream starts, but the catch path stays as a safety net for failures before the stream begins.

### Tests (3)

acquire+release allows a follow-up acquire; double acquire returns `null`; double release is harmless.

---

## Step 5 — SSE wire format

`packages/server/src/agent/sse.ts`. Converts `AsyncIterable<AgentEvent>` → SSE `Response` compatible with Vercel AI SDK UI's `useChat`.

### Frame format

```
event: <kind>
data: <JSON-encoded AgentEvent>

```

Per-event frames terminated by `\n\n`. After the iterable completes, a synthetic `event: done\ndata: {}\n\n` terminator so clients can stop listening deterministically. On thrown errors, an `event: error` frame with `{ message }` precedes `done`. Periodic `: keep-alive\n\n` ping comments every 15 s (configurable via `keepAliveMs` for tests).

### Subtleties addressed

- **`onClose` instead of `finally` on the handler.** Hono returns the `Response` to `@hono/node-server`, which then keeps writing the body. A `finally` on the handler fires when the Response is constructed, *not* when the stream ends. Releasing the concurrency guard or persisting the assistant message there would race the second request and lose tokens. The fix: `streamResponseToSse` accepts an `onClose` callback fired in the `ReadableStream`'s own `finally` block, after the iteration loop closes. The route passes a callback that releases the slot and persists assistant text.
- **`signal.aborted` mid-loop.** When `c.req.raw.signal` aborts (client disconnect), the for-await loop breaks before the next enqueue. The underlying `streamText` already gets the same signal so token generation stops too. The SSE helper's job is to stop *enqueueing* and let `onClose` run normally.
- **Persistence hook (`onEvent`) fires before serialization.** That's what lets the route accumulate assistant text from `message` events as they arrive, then persist once on close. A mid-stream failure still persists whatever was accumulated — explicit policy: partial assistant content is more useful to the user than nothing.
- **No JSON re-validation on the wire.** `streamResponse` already emits typed events; re-parsing them would be paranoia.
- **`ping.unref()` when supported.** Test harnesses spin up many short-lived streams with fast keep-alives; an active interval would block process exit. `unref()` is no-op-safe in environments that don't support it.

### Tests (4)

Frame format includes `event: <kind>` + JSON `data:` + trailing `done`; `onEvent` and `onClose` callbacks are invoked the expected number of times; iterable error → `event: error` followed by `done`; abort signal mid-stream stops enqueueing.

---

## Step 6 — `POST /projects/:id/agent` route

`packages/server/src/routes/agent.ts`.

### Pipeline

1. **Auth gate** — `c.var.userId` from the existing auth middleware (UnauthorizedError if missing).
2. **Param + body validation** — `zValidator('param', ProjectParam)` and `zValidator('json', PostAgentBodySchema)`.
3. **Authz + load** — `requireProjectAccess(rawUserId, projectId, deps.db)` returns `{ project, brand, workspace }` (existing helper). 404 / 403 land via the existing error middleware.
4. **Concurrency acquire** — `agentGuard.acquire(project.id)`. If `null`, throw `ConflictError('another turn is running on this project', 'AGENT_BUSY')` → HTTP 409.
5. **Resolve LLM settings** — `resolveLLMSettings(workspace.id, env, db)` (existing helper) merges workspace override with env defaults.
6. **Load context in parallel** — `Promise.all([listActiveBlocks, getShortlistView, listSectionsByBrand, listAgentMessages])`. Canvas is fetched first (single round-trip) and a missing canvas is treated as a data-integrity bug (logged + 404 `CANVAS_NOT_FOUND`); in normal operation it can't happen because `createProjectWithCanvas` enforces the 1:1.
7. **Persist user turn before streaming** — so a reconnecting client immediately sees the new message in `listAgentMessages`. The id is server-minted; we ignore `body.message.id` in v1 (Phase 7's frontend can re-key on response).
8. **Build applier**, `streamResponse({ brand, blocks, shortlistBlockIds, messages: [...history, userMessage], llmProvider, llmSettings, applier, signal: c.req.raw.signal })`.
9. **Return SSE response** with hooks:
   - `onEvent` accumulates `message` (assistant) text into `assistantParts: string[]`. It also fans `message` and `tool-call` events onto the realtime bus on `project:<id>` so sibling clients see typing without waiting for the turn to finish. (Canvas-op and pin-op already fan out from inside the applier — duplicating them here would publish twice.)
   - `onClose` persists the joined assistant content if non-empty (mid-stream failure → partial content still persisted), then releases the slot. Wrapped so a persistence failure can't prevent slot release.
10. **Pre-stream failure path** — a `try { … return streamResponseToSse({…}) } catch { slot.release(); throw }`. The SSE helper owns the slot once streaming begins; the catch only releases for failures *before* the stream starts (resolve, canvas load, user-message persist).

### Wired in

- `packages/server/src/app.ts` — `AppDeps.agentGuard: AgentConcurrencyGuard`. Mount `createAgentRouter({...})` under `/projects` alongside `createProjectsRouter` (both match `/:id/...`, no conflict because the route paths differ).
- `packages/server/src/main.ts` — `const agentGuard = createAgentConcurrencyGuard()` constructed once at boot, threaded into `createApp`.
- `packages/server/src/test-helpers.ts` — `createTestApp` accepts optional `llm`, `realtime`, `agentGuard` overrides; defaults build a fresh guard so independent tests don't share state.

### Error taxonomy

`ConflictError(message, code)` added to `errors.ts` (HTTP 409). The error middleware's status union widened to include 409. `code` defaults to `'CONFLICT'`; the route uses `'AGENT_BUSY'`.

---

## Step 7 — Route tests (7 in `routes/agent.test.ts`)

All in-memory: fake `LanguageModel` (via `agent/test-fakes.ts`), fake `RealtimeBus`, the existing fake `Db`. No network, no Postgres.

### Test fakes module

`packages/server/src/agent/test-fakes.ts` exports `fakeModel(parts)` and `makeAsyncModel(genFn)`. Both build a `LanguageModelV1` with the minimum surface `streamText` reads (`specificationVersion`, provider/model metadata, `doStream`); `fakeModel` enqueues a fixed array of stream parts, `makeAsyncModel` adapts an async generator into a `ReadableStream` via `pull()`-async so a generator can `await` mid-yield. The async variant is what the concurrency-race test uses to hold the first turn open while the second request comes in.

The fakes are *almost* identical to `packages/agent/src/stream.test.ts`'s helpers but live in the server package. Duplicating ~50 lines beat carving out a public test-support surface from `@brandfactory/agent` for a single consumer (re-evaluate if a third place wants the fakes).

### Cases

1. **401 without auth.**
2. **404 when project doesn't exist** (the project id format is validated by `ProjectIdSchema`, which uses the branded UUID-v4 regex; the test uses a valid v4 UUID that's just not in the fake state).
3. **Happy path, plain text stream.** Asserts 200, `content-type: text/event-stream; charset=utf-8`, body contains `event: message` and the joined content, ends with `event: done`. `agent_messages` has one user row and one assistant row in order.
4. **Happy path with `add_canvas_block`.** A fixed JSON-encoded args object, `tool-call` part → `finish`. Asserts a `text` block with `createdBy: 'agent'` was created, a `canvas_events` row with `op: 'add_block'` actor `'agent'` was appended, the realtime bus saw a `canvas-op` publish on `project:<id>`, the SSE body contains both `event: tool-call` and `event: canvas-op` frames.
5. **Concurrency 409.** First request uses `makeAsyncModel` that yields one delta then awaits a manual release promise. After 10 ms (yield to the loop) the second request races → 409 `AGENT_BUSY`. Release the deferred, drain the first stream, third request succeeds. Demonstrates the slot-release path.
6. **Stream error.** `error` part → SSE body contains `event: error` and the upstream message. Only the user row was persisted; no assistant row (empty content is dropped).
7. **Env LLM fallback.** Workspace has no settings row; `getModel` is invoked with `{ providerId: 'anthropic', modelId: 'claude-sonnet-4-6' }` from `testEnv`.

---

## Step 8 — `PostAgentBody` schema in shared

`packages/shared/src/agent/api.ts`:

```ts
export const PostAgentBodySchema = z.object({
  message: z.object({
    id: z.string().min(1).optional(),
    content: z.string().min(1).max(8_000),
  }),
})
```

Re-exported from the shared barrel. Lives here so Phase 7's frontend can reuse the exact parser. The id is optional (server mints if absent — see Step 6 §7); the 8 000-char ceiling is a sanity bound, not a token budget. Token / context-window trimming is explicitly deferred (see plan non-goals).

---

## Step 9 — Smoke script

`packages/server/scripts/smoke-agent.ts`. Boots the real Hono app against dev Postgres, seeds a workspace/brand/project (with a prior turn so the history-load path is exercised), fires `POST /projects/:id/agent` via `app.request`, parses the SSE stream frame-by-frame, then `GET /projects/:id` to confirm the canvas mutation persisted. Exits 0 on success, 1 on any step failure, 2 if the run completed but the model never tool-used (signal: model issue, not server bug).

Gated on `OPENROUTER_API_KEY` + `DATABASE_URL` — both missing → exit 1 with a clear message before any work happens. Defaults `LLM_PROVIDER=openrouter`, `LLM_MODEL=anthropic/claude-3.5-sonnet` (matching `@brandfactory/agent/scripts/smoke.ts`), and the dev-mode auth/storage/realtime providers, so a fresh checkout only needs the two real-resource env vars set.

`tsconfig.json` widened to `include: ['src/**/*.ts', 'scripts/**/*.ts']` (and `rootDir` dropped — same change as `@brandfactory/agent` made in Phase 5) so the script participates in the type-aware lint pass. New script: `pnpm --filter @brandfactory/server smoke-agent`.

---

## Verification

```
pnpm install        ✔  lockfile updated (server gains @brandfactory/agent)
pnpm typecheck      ✔  9/9 workspaces pass
pnpm lint           ✔  clean
pnpm format:check   ✔  clean
pnpm test           ✔  140 tests passing (29 files) — up from 120
pnpm --filter @brandfactory/server smoke-agent
                    ☐  run locally with OPENROUTER_API_KEY + DATABASE_URL set
```

Test count breakdown (vs 0.6.1 baseline):

- `packages/db/src/mappers.test.ts`: +1 (`rowToAgentMessage`).
- `packages/server/src/agent/applier.test.ts`: +5.
- `packages/server/src/agent/concurrency.test.ts`: +3.
- `packages/server/src/agent/sse.test.ts`: +4.
- `packages/server/src/routes/agent.test.ts`: +7.
- Total: **+20** (120 → 140).

---

## Items deferred to the post-Phase-6 hardening pass

Surfaced during the build, intentionally out of scope for this phase. Same cadence as 0.4.1 / 0.5.1 / 0.6.1.

- **Advisory-lock concurrency guard** for horizontally-scaled deploys (Postgres `pg_try_advisory_lock(hashtext(project_id))`).
- **Assistant-message atomic-with-canvas-ops persistence.** Today the applier writes canvas blocks in their own transactions and the assistant message lands on stream close; a crash between them leaves inconsistent state. Candidate fix: buffer canvas ops, commit all in one tx with the assistant message — blocked on streaming-vs-atomic tradeoff discussion.
- **Token redaction in request logs.** `PostAgentBody.content` can carry secrets pasted by the user. Part of the Phase-8 pino swap.
- **Per-user rate limit** distinct from per-project concurrency. Once we have >1 seat per workspace.
- **Live-DB vitest for `agent_messages` queries.** Same pattern as the deferred integration suite from 0.6.1.
- **`projects.template_id` CHECK constraint** still pending from 0.6.1; rides with the next planned migration.

---

## Items explicitly out of scope (reaffirmed)

From the plan's non-goals:

- Image/file canvas tool variants (need a blob-upload flow first).
- Client-side consumption (`useChat`, TipTap apply) — Phase 7.
- Token budgeting / context-window trimming — `CANVAS_CONTEXT_UNPINNED_LIMIT` and the 40-message history cap are crude but sufficient for v1.
- Reasoning / source / file stream parts — `streamResponse` already ignores them and the route does nothing extra.
