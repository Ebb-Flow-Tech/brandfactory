# Phase 2 Completion — Database Package (`@brandfactory/db`)

**Status:** complete
**Scope:** [scaffolding-plan.md § Phase 2](../executing/scaffolding-plan.md#phase-2--database-package) as expanded by [phase-2-database-package.md](../executing/phase-2-database-package.md).
**Smoke check:** Docker postgres → `db:generate` → `db:migrate` → `smoke` exits 0, and `pnpm lint && pnpm typecheck && pnpm format:check` green across 9 workspaces.

This is the phase-level wrap. Per-task records capture the detail and
the decisions made during execution:

- [phase2-task1.md](./phase2-task1.md) — package setup (`package.json`,
  `tsconfig`, `drizzle.config.ts`, `.env.example`).
- [phase2-task2.md](./phase2-task2.md) — connection module
  (singleton `Pool` + drizzle `db`).
- [phase2-task3.md](./phase2-task3.md) — schema files (+ the Phase 1
  shared amendments that gated them).
- [phase2-task4.md](./phase2-task4.md) — query helpers + row-to-shared
  mappers + shared workspace dep + `drizzle(pool, { schema })`.
- [phase2-task5.md](./phase2-task5.md) — docker compose postgres +
  repo-root `.env.example` + `docker/README.md`.
- [phase2-task6.md](./phase2-task6.md) — package barrel
  (`db`, `pool`, schema, queries).
- [phase2-task7.md](./phase2-task7.md) — end-to-end smoke script +
  generated migration artifacts + `.prettierignore` for drizzle output.

---

## What Phase 2 shipped

A working `@brandfactory/db` that:

- Exposes a singleton pg `Pool` + drizzle `db` bound to a typed schema map,
  configured from `DATABASE_URL`.
- Defines 8 tables via Drizzle `pgTable` — `users`, `workspaces`,
  `brands`, `guideline_sections`, `projects`, `canvases`, `canvas_blocks`,
  `canvas_events` — plus 6 `pgEnum`s, FK constraints with appropriate
  `ON DELETE` semantics, and partial indexes for the active-layout and
  shortlist hot paths.
- Ships 18 query helpers grouped by aggregate. Inputs typed against
  `@brandfactory/shared`; returns mapped back to shared types at the
  boundary. `User` and `CanvasEventRow` expose the inferred row type
  (shared doesn't model those entities yet).
- Persists the canvas event log as append-only with op-specific payloads,
  `block_id` FK omitted so the log survives hard-deletes.
- Comes with a docker compose service for local Postgres, a repo-root
  `.env.example`, and a smoke script that round-trips a real user ↔
  brand ↔ canvas ↔ event flow end-to-end.

### Locked design decisions delivered

All nine from the plan landed as specified:

1. Pins as a boolean on `canvas_blocks`, not a table. ✔
2. `canvas_block_kind` collapsed to `text | image | file`. ✔
3. `canvas_blocks.created_by` provenance on every block. ✔
4. Soft-delete via `canvas_blocks.deleted_at`. ✔
5. `guideline_sections` normalized (own table, FK to brand). ✔
6. One canvas per project (unique constraint on `project_id`). ✔
7. `agent_messages` deferred to Phase 6. ✔
8. IDs as `uuid defaultRandom()`, shared kept branded-string at the
   type layer. ✔
9. Timestamps as `timestamptz`, pgEnums for stable value sets. ✔

### Open questions — how they landed

- **Enum migration pain:** kept `pg_enum`. Deferred volatility question
  until a real enum proves unstable.
- **FK on `canvas_events.block_id`:** no FK. Log survives future
  hard-delete paths.
- **Position rebalancing:** not implemented. `position`/`priority`
  accept sparse ints today; rebalance algorithm lives in
  `queries/canvas.ts` only when the first collision shows up.
- **Canvas per project:** strict 1:1, enforced by unique constraint.
- **Payload shape for `canvas_events`:** plain `jsonb`, app-layer
  validation against `CanvasOpSchema`/`PinOpSchema`.

---

## Cross-cutting changes outside `packages/db`

- **`packages/shared`** — prerequisite amendments: `Snippet*` and
  `Pin*` (incl. `PinId`) removed; `CanvasBlockCreatedBySchema` added;
  `CanvasBlockBaseShape` gained `isPinned` / `pinnedAt` / `createdBy` /
  `deletedAt`. Detail in [phase2-task3.md](./phase2-task3.md).
- **`docker/compose.yaml`, `docker/README.md`, `.env.example`** at repo
  root — local-dev postgres plus the connection-string contract.
- **`.prettierignore`** — excludes `packages/*/drizzle/` so generated
  migration artifacts don't fail `format:check`.

---

## What Phase 2 explicitly did NOT include

Per the plan's exclusion list, all deferred and unchanged:

- No auth logic / JWT verification (Phase 3).
- No realtime pub/sub (Phase 3).
- No HTTP routes or validation middleware (Phase 4).
- No `agent_messages` table (Phase 6).
- No first-run seed data (Phase 8).
- No multi-service docker compose (Phase 8).
- No RLS, tenant isolation, or audit columns beyond `created_by`/`actor` (Phase 9).
- No integration test harness (Phase 9).

Also intentionally not landed:

- No build pipeline — `@brandfactory/db` exports `src/index.ts`
  directly, matching every other `workspace:*` package.
- No `createCanvas` query helper — the plan's Task 4 list didn't
  include it; server code or the smoke script can insert via
  `db.insert(canvases)` directly.
- No parse-at-boundary runtime validation on DB reads — casts suffice
  for trusted rows; Phase 9 hardening owns that call.

---

## Verification

```
pnpm install                                   ✔
pnpm -F @brandfactory/db db:generate           ✔   8 tables → 0000_eager_deathstrike.sql
pnpm -F @brandfactory/db db:migrate            ✔   applied cleanly
psql \dt                                       ✔   8 tables present
pnpm -F @brandfactory/db smoke                 ✔   smoke: OK (all assertions pass)
pnpm lint                                      ✔   0 problems
pnpm typecheck                                 ✔   9/9 workspaces pass
pnpm format:check                              ✔   all files clean
```

Phase 2 is complete.
