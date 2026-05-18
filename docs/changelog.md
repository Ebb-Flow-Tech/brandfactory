# Changelog

Latest releases at the top. Each version has a one-line entry in the index below, with full detail further down.

## Index

- **1.1.0** — 2026-05-18 — Projects reachable + functional, Thread A (Phases A.1–A.5): `useCreateProject` mutation hook in `api/queries/brands.ts`; `NewProjectDialog` + `ProjectCard` + `ProjectsSection` co-located in `brands.$brandId.tsx`; brand-page header restructured (subtitle dropped, Projects above Guidelines, `border-t` divider); static audit of all three nav paths (brand→project, project→brand, brand→workspace); two RTL render tests on `ProjectsSection`. ~155 LOC net across the web package. 240 tests (+2). Thread B (end-to-end verification matrix) tracked separately.
- **1.0.0** — 2026-04-21 — Hosted-deploy baseline (Phases 1–6): Supabase auth `ensureUser` auto-provision (+4 tests), server `Dockerfile` + `fly.toml` + root `.dockerignore`, `pg` pooler-safety invariants pinned in `db/client.ts`, single-instance `native-ws` commitment documented in `adapters.ts` + README, `packages/web/vercel.json` SPA fallback, CORS allowlist (already shipped 0.8.0) gates split-origin Vercel ↔ Fly. 238 tests (+4).
- **0.8.0** — 2026-04-20 — Phase 8 (scope-cut, no deploy recipe): `db:seed` dev token, root `.env.example` + drift guard, GitHub Actions CI on Postgres 16, README rewrite, `CORS_ALLOWED_ORIGINS` gates HTTP + WS. 234 tests (+11).
- **0.7.4** — 2026-04-20 — Phase 7 Steps 12–16: real canvas pane (TipTap text / image / file blocks, pin, drag-reorder, drop-zone upload), unified `applyAgentEvent` module, shell polish (dark mode, router error/pending, `Cmd-S`), frontend vitest pass (+56), dev/env plumbing. 223 tests (+56).
- **0.7.3** — 2026-04-20 — Phase 7 Steps 7–11: workspaces/brands list, workspace picker, settings page, TipTap+dnd-kit brand editor, project split-screen with realtime, `useAgentChat` SSE hook + Markdown chat pane.
- **0.7.2** — 2026-04-20 — Phase 7 Steps 3–6: TanStack Router skeleton, Zustand `AuthStore` + local/Supabase providers + `AuthBoundary`, typed `hono/client` API + React Query, multiplexed `RealtimeClient` with `useProjectStream`.
- **0.7.1** — 2026-04-20 — Phase 7 Steps 0–2: frontend-facing server surface (canvas-op, messages, blob-url routes; widened `GET /projects/:id` → `ProjectDetail`), Vite+React 19 scaffold, Tailwind v4 + shadcn/ui primitives. 167 tests (+27).
- **0.7.0** — 2026-04-19 — Phase 6: `POST /projects/:id/agent` ships end-to-end streaming — SSE over `streamResponse`, DB+realtime applier, per-project concurrency guard, `agent_messages` table. 140 tests (+20).
- **0.6.1** — 2026-04-19 — Pre-Phase-6 hardening: realtime WS heartbeat, `verifySignature` clock-skew tolerance, `ProseMirrorDocSchema` parse on DB reads, `@brandfactory/db` vitest suite, `userId` in server error logs. 120 tests (+14).
- **0.6.0** — 2026-04-19 — Phase 5: `@brandfactory/agent` ships `streamResponse` over an injected `CanvasOpApplier`, plus a four-item hardening pass (realtime subscribe race, `BLOB_MAX_BYTES` 413, two LOW cleanups). 106 tests.
- **0.5.1** — 2026-04-19 — Post-Phase-4 cleanup: project+canvas tx helper, `LLMProviderId` single-sourced in shared, trust-boundary validation on `workspace_settings`, discriminated `RealtimeAdapter` (no `as` cast in `main.ts`), `BlobNotFoundError` `instanceof`, atomic `updateBrandGuidelines` helper.
- **0.5.0** — 2026-04-19 — Phase 4: `@brandfactory/server` ships a bootable Hono-on-`@hono/node-server` HTTP surface with WS upgrade at `/rt`, conditional `/blobs` mount, request-id → logger → auth → validator → handler → onError middleware chain, six route modules, `workspace_settings` table, and 49 new vitest cases (83 total).
- **0.4.1** — 2026-04-19 — Pre-Phase-4 cleanup: tighter env exhaustiveness, server-grade ESLint (type-aware with `no-floating-promises`), timing-safe `verifySignature`, RFC-4122 v4 UUID regex, `createCanvas` helper, three new env tests, architecture doc drift fixed.
- **0.4.0** — 2026-04-19 — Phase 3: four `@brandfactory/adapter-*` packages land with ports + default impls, `@brandfactory/server` gains `loadEnv()` + `buildAdapters()`, vitest stands up across the repo with 31 unit tests green.
- **0.3.0** — 2026-04-18 — Phase 2: `@brandfactory/db` lands — drizzle schema for 8 tables, singleton pg `Pool`, 18 query helpers, local-dev docker Postgres, and an end-to-end smoke check.
- **0.2.0** — 2026-04-18 — Phase 1: `@brandfactory/shared` lands as the single source of truth for domain types and zod schemas, consumed by both `server` and `web`.
- **0.1.0** — 2026-04-18 — Project bootstrap: vision, architecture blueprint, scaffolding plan, and Phase 0 repo foundation.

---

## 1.1.0 — 2026-05-18

First post-deploy feature release. Closes the gap the 1.0.0 narrative quietly carried: Projects — the centerpiece of the vision — were fully implemented on the server (Phase 6) and the frontend (Phase 7 Steps 7–16) but **unreachable from the live UI**. The brand editor page had zero project references; the `useBrandProjects` query hook sat in `api/queries/brands.ts` with no caller; the split-screen route at `/projects/$projectId` could only be opened by typing the URL. 1.1.0 wires Projects into the brand page and makes the full daily-use entry point — *open brand → start or resume a project* — work for the first time.

Scope is **Thread A only** of [docs/executing/projects-reachable-and-functional.md](../executing/projects-reachable-and-functional.md). Thread B (end-to-end verification matrix + vision-bar observations) is a separate, manual, browser-driven workstream that lands as its own follow-up; 1.1.0 ships the wiring, Thread B will ship the Findings doc.

Net diff is small and entirely confined to the web package: ~155 LOC across two existing files + one new test file. Test count 238 → **240 (+2)**, all green. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm --filter @brandfactory/web build` all clean across 9 workspaces. Five per-phase completion docs under `docs/completions/projects-reachable-and-functional-phase-a{1..5}.md` carry the detailed record.

### Phase A.1 — `useCreateProject` mutation hook

`packages/web/src/api/queries/brands.ts` gains a `useCreateProject(brandId)` hook below the existing `useBrandProjects`. Mutation body is fetch-glue through the typed hono client (`api.brands[':brandId'].projects.$post`); `onSuccess` invalidates the `brandKeys.projects(brandId)` list cache.

**Why `brands.ts`, not a new `projects.ts`.** Query-hook files are scoped by **route prefix**, not domain. `POST /brands/:brandId/projects` lives under the brand route on the server, so the mutation that calls it lives in the brand query module — same convention as `useBrandProjects`.

**Why `invalidateQueries`, not `setQueryData`.** The list cache holds `Project[]`; appending optimistically would be a one-liner, but the list is the only consumer that needs the new row to appear, and a single `GET /brands/:brandId/projects` is cheap. Invalidate is more robust to future server-side sort/filter changes. Per-call concerns (close dialog, navigate to detail) live on the `mutate` invocation in A.2, not on the hook.

**No new tests.** Per the plan's Step A.5: the hono RPC `$post` shape is type-checked at build time, and the mutation body is thin fetch-glue. Mutation-flow integration test is explicitly skipped (same call-out as `uploadBlob` in 0.7.4). Phase A.5 lands the render-side regression net instead.

### Phase A.2 — `NewProjectDialog` component

`packages/web/src/routes/brands.$brandId.tsx` gains a co-located `NewProjectDialog({ brandId })`. Mirrors `NewBrandDialog` in `workspaces.$wsId.index.tsx`: same `Dialog` / `DialogTrigger` / `DialogFooter` structure, same external-`<form>` + `form="..."` submit-button pattern, same `disabled={!name.trim() || mutation.isPending}` gating, same `'Creating…' | 'Create'` label switch, same `toast.error(err instanceof AppError ? err.message : 'Failed to create project')` shape.

**Co-location, not extraction.** A shared `components/dialogs/` folder is premature until a third dialog appears. The duplication is mechanical and visible at the point of use.

**No `kind` picker.** Submit payload is hard-coded `{ kind: 'freeform', name: trimmed }`. The shared schema supports `standardized` with a `templateId`, but no templates are registered yet. Per the question round (Q5): empty-roadmap surfaces look broken — omit until the day there's an option to pick. The hook from A.1 already accepts the full union, so this UI choice is reversible without touching the API layer.

**Single-line `eslint-disable` marker for the intermediate phase.** The dialog is defined here but not yet rendered (A.3 wires it). Three options were on the table — prefix with `_`, bundle A.2+A.3, or scoped `eslint-disable-next-line`. Picked the disable with an inline rationale pointing at A.3. A.3 removes it the moment the dialog gets a caller. Net debt across A.2 + A.3 is zero.

### Phase A.3 — Projects section on the brand editor page

The visible phase. Until this lands, A.1's hook had no caller and A.2's dialog had no parent — both sat behind underscores and disables. A.3 mounts both, restructures the page header, and the user can — for the first time in the live UI — open a brand → see existing projects (or an empty state) → click "New project" → name it → land on the split-screen workspace.

Two new components above `BrandEditorPage`:

- **`ProjectCard({ project })`** — clickable card mirroring `BrandCard`. Shows `project.name` (semibold) + `Created <date>` (muted). Navigates to `/projects/$projectId` on click. Uses the same `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]` grid as `BrandCard` for visual rhythm.
- **`ProjectsSection({ brandId })`** — wires `useBrandProjects(brandId)`, renders `<h2>Projects</h2>` + `<NewProjectDialog />` trigger on the right, plus loading / error / empty / populated states underneath. Empty-state copy: *"No projects yet. Create one to start brainstorming with the agent."* — single line, muted, inline (not centered).

Page-body restructure:

- **Subtitle dropped.** Pre-A.3 the page header read `<h1>{brand.name}</h1>` then `<p>Brand guidelines</p>`. With Projects above Guidelines, the subtitle becomes actively misleading. Q1 picked option (a): drop entirely; two section headings (`Projects`, `Guidelines`) carry the structure. Option (c) — split into sub-routes — is the right answer eventually, once Shortlist and Finalize surfaces also land, but is premature when the page has two sections.
- **Projects above Guidelines** (Q2, confirmed). Daily-use flow: open brand → resume project. Guidelines are the slower-moving artifact.
- **Guidelines wrapped in their own `<section className="border-t pt-6">`** with an `<h2>Guidelines</h2>` heading. Single horizontal rule between the two sections; `pt-6` gives breathing room from the heading.

**Independent fetches.** `useBrand(brandId)` and `useBrandProjects(brandId)` are two separate TanStack Query subscriptions. `ProjectsSection` lives **outside** the `brand &&` guard in `BrandEditorPage`, keyed by route-params `brandId` (always available). The guidelines loading/error UI lives *inside* the Guidelines section, scoped to that fetch. Consequence: project list can render while guidelines are still loading, and a guidelines load failure doesn't blank the projects.

**`<section>` not `<div>`** for both blocks — semantic HTML; a11y / outline tooling reads them as siblings. The brand header (back link + `<h1>`) intentionally stays as a `<div>` because it's the page header, not a content section.

**Project-card metadata kept lean** (Q4). Just name + `createdAt`. `updatedAt` exists on `Project` but two dates per card is noise without a recency-sort feature to motivate it. Block count / last-assistant-message preview would require `ProjectDetail`-shaped data; the list endpoint returns `Project[]` only — defer until the value justifies the over-fetch.

A.2's `eslint-disable-next-line` is removed in this phase. The dialog now has a real caller.

### Phase A.4 — Navigation no-op check

Code-side audit of all three navigation paths Thread A depends on. The plan correctly anticipated they already existed; A.4's job was to confirm the round-trip closes after A.3 added a new navigate-out site (the project card). **No code change in this phase.**

Three paths, all ✅ wired:

1. **Forward, brand → project** (new in A.3) — `ProjectCard.onClick` calls `navigate({ to: '/projects/$projectId', params: { projectId: project.id } })`. Target route exists at `routes/projects.$projectId.tsx:52`, gated by `getAuthToken()`. Type-checked end-to-end: `Project.id` is `ProjectIdSchema` (UUID v4), `useParams` returns `{ projectId: string }`, `useProjectDetail(projectId)` is the first call in `ProjectPage`.
2. **Back, project → brand** — `TopBar.tsx:7–13` renders `<Link to="/brands/$brandId" params={{ brandId: brand.id }}>{brand.name}</Link>`. `ProjectPage` already passes `data.brand` (part of `ProjectDetail`) into `TopBar`, so the breadcrumb has the brand object with no extra round-trip. After A.3 lands, returning here puts the user back on the brand page with the just-created project visible in the list (cache invalidation from A.1's `onSuccess` + TanStack Query's refetch-on-focus close the loop).
3. **Back, brand → workspace** — existing `← Workspace` link in `brands.$brandId.tsx:370–382` branches on whether `brand` is loaded: if so, link to `/workspaces/$wsId` with the loaded `workspaceId`; if not, fall back to `/workspaces` (list). Right degradation — without a loaded brand we don't know which workspace to return to.

Browser-side visual confirmation (focus management, scroll-restore, the brand-name actually painting from cache vs. a fresh fetch on back-nav) is deferred to Phase B rows 1 / 11 / 12. A.4 is the static-audit half of "the world we're navigating to works."

### Phase A.5 — RTL render test for `ProjectsSection`

`packages/web/src/routes/brands.$brandId.test.tsx` — new, 60 LOC. Two `describe('ProjectsSection')` cases: populated cache (seeds `brandKeys.projects(BRAND_ID)` with two `Project`s; asserts both names paint, empty-state copy does not) and empty cache (seeds `[]`; asserts the muted "No projects yet…" copy paints and the "New project" trigger button is reachable by role).

`ProjectsSection` gains an `export` keyword — the only non-test code change in this phase. `ProjectCard`, `NewProjectDialog`, and `BrandEditorPage` remain file-private (no test consumer yet).

**Why test `ProjectsSection` directly, not `BrandEditorPage`.** The plan asked for "one happy-path render test that mounts the page". A.5 deviated to mount the section instead because:

- What A.3 built **is** `ProjectsSection`. Every regression a page-level test would catch on the new surface is caught by a section-level test, with one-third the setup. The Guidelines half of the page is pre-existing and out of scope.
- `BrandEditorPage` calls `brandEditorRoute.useParams()`, which requires either a real TanStack memory router or a mock of the param hook. The first route-level test in the repo is not the place to introduce a memory-router harness — that's a Phase B / Phase 9 conversation flagged in the changelog (line 374 of the pre-1.1.0 file).
- Targeted tests fail more legibly. A failure in this file points at the Projects wiring directly; a page-level failure could be from anything between the route param hook and the Guidelines editor.

Filename still matches the plan (`brands.$brandId.test.tsx`) — same co-location, tighter scope of what's mounted.

**Three test-only invariants.**

- **`vi.mock('@tanstack/react-router', …)`** — two consumers in the rendered tree call `useNavigate` (`ProjectCard.onClick`, `NewProjectDialog.onSuccess`). Neither is exercised in the assertions; the mock returns a no-op `useNavigate` and spreads `actual` so other re-exports keep working. Alternative — `createMemoryHistory` + `createRouter` + `RouterProvider` — is the right tool when navigation itself is being asserted (Phase B will need it), but pure ceremony around two unread function calls here.
- **`staleTime: Infinity`** on the test `QueryClient` — by default TanStack Query marks a freshly `setQueryData`-populated entry as stale-but-cached; first render returns the cached value, then schedules a background refetch into `api.brands[':brandId'].projects.$get`. Under jsdom without a global `fetch` stub, that explodes (or silently noises up logs). `Infinity` keeps the seeded data fresh, refetch never fires, tests run deterministically. Test-only — no production code change.
- **`retry: false`** on queries — matches the `useAgentChat` test convention. Belt-and-braces with `staleTime: Infinity`: even if a stray refetch slipped through, no retry-storm in the runner.

**No `user-event`, no click assertions.** Plan said RTL only. A.5 went further — no DOM event asserted at all. The new wiring is *what renders*, not *what happens on click*. The mutation hook (A.1) and the dialog submit (A.2) are both glue around library calls (`useMutation`, `Dialog`); clicking would test the library, not the wiring.

**A small lesson recorded.** First iteration used `importOriginal<typeof import('@tanstack/react-router')>()`. Lint flagged it as a violation of `@typescript-eslint/consistent-type-imports` — `import()` expressions count as inline imports, which the project disallows in favour of top-level `import type` statements. Resolution: lift the module shape to a top-level `import type * as TanStackRouter` and reference that in the generic. Same runtime behaviour; satisfies the lint rule. Pattern now precedented for any future `vi.mock` that uses `importOriginal<typeof import(…)>()`.

Test count 56 → **58 (+2)** in the web package, 238 → **240 (+2)** repo-wide. Both new cases land alongside the pre-existing 56 with no flakes across multiple local runs.

### Verification

```
pnpm typecheck                              ✔  9/9 workspaces clean
pnpm lint                                   ✔  clean (zero new suppressions)
pnpm format:check                           ✔  clean
pnpm test                                   ✔  239 passed + 1 skipped (240 total; +2 vs 1.0.0)
pnpm --filter @brandfactory/web build       ✔  clean (1.1 MB main-chunk warning unchanged from 0.7.4 — TipTap + Radix; code-split pass remains deferred)
```

The one skipped case (`seed.test.ts`) is unchanged from 1.0.0 — runs only with `DATABASE_URL` set, exercised in CI's Postgres service.

### Files touched (net diff)

- `packages/web/src/api/queries/brands.ts` — 1 import + `useCreateProject` hook (15 LOC).
- `packages/web/src/routes/brands.$brandId.tsx` — 3 new imports + `NewProjectDialog` + `ProjectCard` + `ProjectsSection` + page-body restructure (~138 LOC added across the new components and the section wrapping; one subtitle line removed). `ProjectsSection` is exported for the test; the rest stay file-private.
- `packages/web/src/routes/brands.$brandId.test.tsx` — new (60 LOC, 2 tests).
- `docs/completions/projects-reachable-and-functional-phase-a{1,2,3,4,5}.md` — five per-phase completion docs (the audit trail).
- `docs/completions/phase6-hosted.md` → `docs/archive/phase6-hosted.md` — moved. The 1.0.0 hosted-deploy completion docs are operator playbooks bound to that release; archiving keeps the active completions folder scoped to current-thread records.

Total: ~155 LOC of code change, comfortably under the plan's ~200-line target.

### What 1.1.0 explicitly does NOT include

**Thread B — end-to-end verification.** The plan is two threads; 1.1.0 ships Thread A only. Thread B is a manual, browser-driven 15-row verification matrix + 3 vision-bar depth observations + a Findings write-up. It lands as a separate follow-up once a human drives the browser through each row. Specifically deferred to Thread B:

- Confirming the create-project → split-screen flow actually paints end-to-end (row 1).
- Confirming the agent's `add three taglines to the canvas` motion writes blocks visible to a second tab via realtime (rows 2, 3, 11).
- Pin / shortlist / drag-reorder / image-drop / non-image-drop behaviour (rows 4–10).
- Mid-stream reload + 409 `AGENT_BUSY` concurrency guard (rows 14, 15).
- Vision-bar observations: does the agent actually condition on pinned blocks? Does it acknowledge between-turn edits? Is the canvas's vertical-stack shape a vision-bar gap relative to the Pinterest-style spatial board the vision describes?

**Out of scope by plan design.** Standardized project templates UI (no template registered yet — backend supports the discriminator, frontend stays freeform-only); project rename / delete / archive (defer to a roadmap thread); agent canvas-awareness depth pass (separate plan; Thread B's vision-bar observations will inform scope); Playwright / e2e harness (Phase 9 conversation flagged in 0.7.4); shortlist view depth + soft-delete + finalize→promote-to-guidelines (vision items #3–#4, separate threads).

**Deferred items.** Memory-router test harness — lands the first time a navigation-asserting test arrives (Phase B); the brand-page header restructure into tabs / sub-routes (option c from Q1) — natural reversal of the dropped subtitle once Shortlist and Finalize surfaces also land on the brand page; mutation-flow integration test for `useCreateProject` and `useUploadBlob` (skipped per the fetch-glue carve-out, revisited if Phase B surfaces a regression); project-card recency-sort + per-card metadata (block count, last assistant message preview) — defer until a returning-user pain point surfaces; standardized-template picker scaffolding — landed at zero-cost the day there's a template to register.

---

## 1.0.0 — 2026-04-21

The 1.0 cut. Six phases of the hosted-deploy plan land together as a single milestone — Supabase as the managed Postgres + Auth + Storage backend, Fly as the API runtime (Hono on Node + native-ws), Vercel as the SPA host. This release crosses the line from "self-host-friendly v0.8 codebase" to "first production deploy is a sequenced operator playbook against artefacts that already live in the repo". Future versions will iterate on the deployed surface; this one establishes the baseline.

The split between code and operator work is intentional: every credential-bearing or dashboard-bound step (creating the Supabase project, minting the storage bucket, running migrations against the production DB, `fly secrets set`, `fly deploy`, the Vercel project setup, Supabase auth redirect URLs) lives in playbooks under `docs/completions/phase{1,2,3,4,5,6}-hosted.md`, and the repo ships only the artefacts and code paths those playbooks need. The result is a small, auditable diff (~70 lines of net code change across the six phases) that closes the deployment gap without dragging in feature scope.

Test count 234 → **238 (+4)**, all from Phase 1's `ensureUser` coverage. Phases 2–6 are documentation, config, and one defensive-comment additions — no new behaviour, no new tests required. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` all green across 9 workspaces. Plan source: [docs/executing/hosted-deployment-plan.md](../executing/hosted-deployment-plan.md).

### Phase 1 — Supabase identity reconciliation

The single code-bearing item across the phase: an auto-provision hook for the `public.users` row on first authed Supabase request. Supabase Auth owns `auth.users` (keyed by JWT `sub`, a UUID Supabase mints on signup). Our domain tables FK against `public.users(id)`. After a fresh signup the JWT verifies cleanly but `getUserById(sub)` returns `null` — every authed route that joins against the user 404s.

**Where the hook lives.** Inside the Supabase auth adapter — `packages/adapters/auth/src/supabase.ts` — folded into `verifyToken`. The two alternatives (route-level provisioning in `/me`, or a Supabase `auth.users` DB trigger) were both rejected: the route-level path leaves every other authed surface vulnerable; the DB trigger introduces cross-schema vendor coupling that's hard to diff in code review and irreversible from the repo. Adapter-level provisioning runs on every authed request through one chokepoint, with cleanly-injectable test seams.

**Idempotent upsert.** New helper `upsertUserById({ id, email, displayName? })` in `packages/db/src/queries/users.ts`:

```ts
await db
  .insert(users)
  .values({ id, email, displayName })
  .onConflictDoNothing({ target: users.id })
```

`onConflictDoNothing` keeps the call boring and free of overwriting surprises. First-seen email is canonical — operator-driven email changes go through a separate flow, not here.

**Process-level dedup cache.** A naive design would hit the DB on every authed call (10–30 ms per pooler round-trip). The adapter keeps a `Set<string>` of `sub`s it's already provisioned; subsequent verifies skip the write. Memory cost scales with unique users in flight (bounded). Cleared on process restart, which is fine — the upsert is idempotent so a post-restart re-provision is a no-op.

**Failure handling.** `ensureUser` throwing (DB outage, pooler saturation) logs `console.warn` and returns `{ userId: sub }` as if the upsert had succeeded. A DB hiccup shouldn't turn every authed request into a 401 on an otherwise-valid token. The dedup set is **not** populated on failure, so the next request retries. The downstream cost is isolated to routes that need a real `users` row (`/me`, anything joining against the user) — those 404 as they did pre-provisioning. Pinned by the test `'does not fail verifyToken when ensureUser throws'`.

**Missing email claim.** Supabase JWTs carry `email` for password / magic-link / OAuth flows. The rare absent-email case (custom JWT, anon auth) skips the upsert — `users.email` is `NOT NULL`, so a `null`-email insert would error. Skip-and-404 preserves the pre-provisioning fallback. Covered by `'skips auto-provisioning when the email claim is missing'`.

**Tests added (+4).** Auto-provision on first verify with email present, dedup on second verify of same `sub`, skip when email claim is missing, tolerate `ensureUser` throwing. `SupabaseAuthDeps` gains `ensureUser?: (input: { id: string; email: string }) => Promise<void>` and `provisionedCache?: Set<string>` test seams; the default `ensureUser` is `dbUpsertUserById` from `@brandfactory/db`.

Operator-side Phase 1 work (Supabase project creation, migrations against the direct URL, storage bucket `brandfactory-blobs` private, admin user seed) lives in `docs/completions/phase1-hosted.md`. Critical: **do not run `db:seed` against a production Supabase DB** — it inserts a fixed-UUID demo user and is local-dev-only.

### Phase 2 — Server Dockerfile + fly.toml

Three artefacts land at the repo root or under `packages/server`. Together they let `fly deploy` build a ~200 MB image and boot it with non-secret env baked in + secrets loaded via `fly secrets set`.

**`packages/server/Dockerfile` — multi-stage, no TypeScript build.** The plan's text said `pnpm -F @brandfactory/server... build`. Re-reading the tree, **no workspace package has a `build` script** (only `packages/web` has a Vite build). Following the plan verbatim would require a separate prereq pass — composite `tsc --build` configs across 7 TS packages, `"main": "./src/index.ts"` → `"./dist/index.js"` flips, vitest's in-place-source expectations untangled. That's a meaningfully-sized refactor the plan didn't scope.

**Decision: ship source, run with `tsx` in the container.** Semantically equivalent to `pnpm start` today. Trade-off: ~100–300 ms JIT-transpile cost on cold start (tsx caches across module loads, runtime warm-path unaffected). The container's `CMD` and `pnpm start` run the exact same code path. Reversible: if compile-to-JS ever becomes worthwhile (cold-start budget, smaller image), add `build` scripts, flip `CMD` to `node dist/main.js`, move `tsx` back to devDeps.

The one consequence: **`tsx` moved from `devDependencies` → `dependencies`** in `@brandfactory/server`. It's genuinely a runtime dep now and `pnpm deploy --prod` drops devDeps; without the move, `tsx` wouldn't ship. One-line `package.json` change.

**Stage 1 (builder) layout.** `corepack enable` activates pnpm at the version pinned in `packageManager` (10.28.2). Manifests copied first (lockfile, workspace config, every package's `package.json`) — standard Docker-cache hack: install layer only re-runs when manifests change. `pnpm install --frozen-lockfile` errors out on lockfile drift. Sources for `shared`, `db`, `agent`, all four `adapters/*`, `server` copied next. `pnpm --filter=@brandfactory/server deploy --prod --legacy /out` materializes a standalone tree at `/out` — workspace deps **copied** (not symlinked) into `/out/node_modules/@brandfactory/*`, prod-only third-party deps hoisted, `tsx` binary present at `/out/node_modules/.bin/tsx`.

**Why `--legacy` on `pnpm deploy`.** Confirmed locally: pnpm v10 aborts `pnpm deploy` with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE` unless either the repo sets `inject-workspace-packages=true` (broad change, affects every install) or the deploy invocation passes `--legacy`. The legacy impl is what we want — copy workspace packages, install prod deps, flat tree. The non-legacy impl introduces injected-packages semantics that aren't needed here and would require other config changes.

**Stage 2 (runtime).** `node:20-alpine` + `apk add --no-cache tini`. tini forwards SIGINT/SIGTERM to PID 1 — without it, Node ignores SIGTERM by default and `fly restart` + graceful shutdown silently fail. `main.ts` already handles both signals; tini is what makes sure they arrive. `ENTRYPOINT ["/sbin/tini", "--"]` + `CMD ["node_modules/.bin/tsx", "src/main.ts"]` — no `npm run` / `pnpm start` indirection, one `exec` call, no shell between Node and PID 1.

**`.dockerignore` at the repo root, not `packages/server/.dockerignore`.** Per-Dockerfile dockerignores are handled inconsistently across build frontends — repo-root `.dockerignore` works in classic Docker, BuildKit, and every Fly CLI version. Since the Dockerfile uses explicit `COPY packages/server/...` paths, the image stays scoped to server-only content without per-Dockerfile ignore. Excludes `node_modules`, build artefacts, `.env*` (except `.env.example`), web sources, docs/scripts, test files.

**`fly.toml` at the repo root.** `app = "brandfactory-api"` and `primary_region = "iad"` are placeholders — operator updates both before first deploy. `kill_signal = "SIGINT"` matches `main.ts`' graceful-shutdown path. `auto_stop_machines = false`, `auto_start_machines = true`, `min_machines_running = 1` keeps the realtime bus alive (native-ws holds subscribers in-process; stopping the Machine evicts them). `[[http_service.checks]]` on `/health` matches the existing health route. `[env]` carries non-secret defaults (`AUTH_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`, `REALTIME_PROVIDER=native-ws`, `LLM_PROVIDER=openrouter`, `LLM_MODEL=anthropic/claude-sonnet-4.6`).

One opinionated deviation: `[[vm]] memory = "512mb"`. Fly's default 256 MiB shared-cpu-1x fits Node + tsx + pg Pool + ws subscribers at idle but pushes uncomfortably close under a handful of concurrent agent streams. 512 MiB gives breathing room at negligible extra cost. Sized up, not out — `cpu_kind = "shared"`.

**No `release_command`.** Plan-specified. Migrations run from a trusted workstation against the direct Supabase URL (port 5432), not via Fly, until rollback discipline catches up.

**Packaging smoke.** `pnpm --filter=@brandfactory/server deploy --prod --legacy /tmp/bf-deploy-test` produces a standalone tree; `node_modules/.bin/tsx src/main.ts` against it reaches the env validator (zod errors out on missing `DATABASE_URL` / `AUTH_PROVIDER` / etc.) — proves packaging + tsx entry + workspace-dep resolution all work end-to-end. Mirrors what the runtime stage does after `COPY --from=builder /out /app`.

### Phase 3 — Fly deploy invariants

One file changed: `packages/db/src/client.ts`. Five-line comment next to `new Pool({ connectionString })` pinning the pooler-safety invariants:

- **Do not enable server-side prepared statements** on this Pool.
- **Do not introduce `pg-native`.**

Both assumptions hold in v1 because node-postgres' default code path does neither — the JavaScript client uses the simple-query protocol by default, and `pg-native` is an explicit opt-in. The comment exists so a future contributor adding prepared-statement caching (a reasonable Postgres optimisation under a session-mode pooler or a direct connection) knows why it would silently break the production deploy where `DATABASE_URL` points at Supabase's PgBouncer on port 6543 (transaction mode).

**Why this matters.** PgBouncer in transaction mode multiplexes many clients over a small number of Postgres backends; any state expecting to outlive a single transaction (prepared statements cached in a session, `SET` that persists, temp tables, `LISTEN` subscriptions) gets silently lost when PgBouncer hands the next transaction to a different backend. The failure mode is devious — works fine under low concurrency (one backend always handy), breaks under load when PgBouncer starts multiplexing.

The plan asked for "a one-line comment in `client.ts` pinning the invariant. No code change needed today." That's exactly what landed.

Operator-side: nine `fly secrets set` values (`DATABASE_URL` to the **transaction pooler** at port 6543, not the direct URL; `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` / `SUPABASE_STORAGE_BUCKET` / `SUPABASE_JWKS_URL` / `SUPABASE_JWT_ISSUER` / `SUPABASE_JWT_AUDIENCE`, `OPENROUTER_API_KEY`), then `fly deploy`, then curl `/health` (expect 200) and `/me` with a Supabase access token (expect 200, body `{ id, email }` — also triggers Phase 1's `ensureUser` upsert server-side). Full playbook in `docs/completions/phase3-hosted.md`, including the preemptive failure-mode list (direct-URL connection exhaustion, JWT issuer/audience typos, region mismatch latency, OOM at 512 MiB).

### Phase 4 — Realtime / WS on Fly

No Fly config changes. The HTTP service already proxies `Upgrade: websocket` transparently — `wss://<app>.fly.dev/rt` works without a separate `[[services]]` block or TCP handler. The pre-shipped 30 s heartbeat (`DEFAULT_HEARTBEAT_MS` in `packages/adapters/realtime/src/native-ws.ts:21`) gives 2× headroom over Fly's 60 s edge idle timeout.

What landed is two doc-only changes pinning the single-instance commitment in the two places a contributor would look:

**`packages/server/src/adapters.ts`** — expanded the existing 2-line note above the `native-ws` branch into a paragraph: subscribers live in a `Map` on one Node heap (in-process pub/sub); `fly scale count 2` / `replicas > 1` silently drops cross-instance fan-out; horizontal scale requires a second `RealtimeAdapter` branch first (Supabase Realtime / Redis pub-sub); points to hosted-deployment-plan.md Question 3 for the trigger conversation. Sits exactly where the next contributor would edit — `buildAdapters` is the only construction site for the realtime adapter.

**`README.md`** — added one bullet under "Deploying it yourself" (Scaling). Vertical scale is fine (bigger VM); horizontal isn't, and the why is explained in one sentence with a link out.

The two-tab browser smoke test (the plan's full check — edit on Tab A, see the block paint on Tab B within one RTT) is operator work that depends on Phase 5 being live first. Single-tab CLI smoke via `wscat` against `wss://<app>.fly.dev/rt?token=$JWT` is feasible interim coverage; both flows documented in `docs/completions/phase4-hosted.md`.

### Phase 5 — Frontend on Vercel

One file: `packages/web/vercel.json` — SPA fallback rewrite.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Without it, any deep-link into a TanStack Router client route (e.g. `/workspaces/abc/projects/xyz`) 404s on browser refresh because Vercel looks for a literal static file at that path. Standard Vite+SPA pattern: every incoming path that isn't a static asset maps back to `index.html`, so the SPA router owns all routing. Static assets under `/assets/*` keep direct file-match because Vercel's rewrite engine checks the filesystem first and only falls back to the rewrite on a miss.

**Root-Directory placement matters.** `vercel.json` must sit at the Vercel "Project Root Directory", which per the plan is `packages/web` (not the repo root). Vercel's monorepo-scoped build wouldn't see it at the repo root. This also means the `rewrites` only affect the web app — the monorepo's other packages are invisible to Vercel.

**No Vite config change.** The 1.1 MB main-chunk warning persists (TipTap + Radix dominate; flagged since Phase 7 Step 15). Code-splitting / lazy-import pass remains a deferred item. The Phase 2 "ship source, skip `tsc -b`" decision applies here too: Vite resolves cross-package TS via workspace symlinks at build time, walking `@brandfactory/shared`'s `main: ./src/index.ts` and bundling TS directly into the final JS.

Operator-side: Vercel project setup (Framework: Vite; Root Directory: `packages/web`; Build Command: `pnpm -F @brandfactory/web build`; Output Directory: `dist`; Node 20.x), five `VITE_*` env vars (`VITE_API_BASE_URL`, `VITE_RT_URL`, `VITE_AUTH_PROVIDER=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — all five public-safe), Supabase auth redirect URLs (`https://<vercel-app>.vercel.app/**` plus a preview wildcard plus `http://localhost:5173/**` — trailing `/**` is mandatory because Supabase magic-link callbacks include a hash fragment and the redirect allowlist pattern-matches on prefix). First push to `main` triggers the build; ~2–3 min. Full playbook in `docs/completions/phase5-hosted.md`.

**Expected interim breakage between Phase 5 and Phase 6.** Authed requests with `Authorization: Bearer ...` trigger CORS preflight; without `CORS_ALLOWED_ORIGINS` set on Fly, those preflights fail. `/me` will fail in the browser even though `curl` works. This is sequenced intentionally — Phase 6 flips the switch.

### Phase 6 — Cross-origin wiring (CORS)

No code changes. The CORS gating shipped in v0.8.0 (Phase 8) — `parseCorsAllowedOrigins` + `isOriginAllowed` helpers in `packages/server/src/cors.ts`, conditional `hono/cors` mount in `app.ts`, WS upgrade-guard in `ws.ts` — was designed as a runtime-only switch. Setting `CORS_ALLOWED_ORIGINS` flips both transports on in lockstep. Phase 6 is one `fly secrets set CORS_ALLOWED_ORIGINS="https://<project>.vercel.app"` and the Machine restarts automatically.

**Exact-match only.** Paste the full origin: scheme + host (+ port if non-default). No trailing slash, no wildcard, no path. Custom domain? Comma-separate both — `https://<project>.vercel.app,https://app.brandfactory.com` — for the transition period. The split/trim/filter in `parseCorsAllowedOrigins` does not normalize trailing slashes by design; exact-match keeps the trust boundary crisp.

**Preview deploys.** If a preview URL needs live-API access, add it temporarily (comma-append). Not scalable across many previews. The plan flags wildcard / suffix-match support as a ~10-line extension (a `match` variant that falls through `exact-match → endsWith-match → deny`, behind an opt-in flag) plus one test — landing it preemptively was rejected per scope discipline. First time preview-against-prod becomes routine, that's the prompt.

**Smoke from the browser** (DevTools Network):

| Request                              | Expected                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `OPTIONS /me` (preflight)            | 204 with `Access-Control-Allow-Origin: <vercel-origin>`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Methods` / `-Headers` present. |
| `GET /me` with `Authorization: Bearer <jwt>` | 200, body `{ id, email, ... }`. No CORS error in Console.                 |
| `WS /rt?token=...`                   | 101 upgrade. `Origin` header carries the Vercel URL.                         |

Optional WS deny-path smoke — `curl` with a forged `Origin: https://evil.test` against `/rt` should return 403 (the upgrade handler writes `HTTP/1.1 403 Forbidden\r\n\r\n` directly to the socket so the browser reads a permanent denial, not a transport error that would trigger reconnect loops).

The plan's full end-to-end smoke (login → workspace → brand → project → drop image → ask agent) is the last operator step and the proof that all six phases line up. Detailed in `docs/completions/phase6-hosted.md`.

### Verification

```
pnpm typecheck                          ✔  9/9 workspaces clean
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  237 passed + 1 skipped (238 total; +4 vs 0.8.0)
pnpm --filter=@brandfactory/server deploy --prod --legacy /tmp/bf-deploy-test
                                        ✔  standalone tree built; tsx reaches env validator
```

The skipped case is `seed.test.ts` (runs only with `DATABASE_URL` set, exercised in CI's Postgres service). All four new tests are in `packages/adapters/auth/src/supabase.test.ts` (+4) covering the `ensureUser` provisioning path.

### Files touched (net diff)

- `packages/adapters/auth/src/supabase.ts` — `verifyToken` now calls `ensureUser` on first verify per `sub`; `SupabaseAuthDeps` gains `ensureUser?` and `provisionedCache?` test seams.
- `packages/adapters/auth/src/supabase.test.ts` — +4 cases.
- `packages/db/src/queries/users.ts` — new `upsertUserById({ id, email, displayName? })` helper.
- `packages/db/src/client.ts` — pooler-safety invariants comment.
- `packages/server/src/adapters.ts` — single-instance commitment paragraph above the `native-ws` branch.
- `packages/server/Dockerfile` — new (multi-stage, `pnpm deploy --prod --legacy /out`, tini-wrapped tsx).
- `packages/server/package.json` — `tsx` moved from devDependencies to dependencies.
- `packages/web/vercel.json` — new (SPA fallback rewrite).
- `fly.toml` — new (repo root).
- `.dockerignore` — new (repo root).
- `README.md` — Scaling bullet under "Deploying it yourself".
- `docs/executing/hosted-deployment-plan.md` — the source plan, retained.
- `docs/completions/phase{1,2,3,4,5,6}-hosted.md` — six per-phase completion docs with operator playbooks.

### What 1.0 explicitly does NOT include

**Operator work that remains to actually be live in production:** create the Supabase project + run migrations + seed admin user + create the `brandfactory-blobs` bucket; `flyctl auth login` + `fly apps create` + update `app` and `primary_region` in `fly.toml`; `fly secrets set` for nine env vars + `fly deploy` + smoke `/health` and `/me`; create the Vercel project + set five `VITE_*` env vars + configure Supabase redirect URLs + push to `main`; `fly secrets set CORS_ALLOWED_ORIGINS` and end-to-end smoke. None of this can be automated from inside the repo — credentials, dashboards, and human judgement on region selection are involved.

**Deferred items, by category:**

- **Migrations automation.** `release_command` for `db:migrate` would let `fly deploy` apply migrations atomically; v1 keeps manual migration from a trusted workstation against the direct URL (port 5432) until rollback discipline catches up.
- **Horizontal scale.** Single-instance commitment is documented in three places (adapters.ts, README, fly.toml). A second `RealtimeAdapter` impl (Supabase Realtime is the no-new-infra candidate; Redis pub-sub the cheaper one) lands when concurrency demands it, not preemptively. See plan Question 3.
- **CI for deploys.** No `.github/workflows/deploy.yml`. `fly deploy` runs from a trusted workstation in v1.
- **Wildcard / suffix-match CORS.** Exact-match only today; ~10-line extension when preview-against-prod becomes routine.
- **Custom domains.** `*.fly.dev` and `*.vercel.app` are fine for dogfooding; `fly certs` + Vercel Domains land later.
- **Observability.** `fly logs` + the existing `rt.*` / request-id breadcrumbs are v1 observability. Sentry / structured error tracking deferred (plan Question 6).
- **Graceful-drain on deploy.** Today `fly deploy` restarts the Machine, killing all WS connections; clients reconnect within seconds via exponential backoff. Zero-downtime WS drain would need Fly's drain-target + a server-side "new connections rejected" flip — not user-visible-critical at v1.
- **Resumable subscriptions / push-based replay.** `onResynced` fires on reconnect and the canvas re-queries; state converges. Push-based replay is incremental nice-to-have.
- **Image size optimization.** ~200 MB Alpine + pnpm-deploy pruning. Distroless / slim variants would shave further; not worth it at this budget.
- **Dropped self-host deploy recipe** (carried forward from 0.8.0): server + web Dockerfiles for self-hosters (the v1 Dockerfile is server-only and Fly-shaped), three-service compose, `bootstrap.sh`, GHCR image publishing, multi-arch image builds, signed releases, production TLS / reverse-proxy configs. Returns when a concrete self-hoster surfaces with a real setup to support.

---

## 0.8.0 — 2026-04-20

Phase 8 is a reproducibility pass — no feature surface, no UI work. The original plan bundled dev-onboarding with a full self-host deploy story (server + web Dockerfiles, three-service compose, `bootstrap.sh`); we dropped the deploy half (no concrete self-hoster has surfaced, opinionated Dockerfiles are a maintenance magnet) and shipped the onboarding + CI + CORS half. Five steps land: `db:seed`, root `.env.example` + drift guard, GitHub Actions CI, README rewrite, and a CORS allowlist that gates HTTP **and** the `/rt` WS upgrade. Full step-by-step notes in `docs/completions/phase8.md`; full plan + scope rationale in `docs/executing/phase-8-plan.md`.

Test count 223 → **234 (+11)**: +1 seed idempotency (live-DB, skipped without `DATABASE_URL` so locals pass at 233 + 1 skipped; CI exercises it against the Postgres service) + 1 `.env.example` drift guard + 8 cases in `packages/server/src/cors.test.ts` + 1 WS upgrade-guard case in `ws.test.ts`.

### Step 0 — Seed script + dev-token flow

Closes the "manual `INSERT INTO users`" gap from 0.7.4. `packages/db/src/seed.ts` is a transactional idempotent seed: one user + one workspace + one brand (three seed guideline sections) + one freeform project + canvas, under hard-coded RFC-4122 v4 UUIDs (`00000000-0000-4000-8000-000000000001…5`). Every insert uses `onConflictDoNothing({ target: <table>.id })`, so reruns are safe and the printed dev token never changes.

**Printed token = the user UUID.** The `local` auth adapter already accepts any UUID that exists in `users` as a bearer — no new token format. `packages/db/package.json` gains a `db:seed` script (`tsx src/seed.ts`); the file self-executes when run directly (`/seed\.[cm]?[jt]s$/` check on `process.argv[1]`) but imports cleanly for tests.

`seed.test.ts` runs `seed()` twice and asserts one row per aggregate (three for guideline sections). `describe.skipIf(!process.env.DATABASE_URL)` so contributors without Postgres still pass `pnpm test`; CI gets a Postgres service container and runs it.

`packages/web/README.md` loses the "one-shot `INSERT`" paragraph in favour of the `db:seed` pointer.

### Step 1 — Root `.env.example` + drift guard

Rewritten to match the plan's "minimal viable defaults" policy: shipped stack is `local` auth + `local-disk` storage + `native-ws` realtime + `openrouter` LLM — the path with the fewest third-party accounts. A contributor with an OpenRouter key boots end-to-end. Optional keys are **commented-out** (not empty-string) — `""` trips `NonEmpty.optional()` (`string` but fails `min(1)`); the comment prefix avoids that footgun and lets the drift guard use a stable regex. Secret fields ship placeholder sentinels (`sk-or-v1-...`, `sk-ant-...`) to make "still need to fill this in" obvious. Section headers mirror `env.ts`'s comment groupings so readers cross-referencing find the same order.

**`env.ts` split.** `.superRefine()` in zod v4.3.6 produces a `ZodEffects` that doesn't expose `.shape`. Split the schema into `EnvObject = z.object({…})` (inspectable) + `EnvSchema = EnvObject.superRefine(…)` (the validator). Same `Env` type, same `loadEnv()` behaviour, and `ENV_SCHEMA_KEYS` is now a first-class export. Prior consumers untouched.

**`packages/server/src/env.example.test.ts` — drift guard.** Reads `.env.example` from the repo root via `import.meta.url` + `fileURLToPath` (server package is ESM — no `__dirname`), greps each line for `^\s*#?\s*([A-Z][A-Z0-9_]*)=`, asserts every `ENV_SCHEMA_KEYS` entry appears. Manually verified: deleting `DATABASE_URL=…` from the example produces `missing from .env.example: DATABASE_URL` and a red test. `packages/server/.gitignore` not created — the root `.gitignore` already ignores `.env` recursively.

### Step 3 — GitHub Actions CI

`.github/workflows/ci.yml` — one `verify` job, triggered on `pull_request` + `push main`. Node 20 matrix only (no 18 fallback; `.nvmrc` pins 20).

- **Order matters.** `actions/setup-node@v4` with `cache: 'pnpm'` needs the pnpm binary on PATH and `pnpm-lock.yaml` present to hash. Sequence: `checkout → pnpm/action-setup@v3 → setup-node@v4 (node-version-file: .nvmrc, cache: pnpm) → pnpm install --frozen-lockfile`.
- **pnpm version from `packageManager`.** `pnpm/action-setup@v3` reads `package.json`'s `"packageManager": "pnpm@10.28.2"` — no version duplicated in the workflow.
- **Postgres 16 service container** (`user/password/db = brandfactory`, `pg_isready` healthcheck, port 5432 published). `DATABASE_URL=postgres://brandfactory:brandfactory@localhost:5432/brandfactory` exported job-level.
- `pnpm -F @brandfactory/db db:migrate` runs before tests so the seed test sees a real schema.
- Four check steps (typecheck, lint, format-check, test) as separate `- run:` entries so a PR author sees every failure in one run, not just the first.
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` so force-pushes to a PR don't pile up. Default `permissions: contents: read`.

No `images.yml` — paired with the dropped Dockerfiles; returns when they do. Root README gets a CI badge.

### Step 4 — Root `README.md` rewrite

The root README becomes the complete first-run document; `packages/web/README.md` demotes to a frontend-dev reference. Kept: branding block, `The problem` / `The idea` / `Who it's for` / `Why open source` / `How it'll work` / `Tech stack` / `License`. Replaced:

- **Status** — now names the Phase-8 adds (dev seed, root env template, CI, CORS gate); "Up next" points at Phase 9 (Playwright, adapter docs, standardized templates).
- **Quickstart** — six-command flow: `pnpm install`, compose up Postgres, `cp .env.example`, `cp packages/web/.env.example`, `db:migrate`, `db:seed`, `pnpm dev`. Contributors who prefer their own Postgres skip the compose line.
- **Configuration** table — every server env var with required-when, default, one-line note. `SUPABASE_*` and per-provider LLM keys grouped for readability; frontend env delegates to `packages/web/README.md`.
- **Swapping the LLM provider** — three-step walkthrough. Explicitly notes the compile-time `LLM_PROVIDER_IDS` union so readers understand why widening it propagates everywhere.
- **Deploying it yourself** — one honest paragraph: server is a plain Node app, web is a static Vite build, `CORS_ALLOWED_ORIGINS` handles split-origin; links to GitHub issues inviting self-hosters to share their setups. No opinionated Dockerfile / compose / bootstrap.
- **Contributing** — rewired around CI with a link to `.github/workflows/ci.yml`.

Killed the self-aware "Phase-8 README overhaul will fold…" sentence.

### Step 5 — CORS pass

Single env switch gates both transports: `CORS_ALLOWED_ORIGINS` (optional, comma-separated). Unset → no CORS mount, no WS origin check (single-origin dev via Vite proxy is unaffected). Set → both enforce the same exact-match allowlist so HTTP and WS cannot drift.

- **`packages/server/src/cors.ts`** — two pure helpers. `parseCorsAllowedOrigins(raw)` returns `null` (unset) or `string[]`; empty/whitespace-only inputs fold to `null` so "no allowlist" stays a distinct value (not `[]`, which would mean "allow nothing"). `isOriginAllowed(origin, list)` — `null` list permits, set list + missing origin denies, set list + origin requires exact match. The same function drives the HTTP `cors()` `origin:` callback and the WS upgrade guard.
- **`app.ts`** — `hono/cors` mounted conditionally, before `onError`, with `origin: req → allowlist.includes(origin) ? origin : null`, `credentials: true`, `allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS']`, `allowHeaders: ['content-type','authorization']`.
- **`ws.ts`** — upgrade handler 403s before `handleUpgrade`. Explicit `socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')` before `socket.destroy()` so the browser reads a permanent denial instead of a transport failure (which would trigger client-side reconnect loops). Same pattern `ws` uses internally when `verifyClient` rejects. `MountRealtimeDeps` gains `allowedOrigins?: string[] | null`; `main.ts` threads `parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS)` through.
- **Tests.** `cors.test.ts` covers the two helpers (5) + the HTTP middleware (3) via `app.request('/health', { headers: { origin } })`. `ws.test.ts` adds one integration-style case: `EventEmitter` stand-in for `HttpServer`, vi-mocked `realtime.bindToNodeWebSocketServer`, fake `Duplex` with spies — emits `upgrade` with a disallowed origin and asserts `write('HTTP/1.1 403 …')` + `destroy()` fired.
- **`.env.example`** — new commented section documents the setting. The drift guard (Step 1) forces it to stay in sync.

### Verification

```
pnpm typecheck                          ✔  9/9 workspaces clean
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  233 passed + 1 skipped (234 in CI)
```

### Items explicitly dropped / deferred

**Dropped this phase** (deploy half of the original plan): server + web Dockerfiles · full three-service `docker/compose.yaml` · `scripts/bootstrap.sh` · `images.yml` CI workflow + GHCR publishing · multi-arch image builds · signed image releases · production TLS / reverse-proxy config · `.env.web.example` at the repo root.

**Deferred to later phases:** optimistic canvas mutations, server-side `position` rebalance, `Cmd-K` palette (Phase-7 tail). Playwright e2e, per-aggregate integration tests, `docs/adapters.md` (Phase 9). DB backup/restore, secrets management, observability (deployer territory). CodeQL / Dependabot / Renovate (separate dependency-hygiene pass).

---

## 0.7.4 — 2026-04-20

Phase 7 Steps 12–16 close out the frontend phase. Step 12 replaces the placeholder canvas pane with the real thing — text/image/file block renderers, drag-reorder, pin/unpin/delete, and a drop-zone that uploads via signed URL. Step 13 lifts `applyAgentEvent` into its own module (no behaviour change) so SSE and realtime paths share one cache-write surface. Step 14 lands shell polish (dark-mode toggle, router error/pending boundaries, `Cmd/Ctrl-S` in the brand editor). Step 15 is the frontend vitest pass — test count 167 → **223 (+56)** across 9 workspaces, and surfaced one `useAgentChat` bug that shipped silent in 0.7.3. Step 16 wires dev-env plumbing (`scripts/dev.sh`, `packages/web/.env.example`, `packages/web/README.md`). Phase-7 net growth: +27 backend (Step 0) + 56 frontend (Step 15) = 200 tests. Full step-by-step notes in `docs/completions/phase7-step-{12,13,14,15,16}.md`.

### Step 12 — Canvas pane (blocks + TipTap + pinning + drop zone)

Right-pane placeholder → real canvas. Five new files under `src/components/canvas/`:

- **`blocks/BlockChrome.tsx`** — hover-reveal left rail: drag handle (`GripVertical`), pin/unpin star, delete trash. Drag listeners attach to the handle only — `PointerSensor`'s 8 px activation constraint isn't enough to disambiguate clicks inside the TipTap editor. Same pattern as the brand editor.
- **`blocks/TextBlockView.tsx`** — TipTap editor seeded with `block.body`, using `defaultExtensions` from `@/editor/proseMirrorSchema` (bit-identical to the brand editor — prereq for the future "promote canvas block to brand section" flow). Edits debounced 500 ms; unmount flushes pending edits. Inbound realtime echoes are **not** synced back into the editor — canvas is last-write-wins per block (Phase-7 plan non-goal).
- **`blocks/ImageBlockView.tsx`** — `<img>` from `useSignedReadUrl(blobKey)`, click opens a minimal lightbox. Inline alt-text input PATCHes on blur (sends `alt: null` on empty string, matching `UpdateCanvasBlockInputSchema.nullable()`).
- **`blocks/FileBlockView.tsx`** — icon + filename + mime + "Download" link to the signed read URL. No preview.
- **`CanvasPane.tsx`** — wraps visible blocks in `DndContext` + `SortableContext` (vertical), renders one `SortableBlock` per block dispatching by `block.kind`, hosts the drop-zone and "+ Text block" button. Replaces the inline placeholder from the route.

New mutation/query hooks under `src/api/queries/`:

- **`canvas.ts`** — five mutations (`useCreateCanvasBlock`, `useUpdateCanvasBlock`, `usePinCanvasBlock`, `useUnpinCanvasBlock`, `useDeleteCanvasBlock`). **Non-optimistic in v1** — the server publishes a realtime event after every DB write and `applyAgentEvent` folds it into the cache, so mutation return values are advisory.
- **`blobs.ts`** — `useSignedReadUrl(key)` (staleTime/refetchInterval 4 min against the server's 5 min TTL so an `<img>` at the edge of the window doesn't race expiry) + `uploadBlob({ file })` two-step helper. Both use raw `fetch` not `hono/client` — the server's `/blob-urls/:key{.+}/read-url` path contains slashes that the hono client doesn't round-trip cleanly (same reasoning as `useAgentChat` for streaming).

**Drag-reorder PATCHes one block, not the whole list.** `positionAt` sandwiches the moved block between neighbours as `Math.floor((before + after) / 2)`, with ±1000 bookends. Stays inside `int4` for a long time before consecutive positions converge and need a server-side rebalance pass. Matches the brand editor's sparse-integer trick.

**Drop-zone.** `onDragEnter` toggles a dashed outline on `Files` drag-over; `onDragLeave` only clears when leaving the pane element itself (`currentTarget === target`) so child elements don't flicker. A `uploading` count paints skeleton blocks per in-flight upload; skeletons disappear when the create-block mutation resolves (which is also when the realtime echo paints the real block). No byte-level progress — uploads are a single PUT to storage.

**MIME allowlist is checked client-side AND server-side.** `ALLOWED_UPLOAD_MIMES` in `@brandfactory/shared` rejects unsupported types with a toast before minting an upload URL; the server rejects with `400 INVALID_CONTENT_TYPE` if the client lies. Client save is one round-trip; server is the trust boundary.

### Step 13 — Unified `applyAgentEvent` dispatcher

`src/realtime/applyAgentEvent.ts` — the dispatcher lifted out of `useProjectStream.ts` into its own module. No behaviour change. The three mutation paths (local mutations via realtime echo, `useAgentChat` in-turn SSE, `useRealtime` out-of-turn fan-out) now share one cache-write surface — future rule changes edit one file. `qc` typed as `QueryClient` directly (not `ReturnType<typeof useQueryClient>`) so a pure function doesn't pull a React hook into its type surface.

**Validation stays at the boundaries.** `useAgentChat` parses each SSE `data:` payload with `AgentEventSchema.parse` before calling `applyAgentEvent`; `RealtimeClient` validates inbound WS frames against `RealtimeServerMessageSchema` (which wraps `AgentEventSchema`). Pushing the parse into the dispatcher would double-parse the realtime path.

**Dedup policy unchanged.** `add-block` dedupes by `block.id`; `message` by `event.id`; `update-block`/`remove-block`/`pin-op` are idempotent writes. The `updatedAt`-aware monotonic dedup stays on the post-Phase-7 hardening list — it would require wiring `updatedAt` through the `canvas-op` event shape, a Phase-5/6 wire change.

### Step 14 — Shell polish

- **`src/lib/theme.ts`** — tiny module around `localStorage['bf_theme']` (`'light' | 'dark' | 'system'`). `applyTheme(mode)` toggles `.dark` on `<html>`; `resolveTheme` reads `matchMedia('(prefers-color-scheme: dark)')` when mode is `system`. No React — callable at module-entry in `main.tsx` to avoid a flash of the wrong theme before first render.
- **`src/components/ThemeToggle.tsx`** — icon button in the top nav cycling `light → dark → system`. `useEffect` listens to `prefers-color-scheme` changes only while mode is `system`, so OS-level flips propagate live.
- **`src/components/RouteError.tsx`** — exports `RouteError` (router's `defaultErrorComponent`) + `RoutePending` (`defaultPendingComponent`). Error view narrows on `AppError` so the server's `{ code, message }` renders as-is; "Retry" calls both `reset` and `router.invalidate()` so React-Query caches refetch, not just route state. Wired in `router.tsx` with `defaultPendingMs: 400` (Nielsen's "does this feel instant" threshold).
- **`Cmd/Ctrl-S` in the brand editor** — document-level `keydown` listener (a form-level handler trips `jsx-a11y/no-noninteractive-element-interactions`). A `saveRef.current = save` assigned in a no-deps `useEffect` keeps the latest save closure bound without breaking `react-hooks/refs`.

**`Cmd-K` command palette dropped** per the plan's stretch-goal guidance. The actions that would live in a palette today (new workspace, new brand, open settings, toggle theme) are all one click away; adding `cmdk` + another focus trap isn't worth it until the action count justifies it.

### Step 15 — Frontend vitest pass (+56)

Isolated-unit coverage for the hairy parts of `@brandfactory/web`. Test count 167 → **223 (+56)** across 9 workspaces.

- **`agent/sseParser.test.ts`** (8) — single-frame, default `event: message`, multi-frame per chunk, cross-chunk buffering, keep-alive comments, optional space after colon, multi-line `data:`, comment-only frames.
- **`realtime/applyAgentEvent.test.ts`** (11) — every `AgentEvent` kind over before/after cache snapshots: `canvas-op` add/update/remove (incl. dedupe by `block.id`), `pin-op` pin/unpin (idempotent), `message` append + dedupe by id, `tool-call` no-op (identity-asserted), missing-cache guard.
- **`realtime/client.test.ts`** (9) — `FakeWebSocket` + `vi.resetModules()` per test so the singleton resets cleanly. Covers initial connect, channel dispatch, malformed-frame drop, cross-channel isolation, ref-counting (two handlers → one socket), teardown-on-last-unmount, exponential backoff (incl. backoff reset on `onOpen`), `onResynced` firing on reconnects but not first connect.
- **`api/client.test.ts`** (5) — happy 2xx parse, `AppError` on non-2xx, statusText fallback, `logout()` side effect on 401, `AppError` shape.
- **`agent/useAgentChat.test.tsx`** (5) — mocks `fetch` against a `ReadableStream`-backed SSE body. Golden path (optimistic user push + assistant message + `canvas-op` folded via `applyAgentEvent`), 409 `AGENT_BUSY` toast, 401 → `logout()`, in-stream `error` frame transitioning to the error state (**surfaced the bug below**), empty-input short-circuit.
- **`editor/proseMirrorSchema.test.ts`** (4) — `defaultExtensions` mounted in a real `@tiptap/core` `Editor` (jsdom) produce docs that pass `ProseMirrorDocSchema`, round-trip `setContent → getJSON`, support H1–H3, render `bulletList`. Pins the invariant that brand editor + canvas text-block share the exact schema.
- **`lib/theme.test.ts`** (8) — `getStoredTheme` defaults / stored-value / unknown fallback, `setStoredTheme` writes to `localStorage`, `resolveTheme` explicit vs `system` (with `matchMedia` stubbed via `vi.stubGlobal`), `applyTheme` toggles `.dark`.
- **`canvas/blocks/BlockChrome.test.tsx`** (4) — accessible labels, `Pin ↔ Unpin` toggle, `onTogglePin`/`onDelete` fire on click, `pending` disables pin+delete but leaves drag interactive.
- **`canvas/blocks/TextBlockView.test.tsx`** (2) — editor mounts with body text visible, `[contenteditable="true"]` surface present. Debounce/unmount-flush assertions were flaky under jsdom (TipTap async init + React 19) — kept focused on mount.
- **`src/test-setup.ts`** — calls RTL's `cleanup()` after each test. Required the moment a second test rendered a similarly-named button.

**Bug found + fixed: `useAgentChat` error state was silently clobbered.** `send`'s trailing `if (status !== 'error') setStatus('idle')` read `status` from the `useCallback` closure (captured at render as `'idle'`), so after an in-stream `event: error` frame set state to `'error'`, the trailing line immediately overrode it back to `'idle'` in the same tick. UI silently dropped the error. Replaced the stale closure read with a local `hadError` flag written in the error branch. One-line fix.

**Workspace orchestration quirk: `vitest.workspace.ts` > `test.projects`.** Running root `pnpm test` with `test.projects: ['packages/web']` in `vitest.config.ts` silently dropped `environment: 'jsdom'` and the `@/*` alias from the web config — TipTap + `localStorage` tests failed with "no window" / "localStorage is not defined". Switching to a top-level `vitest.workspace.ts` listing each package's config did honour per-project `environment` / `resolve.alias`. Root `vitest.config.ts` is now effectively empty + documented. `eslint.config.js` adds `**/vitest.workspace.ts` to `ignores` (TS project-service parser otherwise trips on the file).

**No `jest-dom` matchers, no `user-event`.** Golden-path component tests use RTL's built-ins (`getByRole`, `.disabled`, `.classList`) — fine at this coverage level. Deferred: `DropZone` integration test (80% mocks for 20% assertion; deferred to Playwright in Phase 9), `positionAt` unit test (module-local to `CanvasPane.tsx`; extracting is scope creep), `useProjectStream` hook test (delegates entirely to `subscribe` + `applyAgentEvent`, both tested in isolation), `uploadBlob` helper test (straight-line `fetch` glue).

### Step 16 — Dev & env plumbing

- **`packages/web/.env.example`** — the five `VITE_*` vars the frontend reads (`VITE_API_BASE_URL`, `VITE_RT_URL`, `VITE_AUTH_PROVIDER`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Header comment calls out that `VITE_*` vars inline into the client bundle — no secrets. Supabase anon key is public-safe by design; service-role key stays server-side.
- **`packages/web/README.md`** — frontend-specific dev docs: quickstart, env var table, dev-proxy explainer, auth-provider walkthrough (local + supabase), scripts reference, three troubleshooting entries that came out of Step 15.
- **`scripts/dev.sh`** — replaced the Phase-0 placeholder with a real parallel launcher. Plain `pnpm -F @brandfactory/server dev` + `pnpm -F @brandfactory/web dev` backgrounded; `trap cleanup INT TERM EXIT` kills both children on any exit path; `wait -n` exits as soon as either dies so a crashed server doesn't leave Vite running with misleading 500s. No `concurrently` / `turbo` dep — bash + pnpm in ~20 lines.
- **Root `README.md`** — Status block updated ("server + web shipped"); new "Running locally" section (4-command quickstart pointing at `packages/web/README.md`). Minimal on purpose — Phase 8 owns the full README rewrite.

**Dev token = any user UUID in the DB.** The plan's Step 4 mentioned a dev seed script printing one at boot; no such script exists yet, and Step 16 isn't the place to add it. `packages/web/README.md` documents a one-shot `INSERT INTO users (email) VALUES (…) RETURNING id` + paste into `/login`. Seed script is post-Phase-7.

### Verification

```
pnpm typecheck                          ✔  9/9 workspaces clean
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean
pnpm test                               ✔  223 tests (+56; 167 → 223)
pnpm --filter @brandfactory/web build   ✔  dist/ clean
bash -n scripts/dev.sh                  ✔  shell syntax clean
```

The pre-existing 1.1 MB JS chunk warning is unchanged — TipTap + Radix dominate. Bundle budget is on the post-Phase-7 hardening list.

### Items deferred from Steps 12–16

- **Optimistic canvas mutations** — every user canvas-op round-trips today; pin toggle latency is the most visible offender. Post-Phase-7 hardening.
- **Server-side position rebalance** — `positionAt` will eventually produce equal positions after enough back-and-forth dragging in the same gap. Periodic rebalance to sparse integers on the server fixes it.
- **Width/height on image upload** — `CreateImageCanvasBlockInputSchema` accepts them; currently left undefined (natural `<img>` sizing).
- **Lightbox polish** — single fullscreen image + click-to-close today; no prev/next, no keyboard nav, no zoom.
- **Tool-call accordion UI in chat** — `tool-call` events still pass through `applyAgentEvent` as a no-op; flagged since Step 11.
- **Inbound TipTap sync (collab editing)** — non-goal per the plan's no-CRDT stance.
- **Monotonic op-id dedup** — requires wiring `updatedAt` through the `canvas-op` event shape.
- **`DropZone` / `CanvasPane` integration test**, `positionAt` unit test, `useProjectStream` hook test, `uploadBlob` helper test — see Step 15 notes.
- **`Cmd-K` command palette** — dropped per stretch-goal guidance.
- **Theme-switch view-transition**, **multi-tab theme sync** — minor polish, deferred.
- **`scripts/bootstrap.sh` / dev seed script** — would print a usable dev token on first boot; docs note the manual `INSERT` fallback.
- **CORS headers for cross-origin prod deploys** — frontend handles absolute `VITE_API_BASE_URL` / `VITE_RT_URL`, but the Hono server doesn't mount CORS yet. Single-origin dev is fine; split deploy needs a CORS pass.
- **Playwright smoke alignment with the plan's Step 17 checklist** — Phase 9 automates this.

---

## 0.7.3 — 2026-04-20

Phase 7 Steps 7–11 — the first user-facing screens land on top of the app shell from 0.7.2. A user can now log in, create a workspace, create a brand, edit brand guidelines as rich text, create a project, open its split-screen, and run an agent turn whose assistant text and canvas-ops stream into the cache live. No new backend tests; test count stays at 167 across 9 workspaces (UI components have no isolated logic units yet — vitest coverage for `useAgentChat` and `sseParser` is scoped to Step 15). Full step-by-step notes in `docs/completions/phase7-step-{7,8,9,10,11}.md`.

### Step 7 — Workspaces + brands list + workspace picker

`/workspaces` renders `useWorkspaces()` as a grid with a "New workspace" Dialog; success invalidates `workspaceKeys.all()`, writes the new id to `localStorage` (`bf_last_workspace` via `src/lib/last-workspace.ts`), and navigates. `/workspaces/$wsId` mirrors the pattern for brands (`useWorkspaceBrands`). A `WorkspacePicker` `Select` in `__root.tsx`'s header is gated on `useAuthStore.token` (`useWorkspaces({ enabled: !!token })`) so it doesn't fire a 401 + inadvertent `logout()` on the login page. `autoFocus` dropped from dialog inputs to satisfy `jsx-a11y/no-autofocus`; Radix's focus trap covers it.

### Step 8 — Settings page

`/workspaces/$wsId/settings` renders `ResolvedWorkspaceSettings` with a `SourceBadge` ("workspace setting" / "env default") driven by `source`. Provider `Select` reads `LLM_PROVIDER_IDS` from `@brandfactory/shared` (widening the const auto-propagates). Form uses a **draft-overlay** pattern — `useState<FormDraft | null>(null)` with displayed values falling back to server data — so no `useEffect` writes into local state. `useUpdateWorkspaceSettings` calls the `PATCH` and `setQueryData`s the response back into the cache (no refetch). Save is disabled unless dirty + both fields present. API keys stay server-env only for v1; a muted line explains that DB-persisted keys are a later pass.

### Step 9 — Brand editor

`/brands/$brandId` replaces its placeholder with a full TipTap v3 + dnd-kit sortable section editor. New deps: `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. `src/editor/proseMirrorSchema.ts` exports a shared `defaultExtensions` array (StarterKit + H1–H3) so Step 11's canvas text-block editor sees bit-identical formatting — prerequisite for the future "promote section to canvas block" flow. `BrandEditorForm` holds `LocalSection[]` with `_key` (stable React key), optional `id` (omitted → server inserts), `label`, `body`, `priority`. Save rewrites `priority` to `(index + 1) * 1000` on the outgoing payload (stable sparse integers); server response replaces local state. `PointerSensor` uses `activationConstraint: { distance: 8 }` so clicks inside the TipTap editor don't accidentally start a drag. Drag handle is `GripVertical` with `{...attributes} {...listeners}` — drag zone is the handle only. `key={brand.id}` on `BrandEditorForm` prevents query-refetch from nuking in-progress edits. Suggested-category chips (from `SUGGESTED_SECTIONS` in shared) hide once their label is in use.

### Step 10 — Project split-screen layout

`/projects/$projectId` fetches `ProjectDetail` via `useProjectDetail` and subscribes to `project:<id>` via `useProjectStream`. Three new components under `src/components/project/`:

- **`TopBar.tsx`** — breadcrumb `{brand.name} / {project.name}`; brand is a typed `<Link>` to `/brands/$brandId`.
- **`ShortlistToggle.tsx`** — two-button pill with `role="tablist"`, exports `ShortlistMode = 'all' | 'shortlist'`; shortlist count rendered inline (`Shortlist (N)`).
- **`SplitScreen.tsx`** — hand-rolled draggable divider (~55 lines). Decision: **not vaul** — vaul is drawer-shaped, not split-pane-shaped. `setPointerCapture` on pointer-down for drag semantics even when cursor leaves the handle; `hasPointerCapture`-guarded release so StrictMode double-fire doesn't throw. `leftPct` clamped 25–65%, defaults to 36. Not persisted in v1.

`CanvasPane` / `ChatPane` stay inline in the route for now — they're placeholders in Step 10 and get replaced in Step 11 (chat) / Step 12 (canvas blocks). `CanvasPane` already wires the client-side shortlist filter (`useMemo` over `Set<blockId>`) so toggling works before block renderers land.

### Step 11 — Chat pane (`useAgentChat`)

First end-to-end consumer of the Phase-6 SSE route from the browser. New deps: `react-markdown` + `remark-gfm` (~40 kB gz, paid once) for assistant bubbles — plain text would read `* tagline` literally the first time the model returns a list.

- **`src/agent/sseParser.ts`** (~40 lines) — stateful chunk-wise `SseFrameParser`. Splits on `\n\n`, walks lines (`:` = keep-alive comment, `event:`, `data:`), strips leading `: ` per SSE spec. Bringing in `eventsource-parser` was rejected: we own both ends and the format is a narrow subset.
- **`src/agent/useAgentChat.ts`** — `{ status, error, send, stop }`. Intentionally narrower than Vercel's `useChat`: **messages are not hook state**. Server `message` events carry full segments (flush-on-boundary, not per-token), feed straight into `applyAgentEvent`, which appends to `ProjectDetail.recentMessages`. Same path realtime echoes take — id-based dedup makes late-arriving realtime echoes of an SSE message a no-op. User turn is optimistically written with a client-minted `crypto.randomUUID()`; the server persists the user turn before streaming but does **not** echo it on SSE, so no dup. Errors: 401 → `logout()` + toast; 409 `AGENT_BUSY` → dedicated toast, no auto-retry; abort via `stop()` → silent. Uses raw `fetch` not `hono/client` because the RPC client buffers — streaming needs a reader.
- **`src/realtime/useProjectStream.ts`** — the internal `applyEvent` helper is now exported as `applyAgentEvent` so both consumers (realtime subscription, `useAgentChat`) import the same function. Step 13 in the plan lifts it to its own module; the rename anticipates the move. Behaviour unchanged — bit-identical cache writes from SSE and realtime paths, preserving the Phase-6 applier invariant.
- **`src/components/project/ChatPane.tsx`** — transcript reads `ProjectDetail.recentMessages`. User bubbles: right-aligned, `whitespace-pre-wrap`, no markdown (users typing `*asterisks*` shouldn't render). Assistant bubbles: `ReactMarkdown` + `remarkGfm` with `prose prose-sm dark:prose-invert`. Autoscroll-while-pinned — flips off when user scrolls up to re-read. Input is a `<textarea>` with `Cmd/Ctrl+Enter` to send (Enter = newline); draft clears before awaiting the fetch so the user can start the next turn immediately. `status === 'streaming'` renders a muted `Thinking…` line — more honest than a phantom per-token cursor, since message events are flush-on-boundary.

Tool-call accordion UI (`🛠 add_canvas_block {…}`) is deferred to Step 12 / Step 14 polish — `tool-call` events pass through `applyAgentEvent` as a cache no-op today.

### Verification

```
pnpm typecheck      ✔  9/9 workspaces clean
pnpm lint           ✔  clean
pnpm format:check   ✔  clean
pnpm test           ✔  167 tests (unchanged since 0.7.1)
pnpm --filter @brandfactory/web build  ✔  dist/ clean
```

### Items deferred from Steps 7–11

- **Canvas block renderers** — Step 12 scope; `CanvasPane` shows `{visible.length} block(s)` summaries today.
- **Tool-call accordion UI** in chat — Step 12 / Step 14 polish.
- **`useAgentChat` + `sseParser` unit tests** — Step 15 alongside the rest of the frontend vitest suite.
- **Split-screen width persistence** — re-evaluate after Phase 7.
- **Route-loader prefetch** of `ProjectDetail` — hook-in-component is simpler and identical in behaviour once `QueryClient` is primed; plan mentions it as a future refinement.

---

## 0.7.2 — 2026-04-20

Phase 7 Steps 3–6 — the app shell: URL surface, auth, typed API, realtime. Still no user-facing screens (those land in 0.7.3) but every primitive a screen needs is in place. Test count unchanged at 167 (realtime + hook coverage is Step 15's responsibility). Full step-by-step notes in `docs/completions/phase7-step-{3,4,5,6}.md`.

### Step 3 — TanStack Router + route skeletons

`@tanstack/react-router` installed; all seven URL surfaces (`/`, `/login`, `/workspaces`, `/workspaces/$wsId`, `/workspaces/$wsId/settings`, `/brands/$brandId`, `/projects/$projectId`) declared as placeholder routes. Flat tree — every route is a direct child of `rootRoute`; no nested `/workspaces/*` layout because no sub-layout is shared. `declare module '@tanstack/react-router' { interface Register { router: typeof router } }` registers the router type for ambient `<Link>` / `useParams()` / `router.navigate` type safety with no generated files. **Code-based, not file-based** — file-based via `@tanstack/router-plugin/vite` generates `routeTree.gen.ts` on first `vite` run, so `pnpm typecheck` would fail without running the dev server first. Migration is mechanical and deferred. `__root.tsx` renders a 48 px top bar + `<Outlet />` + `<Toaster />` (mounted once at root, route components call `toast()` imperatively). Auth guard per route: `beforeLoad` throws `redirect({ to: '/login' })` if `getAuthToken() === null`, or `redirect({ to: '/workspaces' })` for the login page when already authed.

### Step 4 — Auth shell

New deps: `zustand`, `@supabase/supabase-js`. `src/auth/store.ts` replaces the Step-3 stub with a Zustand store — `token` initialises from `sessionStorage['bf_token']` (survives refresh), `userId` starts `null` and is populated by `AuthBoundary` on boot. `getAuthToken()` reads `useAuthStore.getState().token` synchronously — safe to call in `beforeLoad` and the API client's 401 interceptor without leaking React context. `src/auth/AuthBoundary.tsx` wraps `<Outlet />` in the root layout: on mount, if a token is present, validates it against `GET /me`; on 200 sets `userId`, on non-200 calls `logout()` + `navigate({ to: '/login' })`, on network error treats as transient and lets the user proceed. Lazy `useState` initializer reads `getState().token` once at component creation — React 19's `react-hooks/refs` rule prohibits `.current` access during render.

Two providers under `src/auth/providers/`:

- **`local.tsx`** — dev-token prompt. `fetch('/api/me')` with typed bearer; on 200, `setAuth(token, data.id)` + navigate.
- **`supabase.tsx`** — magic-link. `createClient(url, key)` guarded so the module is safe to import without env vars. `onAuthStateChange('SIGNED_IN')` listener validates the Supabase access token against `GET /me` (server's Supabase adapter verifies the JWT). `signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`.

`login.tsx` picks the provider from `import.meta.env.VITE_AUTH_PROVIDER` (defaults to `local`); Vite tree-shakes the unused provider in prod builds. `vite-env.d.ts` types all `VITE_*` env vars as `string | undefined`.

### Step 5 — Typed API client (`hono/client`) + React Query

New deps: `@tanstack/react-query`, `hono`. `@brandfactory/server` added to **devDependencies** (type-only `import type { AppType }`) — Vite erases the import from the bundle. `src/api/client.ts` exports:

- **`AppError`** — `{ code, status, message }`, thrown by `callJson<T>(res)` on any non-2xx. Downstream `catch (e) if (e instanceof AppError)` unlocks code-specific handling (e.g. `AGENT_BUSY`).
- **`callJson<T>(res)`** — parses `{ code, message }` on error, falls back to `statusText`/`'UNKNOWN'`. **401 side effect:** calls `useAuthStore.getState().logout()` before throwing, so the store clears immediately; the router's `beforeLoad` redirects on the next navigation.
- **`api`** — `hc<AppType>(import.meta.env.VITE_API_BASE_URL ?? '/api', { headers: () => token ? { authorization: Bearer } : {} })`. Callback reads `getAuthToken()` per-call — no re-creation after login/logout.
- **`queryClient`** — `staleTime: 30s`; retry skips 4xx (no retries on user/auth errors), allows 2 retries on 5xx/network.

Query hooks in `src/api/queries/` — one file per domain, each exports a `*Keys` factory + `useFoo()` hooks wrapping `callJson<T>` on the typed hono response. `useProjectDetail` is the primary loader for the split-screen; it returns the widened `ProjectDetail` (project + canvas + blocks + shortlist + recentMessages + brand) in one round-trip. `useProjectBlocks` / `useProjectMessages` share keys with `useProjectDetail`'s sub-arrays via `projectKeys.blocks(id)` / `projectKeys.messages(id)` so `applyAgentEvent` can invalidate per-slice.

**Cross-environment `blobs.ts` fix** — `@brandfactory/server`'s type import pulls `routes/blobs.ts` into web's TypeScript (`lib: ["DOM"]`), where `new Response(bytes, ...)` needed `Uint8Array<ArrayBuffer>` not `Uint8Array<ArrayBufferLike>`. Cast is a no-op at runtime, satisfies both server (`lib: ["ES2022"]`) and web contexts.

### Step 6 — Realtime client + hooks

`src/realtime/client.ts` — singleton `RealtimeClient` with **ref-counted channel subscriptions over one WebSocket**. State machine: `idle → connecting → open ↔ reconnecting`. Socket opens on first `subscribe()` call, closes when the last handler unmounts. Multiple components on the same project share a single channel subscription; ref-counting (per-handler, not per-channel) prevents the last unsubscriber from tearing down what other mounted components still need.

- **Reconnect:** exponential backoff starting at 1 s, doubling, capped at 30 s; resets to 1 s on successful `onOpen`. `onClose` is the canonical reconnect trigger — no `error` listener (WS errors always fire immediately before `close` and carry no useful data).
- **Resync notification:** `onResynced(handler)` fires on every reconnect *after* the first (`connectionCount > 1`). `useProjectStream` uses this to invalidate `projectKeys.detail` — covers mutations that arrived while disconnected. Initial connection is skipped to avoid spurious invalidation at mount.
- **Payload validation:** raw frames go through `RealtimeServerMessageSchema.safeParse`; invalid frames silently dropped. Narrow trust boundary.
- **WS URL:** `toWsUrl()` handles relative (`/rt` → `ws(s)://host/rt`) and absolute (`http→ws`, `https→wss`). Token appended as `?token=<jwt>` — matches the server's `?token` fallback in `ws.ts` (browser `WebSocket` can't send `Authorization` headers).

`useRealtime(channel, handler)` is a thin `useEffect` wrapper returning the unsubscribe cleanup; callers memoize the handler (the hook documents this). `useProjectStream(projectId)` subscribes to `project:<projectId>` and runs an internal `applyEvent(qc, projectId, event)` dispatcher over the `AgentEvent` union:

| Event | Cache action |
|-------|--------------|
| `canvas-op/add-block` | Append (dedupe by `block.id`) to `projectKeys.detail` + `projectKeys.blocks` |
| `canvas-op/update-block` | Spread `op.patch` onto matching block in both caches |
| `canvas-op/remove-block` | Filter out `op.blockId` from both caches |
| `pin-op/pin` \| `unpin` | Flip `isPinned`; add/remove from `shortlistBlockIds` in `detail` |
| `message` | Append (dedupe by `message.id`) to `recentMessages` |
| `tool-call` | No-op (chat-pane render only) |

`applyEvent` was renamed to `applyAgentEvent` and exported in Step 11 so `useAgentChat` can reuse the exact same cache writes; see 0.7.3.

### Items deferred from Steps 3–6

- **File-based route generation** (`routeTree.gen.ts`) — migrate when route surface stabilises.
- **Route loaders + `pendingComponent`** — prefetch hooks and loading skeletons are Steps 5/14 scope.
- **Supabase token rotation** — mid-session rotations use the old token until next WS reconnect; fix is listening to `useAuthStore` and forcing reconnect on token change.
- **Centralized mutation hooks** — mutations are inline in the consuming routes (Steps 7–12) today; promoting them to `queries/` is optional polish.
- **Router context injection** of `queryClient` — SPA-only target doesn't need SSR-safe loader context.
- **Multi-tab logout** — `sessionStorage` is per-tab; a `localStorage` `storage` event listener would propagate; deferred.

---

## 0.7.1 — 2026-04-20

Phase 7 Steps 0–2 — front-loaded server surface + the Vite/React/shadcn scaffold. Step 0 is the largest backend touch in Phase 7 and comes before any React code so the frontend has a stable HTTP contract to typecheck against. Test count 140 → 167 (+27), all in new server route tests. `pnpm --filter @brandfactory/web build` produces `dist/` clean. Typecheck/lint/format clean across 9 workspaces. Full step-by-step notes in `docs/completions/phase7-steps-0-2.md`.

### Step 0 — Close the server gaps the frontend needs

Four read endpoints, five user canvas-op endpoints, two authed blob signed-URL endpoints.

**Step 0.1 — Reads.** `GET /projects/:id/canvas/blocks` → `CanvasBlock[]` (thin wrapper over `listActiveBlocks`). `GET /projects/:id/shortlist` → `{ blockIds }`. `GET /projects/:id/messages[?limit]` → oldest-first `AgentMessage[]` (limit Zod-coerced, capped at 200, defaults to 40). And **`GET /projects/:id` widened to `ProjectDetail`** — four parallel reads via `Promise.all` after loading the canvas returning `Project & { canvas, blocks, shortlistBlockIds, recentMessages, brand }`. The shape lives in `packages/shared/src/project/detail.ts` and uses `z.intersection(ProjectSchema, z.object({...}))` — not `.extend()` — because `ProjectSchema` is a `z.discriminatedUnion` and discriminated unions don't expose `.extend()`.

**Step 0.2 — User canvas-ops.** All five mutating routes in `packages/server/src/routes/canvas.ts`, each following the same **DB write → event log append → realtime publish** invariant the agent applier respects. Human and agent paths produce bit-identical realtime events so sibling clients can't distinguish them. Shared helpers: `emitCanvasOp`, `emitPinOp`, `requireBlock` (fetch by id + throw 404 if missing / wrong canvas / soft-deleted — prevents mutations leaking across project boundaries).

- **`POST /projects/:id/canvas/blocks`** — body is a `z.discriminatedUnion('kind', …)` over `text`/`image`/`file`. If `position` omitted, server computes `max(existing) + 1000`. The `+1000` strategy (not `Date.now()`) matters because `canvas_blocks.position` is `integer` (32-bit); `Date.now()` would overflow.
- **`PATCH /projects/:id/canvas/blocks/:blockId`** — flat partial schema (`position?`, `body?`, `alt?`, `width?`, `height?`). Ownership checked via `requireBlock`.
- **`POST .../pin`** and **`POST .../unpin`** → `setPinned(id, true|false)` + `emitPinOp`.
- **`DELETE .../blockId`** → soft-delete (`deleted_at = now()`), `204 No Content`. Restore UI deferred.

New facade helpers: `getBlockById` added to `@brandfactory/db` (5 lines) + wired into `packages/server/src/db.ts` for O(1) ownership verification in `requireBlock`. `updateBlock` and `softDeleteBlock` also exposed on the facade (they existed in `@brandfactory/db` but weren't wired into the server yet).

**Step 0.3 — Blob signed-URL mints.** Both under `/blob-urls/*` with auth middleware applied at that prefix; the existing `/blobs/*` prefix stays auth-free because the signed URL *is* the capability — splitting prefixes avoids a negative-lookahead exception in the auth config.

- **`POST /blob-urls/upload-url`** — validates `contentType` against `ALLOWED_UPLOAD_MIMES` (jpeg/png/gif/webp/svg/pdf/docx/txt, defined as a `const` tuple in `packages/shared/src/blob/upload.ts`), checks `size <= BLOB_MAX_BYTES` (25 MiB, 413 on overflow matching `/blobs`). Key format `uploads/<yyyy>/<mm>/<uuid>-<safe-filename>` — year/month prefix is time-indexable, UUID prevents guessing. 400 `INVALID_CONTENT_TYPE` on bad mime. 5-min TTL.
- **`GET /blob-urls/:key{.+}/read-url`** — Hono regex path syntax `/:key{.+}` captures multi-segment keys (needed because keys contain slashes). Auth is sufficient access control for v1 single-seat self-hosted; cross-workspace blob authz flagged for later.

**Tests (+27):** `routes/canvas.test.ts` (16 cases — 401/404 per route, happy path + realtime assertion, position auto-computation, soft-delete idempotency), `routes/messages.test.ts` (5), `routes/blobs-auth.test.ts` (6).

### Step 1 — Vite + React 19 scaffold

`pnpm --filter @brandfactory/web dev` boots on `:5173`; `pnpm --filter @brandfactory/web build` produces `dist/`. Three concerns in `vite.config.ts`: `@vitejs/plugin-react`, `@/` path alias mirrored in `tsconfig.json`, dev proxy (`/api` → `http://localhost:3001` with prefix strip, `/rt` → `ws://localhost:3001/rt` with `ws: true`). `tsconfig.json` gains `"jsx": "react-jsx"` (automatic transform — no `import React` in components) and `"paths": { "@/*": ["./src/*"] }`. ESLint: three new plugins (`eslint-plugin-react`, `-react-hooks`, `-jsx-a11y`) scoped to `packages/web/src/**` via a dedicated block in root `eslint.config.js`; `react/react-in-jsx-scope` and `react/prop-types` disabled (irrelevant under automatic JSX transform + TypeScript). `packages/web/vitest.config.ts` stands up the jsdom environment and is added to the root projects array — the root config's "per-package configs widen the environment when `web` lands" comment is now honoured. New deps: `react@^19`, `react-dom@^19`, `@vitejs/plugin-react`, `vite`, `@types/react`, `@types/react-dom`.

### Step 2 — Tailwind v4 + shadcn/ui primitives

**Decision: Tailwind v4 via `@tailwindcss/vite`, not v3 + PostCSS** — v4 is stable, the Vite plugin integrates directly into the bundler pipeline, no `postcss.config.js` to maintain. `src/index.css` uses v4 syntax: `@import 'tailwindcss'`, `@plugin 'tailwindcss-animate'`, `@custom-variant dark (&:is(.dark *))` for class-based dark mode, `@theme inline { --color-*: var(--*) }` to map CSS variables into Tailwind's utility namespace without a `tailwind.config.js`. Colour palette is oklch-based slate (matches shadcn's "default" theme); single accent is slate; polish later.

Seven shadcn primitives at `@/components/ui/*`: `button`, `input`, `label`, `card`, `select`, `dialog`, `sonner`. Function-style declarations (no `React.forwardRef` — React 19 passes refs as props on standard elements; Radix primitives handle their own ref forwarding). `data-slot="*"` styling hooks. `sonner.tsx` overrides the Toaster's CSS variables so toast theming tracks the shared palette. `components.json` declares `tailwind.config: ""` (v4 has no config file) so `pnpm dlx shadcn@latest add <component>` calls from within `packages/web` work without re-init. New deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, four Radix primitives; devDeps: `tailwindcss`, `@tailwindcss/vite`, `tailwindcss-animate`. Prod bundle: CSS ~24 kB (~5 kB gz), JS ~190 kB (React 19 + Radix).

### Items deferred from Steps 0–2

- **Optimistic canvas mutations** — every user canvas-op round-trips today. Acceptable for debounced typing; visible latency for pin toggles. Post-Phase-7 hardening.
- **Canvas block restore UI** — soft-delete is server-side only; no trash view.
- **Cross-workspace blob read authz** — `/blob-urls/:key/read-url` mints for any authed user; scope when >1 seat exists.
- **Frontend unit tests for Steps 1–2** — scaffold + CSS setup have no testable logic units; Step 15 covers components.

---

## 0.7.0 — 2026-04-19

Phase 6 lands the first end-to-end streaming agent call. `POST /projects/:id/agent` returns an SSE stream of `AgentEvent`s; canvas mutations the model issues via Phase-5's `add_canvas_block` / `pin_block` / `unpin_block` tools are persisted via `@brandfactory/db`, broadcast on the realtime bus, and visible on a subsequent `GET /projects/:id`. User and assistant messages are persisted in a new `agent_messages` table so the next turn carries history. The phase touches three packages — `@brandfactory/db` adds one table + queries, `@brandfactory/shared` adds one wire schema, `@brandfactory/server` lands the route plus three new building blocks (applier, concurrency guard, SSE helper). `pnpm test` grew from 120 (0.6.1) to 140 (+20). Typecheck, lint, format clean across 9 workspaces. No new peer-dep warnings beyond the pre-existing zod v4 vs AI-SDK v3 ones.

### Step 1 — `agent_messages` table + queries in `@brandfactory/db`

Third event-shaped table after `canvas_events` and `workspace_settings`. Stores the per-turn user/assistant transcript so context survives across HTTP requests; the next turn's `streamText` call needs the prior messages.

- **`packages/db/src/schema/agent_messages.ts`** — new `agent_message_role` `pgEnum('user' | 'assistant')` and `agent_messages(id uuid pk, project_id uuid fk projects.id ON DELETE cascade, role enum, content text, user_id uuid fk users.id ON DELETE set null, created_at timestamptz default now())`. One index: `agent_messages_project_created_idx (project_id, created_at)` — every read is "last N for project in insert order".
- **Why a new table, not `canvas_events`.** Canvas events model *canvas mutations*. An assistant reply with no tool calls produces no canvas event; reusing that table would mean either mixing semantics or losing rows. Kept separate.
- **`content` as `text`, not `jsonb`.** v1 `AgentMessage.content` is a plain string in `@brandfactory/shared`. If we later carry reasoning / citations / mixed parts, migrate to `jsonb` then — no speculative columns today.
- **`user_id` nullable + `set null` on delete.** Assistant rows have no human author; user rows survive account deletion as historical record. Same pattern as `canvas_events.user_id`.
- **`packages/db/drizzle/0002_oval_pet_avengers.sql`** — generated via `pnpm --filter @brandfactory/db db:generate` (drizzle-kit doesn't need a live DB for `generate`). `CREATE TYPE`, `CREATE TABLE`, two `ALTER TABLE` FK additions, one `CREATE INDEX`. Snapshot `meta/0002_snapshot.json` updated; `meta/_journal.json` extended.
- **`packages/db/src/queries/agent-messages.ts`** — two helpers, both keyed on `ProjectId`:
  - `appendAgentMessage({ projectId, role, content, userId? })` — single insert, returns the mapped `AgentMessage`.
  - `listAgentMessages(projectId, opts?)` — defaults `limit: 40`, returns oldest-first. Implementation: subquery `SELECT … WHERE project_id = ? ORDER BY created_at DESC LIMIT N` aliased as `latest`, outer `SELECT * FROM latest ORDER BY created_at ASC`. We need the latest N rows but `streamText` expects them chronologically — trim then reverse rather than fetch-all-then-slice.
- **`packages/db/src/mappers.ts`** — `rowToAgentMessage(row)` returns `{ kind: 'message', id, role, content }`. Drops `createdAt` and `userId` because the wire `AgentMessage` type carries neither. No `safeParse` — `content` is plain text and can't be malformed the way `ProseMirrorDoc` JSON can.
- **`packages/db/src/schema/index.ts`** / **`src/index.ts`** — re-export the new module / queries.
- **`packages/db/src/mappers.test.ts`** — +1 happy-path case for `rowToAgentMessage`. Live-DB integration tests for the queries deferred (same call as 0.6.1 — no Postgres harness in the package; the smoke script + route tests cover the path indirectly).

### Step 2 — `Db` facade widening

`packages/server/src/db.ts` now exposes seven additional helpers — canvas blocks/events: `listActiveBlocks`, `createBlock`, `setPinned`, `getShortlistView`, `appendCanvasEvent`; agent messages: `listAgentMessages`, `appendAgentMessage`. Same one-line-per-helper pattern as the existing entries, typed via `typeof db.helperName` so a signature change in `@brandfactory/db` surfaces here as a TS error, not at runtime.

`packages/server/src/test-helpers.ts` grows in-memory fakes for all seven. `FakeDbState` gets three new fields — `canvasBlocks: Map`, `canvasEvents: FakeCanvasEventRow[]`, `agentMessages: FakeAgentMessageRow[]` — so route tests can assert on persisted rows without touching a database. Existing fakes unchanged; tests that don't use the new helpers don't pay anything.

### Step 3 — `createDbRealtimeApplier` (the side-effect seam)

`packages/server/src/agent/applier.ts` implements the agent's `CanvasOpApplier` interface (`addCanvasBlock` / `pinBlock` / `unpinBlock`) — the seam Phase 5's `streamResponse` injects through.

Each method: **DB write** (`createBlock` for add, `setPinned(true|false)` for pin/unpin — atomic by `@brandfactory/db`) → **event log append** (`appendCanvasEvent` with `actor: 'agent'`, `userId: <human triggering the turn>`) → **realtime publish** to `project:<projectId>` with the right event envelope (`{ kind: 'canvas-op', op: { op: 'add-block', block } }` or the pin/unpin variants).

- **DB write → event → publish, not the reverse.** A failed publish leaves a persisted mutation that a refetching client will observe — strictly better than a phantom realtime event for a mutation that never landed. The two failure modes diverge in the right direction for self-hosted operations.
- **No transaction across the three.** The event log is append-only and replay-safe by design. A missing event for an existing block is no worse than today's un-logged user writes — also un-wrapped. If we ever promote the event log to the source of truth, revisit.
- **`userId` is the *human* who triggered the turn, not the agent.** Surfaced via `appendCanvasEvent.userId` so the audit trail stays readable even when `actor: 'agent'`. The applier closes over `userId` once at construction.
- **`packages/server/src/agent/applier.test.ts`** — 5 cases against the in-memory fake `Db` and a capturing fake `RealtimeBus`: (1) `addCanvasBlock` writes a `text` block with `createdBy: 'agent'`, appends `add_block` event, publishes `canvas-op` on `project:<id>`; (2) `pinBlock` flips `isPinned: true`, appends `pin` event, publishes `pin-op`; (3) `unpinBlock` mirrors with `op: 'unpin'`; (4) **ordering invariant** — if `createBlock` throws, no realtime publish happens; (5) the applier identifies the canvas via the closed-over `deps.canvasId`, not anything from the input.

### Step 4 — In-memory per-project concurrency guard

`packages/server/src/agent/concurrency.ts`. Tiny: a `Set<ProjectId>` plus an `acquire(projectId)` that returns `{ release } | null` and an idempotent `release()`. Built once in `main.ts`, threaded through `AppDeps.agentGuard`.

- **One concurrent turn per project, not per user.** Two browser tabs on the same project would otherwise race the same canvas. User-level rate-limiting is a separate concern for later.
- **Process-local.** Fine for self-hosted v1. A horizontally-scaled deploy needs a Postgres advisory lock keyed on `hashtext(project_id)` — flagged for the post-Phase-6 hardening list.
- **No queue / wait.** Explicit 409 over hidden delays. The frontend can surface "another turn is running" without guessing latency.
- **Idempotent release.** A double-release won't free a different project's slot. Important because the route's pre-stream catch path *and* the SSE `onClose` both call `release()` — the SSE path is the canonical owner once the stream starts, but the catch path stays as a safety net for failures before the stream begins.
- **`packages/server/src/agent/concurrency.test.ts`** — 3 cases: acquire+release allows a follow-up acquire; double acquire returns `null`; double release is harmless.

### Step 5 — SSE wire format

`packages/server/src/agent/sse.ts`. Converts `AsyncIterable<AgentEvent>` → SSE `Response` compatible with Vercel AI SDK UI's `useChat`.

Frame format:

```
event: <kind>
data: <JSON-encoded AgentEvent>

```

Per-event frames terminated by `\n\n`. After the iterable completes, a synthetic `event: done\ndata: {}\n\n` terminator so clients can stop listening deterministically. On thrown errors, an `event: error` frame with `{ message }` precedes `done`. Periodic `: keep-alive\n\n` ping comments every 15 s (configurable via `keepAliveMs` for tests).

Subtleties addressed:

- **`onClose` instead of `finally` on the handler.** Hono returns the `Response` to `@hono/node-server`, which then keeps writing the body. A `finally` on the handler fires when the Response is constructed, *not* when the stream ends. Releasing the concurrency guard or persisting the assistant message there would race the second request and lose tokens. Fix: `streamResponseToSse` accepts an `onClose` callback fired in the `ReadableStream`'s own `finally` block, after the iteration loop closes. The route passes a callback that releases the slot and persists assistant text.
- **`signal.aborted` mid-loop.** When `c.req.raw.signal` aborts (client disconnect), the for-await loop breaks before the next enqueue. The underlying `streamText` already gets the same signal so token generation stops too. The SSE helper's job is to stop *enqueueing* and let `onClose` run normally.
- **Persistence hook (`onEvent`) fires before serialization.** That's what lets the route accumulate assistant text from `message` events as they arrive, then persist once on close. A mid-stream failure still persists whatever was accumulated — explicit policy: partial assistant content is more useful to the user than nothing.
- **No JSON re-validation on the wire.** `streamResponse` already emits typed events; re-parsing them would be paranoia.
- **`ping.unref()` when supported.** Test harnesses spin up many short-lived streams with fast keep-alives; an active interval would block process exit. `unref()` is no-op-safe in environments that don't support it.
- **`packages/server/src/agent/sse.test.ts`** — 4 cases: frame format (`event: <kind>` + JSON `data:` + trailing `done`); `onEvent` and `onClose` callbacks invoked the expected number of times; iterable error → `event: error` followed by `done`; abort signal mid-stream stops enqueueing.

### Step 6 — `POST /projects/:id/agent` route

`packages/server/src/routes/agent.ts`. Handler pipeline:

1. **Auth gate** — `c.var.userId` from the existing auth middleware (`UnauthorizedError` if missing).
2. **Param + body validation** — `zValidator('param', ProjectParam)` and `zValidator('json', PostAgentBodySchema)`.
3. **Authz + load** — `requireProjectAccess(rawUserId, projectId, deps.db)` returns `{ project, brand, workspace }`. 404 / 403 land via the existing error middleware.
4. **Concurrency acquire** — `agentGuard.acquire(project.id)`. If `null`, throw `ConflictError('another turn is running on this project', 'AGENT_BUSY')` → HTTP 409.
5. **Resolve LLM settings** — `resolveLLMSettings(workspace.id, env, db)` (existing helper) merges workspace override with env defaults.
6. **Load context in parallel** — `Promise.all([listActiveBlocks, getShortlistView, listSectionsByBrand, listAgentMessages])`. Canvas is fetched first (single round-trip) and a missing canvas is treated as a data-integrity bug (logged + 404 `CANVAS_NOT_FOUND`); in normal operation it can't happen because `createProjectWithCanvas` enforces the 1:1.
7. **Persist user turn before streaming** — so a reconnecting client immediately sees the new message in `listAgentMessages`. The id is server-minted; we ignore `body.message.id` in v1 (Phase 7's frontend can re-key on response).
8. **Build applier**, call `streamResponse({ brand, blocks, shortlistBlockIds, messages: [...history, userMessage], llmProvider, llmSettings, applier, signal: c.req.raw.signal })`.
9. **Return SSE response** with hooks:
   - `onEvent` accumulates `message` (assistant) text. It also fans `message` and `tool-call` events onto the realtime bus on `project:<id>` so sibling clients see typing without waiting for the turn to finish. (Canvas-op and pin-op already fan out from inside the applier — duplicating them here would publish twice.)
   - `onClose` persists the joined assistant content if non-empty (mid-stream failure → partial content still persisted), then releases the slot. Wrapped so a persistence failure can't prevent slot release.
10. **Pre-stream failure path** — `try { … return streamResponseToSse({…}) } catch { slot.release(); throw }`. The SSE helper owns the slot once streaming begins; the catch only releases for failures *before* the stream starts (resolve, canvas load, user-message persist).

Wired in:

- **`packages/server/src/app.ts`** — `AppDeps.agentGuard: AgentConcurrencyGuard`. Mount `createAgentRouter({...})` under `/projects` alongside `createProjectsRouter` (both match `/:id/...`, no conflict because the route paths differ).
- **`packages/server/src/main.ts`** — `const agentGuard = createAgentConcurrencyGuard()` constructed once at boot, threaded into `createApp`.
- **`packages/server/src/test-helpers.ts`** — `createTestApp` accepts optional `llm`, `realtime`, `agentGuard` overrides; defaults build a fresh guard so independent tests don't share state.

Error taxonomy: **`packages/server/src/errors.ts`** gains `ConflictError(message, code)` → HTTP 409. The error middleware's status union widens to include 409. `code` defaults to `'CONFLICT'`; the route uses `'AGENT_BUSY'`.

### Step 7 — Route tests

`packages/server/src/routes/agent.test.ts` — 7 cases, all in-memory: fake `LanguageModel` (via `agent/test-fakes.ts`), fake `RealtimeBus`, the existing fake `Db`. No network, no Postgres.

- **`packages/server/src/agent/test-fakes.ts`** — exports `fakeModel(parts)` and `makeAsyncModel(genFn)`. Both build a `LanguageModelV1` with the minimum surface `streamText` reads (`specificationVersion`, provider/model metadata, `doStream`); `fakeModel` enqueues a fixed array of stream parts, `makeAsyncModel` adapts an async generator into a `ReadableStream` via `pull()`-async so a generator can `await` mid-yield. The async variant is what the concurrency-race test uses to hold the first turn open while the second request comes in. Almost identical to `packages/agent/src/stream.test.ts`'s helpers but lives in the server package — ~50 lines of duplication beat carving out a public test-support surface from `@brandfactory/agent` for a single consumer (re-evaluate if a third place wants the fakes).
- **Cases:** (1) 401 without auth; (2) 404 when project doesn't exist (id uses a valid UUID-v4 that's just not in the fake state); (3) happy path plain text stream — 200, `content-type: text/event-stream; charset=utf-8`, body contains `event: message` and the joined content, ends with `event: done`, `agent_messages` has one user row and one assistant row in order; (4) happy path with `add_canvas_block` — a `text` block with `createdBy: 'agent'` was created, a `canvas_events` row with `op: 'add_block'` actor `'agent'` was appended, the realtime bus saw a `canvas-op` publish on `project:<id>`, the SSE body contains both `event: tool-call` and `event: canvas-op` frames; (5) concurrency 409 — first request uses `makeAsyncModel` that yields one delta then awaits a manual release promise, after 10 ms the second request races → 409 `AGENT_BUSY`, release the deferred, drain the first stream, third request succeeds; (6) stream error — `error` part → SSE body contains `event: error` and the upstream message, only the user row was persisted (empty content dropped); (7) env LLM fallback — workspace has no settings row, `getModel` is invoked with `{ providerId: 'anthropic', modelId: 'claude-sonnet-4-6' }` from `testEnv`.

### Step 8 — `PostAgentBody` schema in shared

`packages/shared/src/agent/api.ts`:

```ts
export const PostAgentBodySchema = z.object({
  message: z.object({
    id: z.string().min(1).optional(),
    content: z.string().min(1).max(8_000),
  }),
})
```

Re-exported from the shared barrel so Phase 7's frontend can reuse the exact parser. The id is optional (server mints if absent — see Step 6 §7); the 8 000-char ceiling is a sanity bound, not a token budget. Token / context-window trimming explicitly deferred (see non-goals).

### Step 9 — Smoke script

`packages/server/scripts/smoke-agent.ts`. Boots the real Hono app against dev Postgres, seeds a workspace/brand/project (with a prior turn so the history-load path is exercised), fires `POST /projects/:id/agent` via `app.request`, parses the SSE stream frame-by-frame, then `GET /projects/:id` to confirm the canvas mutation persisted. Exits 0 on success, 1 on any step failure, 2 if the run completed but the model never tool-used (signal: model issue, not server bug).

Gated on `OPENROUTER_API_KEY` + `DATABASE_URL` — both missing → exit 1 with a clear message before any work happens. Defaults `LLM_PROVIDER=openrouter`, `LLM_MODEL=anthropic/claude-3.5-sonnet` (matching `@brandfactory/agent/scripts/smoke.ts`), and the dev-mode auth / storage / realtime providers, so a fresh checkout only needs the two real-resource env vars set.

**`packages/server/tsconfig.json`** widened to `include: ['src/**/*.ts', 'scripts/**/*.ts']` (and `rootDir` dropped — same change `@brandfactory/agent` made in Phase 5) so the script participates in the type-aware lint pass. New script: `pnpm --filter @brandfactory/server smoke-agent`.

### Items deferred to the post-Phase-6 hardening pass

Surfaced during the build, intentionally out of scope for this phase. Same cadence as 0.4.1 / 0.5.1 / 0.6.1.

- **Advisory-lock concurrency guard** for horizontally-scaled deploys (Postgres `pg_try_advisory_lock(hashtext(project_id))`).
- **Assistant-message atomic-with-canvas-ops persistence.** Today the applier writes canvas blocks in their own transactions and the assistant message lands on stream close; a crash between them leaves inconsistent state. Candidate fix: buffer canvas ops, commit all in one tx with the assistant message — blocked on streaming-vs-atomic tradeoff discussion.
- **Client-disconnect-mid-stream integration test.** The SSE-unit abort case exists; a route-level abort test that asserts slot release + partial assistant persistence does not. Low risk (components individually tested), worth adding.
- **Token redaction in request logs.** `PostAgentBody.content` can carry secrets pasted by the user. Part of the Phase-8 pino swap.
- **Per-user rate limit** distinct from per-project concurrency. Once we have >1 seat per workspace.
- **Live-DB vitest for `agent_messages` queries.** Same pattern as the deferred integration suite from 0.6.1.
- **`projects.template_id` CHECK constraint** still pending from 0.6.1; rides with the next planned migration.

### Items explicitly out of scope (reaffirmed)

From the plan's non-goals:

- Image / file canvas tool variants (need a blob-upload flow first).
- Client-side consumption (`useChat`, TipTap apply) — Phase 7.
- Token budgeting / context-window trimming — `CANVAS_CONTEXT_UNPINNED_LIMIT` and the 40-message history cap are crude but sufficient for v1.
- Reasoning / source / file stream parts — `streamResponse` already ignores them and the route does nothing extra.

### Verification

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
- **Total: +20 (120 → 140).**

---

## 0.6.1 — 2026-04-19

Hardening pass surfaced by a repo-wide review after Phase 5 landed, sized to close the gaps Phase 6's `POST /projects/:id/agent` route would otherwise trip over. Five items: one HIGH (long-lived WS connection leak), three MEDIUM (storage clock skew, JSON trust boundary on DB reads, `@brandfactory/db` had zero vitest coverage), one LOW polish (server error log missed `userId`). No new feature surface. `pnpm test` grew from 106 (0.6.0) to 120 (+14: +12 mapper unit tests in `@brandfactory/db`, +1 realtime zombie-socket test, +1 storage clock-skew test); typecheck, lint, format clean across 9 workspaces.

### HIGH — realtime WS heartbeat (zombie socket sweep)

`@brandfactory/adapter-realtime`'s native-ws bus had no heartbeat, ping/pong, or connection timeout. A client that vanishes without sending a close frame (tab suspended, laptop lid closed, network drop, mobile app killed) leaves the socket half-open on the server: `socket.send(...)` succeeds into a dead TCP buffer, the `close` handler never runs, and the subscription map holds the handler forever. Over a production deployment's uptime that's a memory leak and a silent event-delivery hole — and Phase 6 is exactly the workload that fans events to long-lived subscribers, so we fix it before the route lands.

- **`packages/adapters/realtime/src/native-ws.ts`** — `BindOptions` grows an optional `heartbeatIntervalMs` (default 30 000, matching common ws deployments). In `bindToNodeWebSocketServer`:
  - On each `'connection'`: tag the socket `isAlive = true`, attach a `'pong'` listener that re-tags it `true`.
  - A `setInterval(sweep, intervalMs)` iterates `wss.clients`: any socket with `isAlive === false` (i.e. didn't pong since the previous tick) gets `socket.terminate()`; the rest are flipped to `false` and sent a `socket.ping()`. Terminate forces the 'close' handler to run, which releases the socket's subscriptions via the existing unsubscribe map.
  - `heartbeat.unref()` so the interval doesn't block process shutdown, and `wss.on('close', () => clearInterval(heartbeat))` cleans up in test harnesses that spin up many ephemeral buses.
- **`packages/adapters/realtime/src/native-ws.test.ts`** — new `terminates zombie sockets…` case drives the sweep with `heartbeatIntervalMs: 40` and overrides the client's `pong` method to a no-op so `ws`'s auto-pong never actually writes bytes. The server sees no reply, terminates on the second tick, and the client observes the close event within the safety timeout. Harness extended to plumb the option through `startBus`.
- **Interval sizing.** 30 s is standard; halving it doubles the ping volume without meaningfully improving eviction latency. Kept configurable so Phase 6's production deployment (or ops folks tuning for mobile clients) can override without a code change.

### MEDIUM — storage clock-skew tolerance on `verifySignature`

`verifySignature` compared `exp >= now` with zero tolerance. A client a handful of seconds ahead of the server would get a spurious 403 on an otherwise-valid URL — operationally fragile in multi-host deploys without tight NTP. Not a security property loss: the signature itself is still HMAC-verified in constant time; the skew only widens the expiry check.

- **`packages/adapters/storage/src/local-disk.ts`** — exports new `CLOCK_SKEW_TOLERANCE_SECONDS = 10` and `VerifySignatureInput` grows an optional `clockSkewSeconds`. The expiry check becomes `input.exp + skew >= now` (still `Number.isFinite`-guarded so a nonsense exp can't exploit the tolerance). Timing-safe compare path unchanged: HMAC is computed and compared before the expiry decision, so the two failure modes remain indistinguishable via response timing.
- **`packages/adapters/storage/src/local-disk.test.ts`** — new `verify tolerates a client clock a few seconds ahead of exp` case asserts both sides: a `now` 5 s past exp passes (within tolerance), a `now` 15 s past exp throws (beyond it). The existing `verify rejects an expired signature` case updated to use `now - 30` so it's unambiguously outside the 10 s window.
- **`packages/server/src/routes/blobs.test.ts`** — mirroring update to the server's `expired signature → 403` case for the same reason.
- **Why 10 s.** Enough to absorb NTP drift and the typical network latency between signer and verifier; short enough that an attacker replaying a just-expired URL doesn't get a meaningful extension. Exposed as an input so deployments with unusually loose clock sync (or unusually strict requirements) can override per call.

### MEDIUM — `ProseMirrorDocSchema` parse on DB reads

`@brandfactory/db/src/mappers.ts` blind-cast `row.body as ProseMirrorDoc` in both `rowToGuidelineSection` and `rowToCanvasBlock`'s text arm. Writes are gated by zod at the route layer today, but Phase 6 adds a new writer — the agent's `add_canvas_block` tool — and a corrupted row (bad migration, direct-DB edit, historical data) would otherwise propagate silently into prompt assembly, canvas-op fan-out, or the wire DTO. Moving the parse into the mapper closes the trust boundary on reads too.

- **`packages/db/src/mappers.ts`** — imports shift to a value import of `ProseMirrorDocSchema` (keeping the type imports colocated via `type` in the mixed import list). New module-local `parseProseMirrorBody(body, rowId)` runs `safeParse` and throws `Row <id> has malformed ProseMirror body` on failure — a data-integrity bug worth failing loud on, consistent with the existing missing-field throws for image/file rows. `rowToGuidelineSection` and the text case of `rowToCanvasBlock` both call it.
- Consistent error shape: the existing `throw new Error(...)` messages on missing `blobKey` / `filename` / `mime` / `templateId` are the model, and the new check reads the same way. The server's `onError` middleware already catches these as unhandled → 500, which is the right surface for "the DB gave us something malformed." If Phase 6 ever wants a typed domain-error variant, the single call site is the hook.

### MEDIUM — `@brandfactory/db` vitest suite

Before this pass the package shipped `scripts/smoke.ts` (live-DB, manual) and zero `vitest` coverage. That was fine at Phase 2 when the schema was new and the query helpers were trivial, less fine now that mappers enforce invariants and Phase 6's applier will write through multiple transactional helpers. The mapper layer is pure (JSON in, domain object out) — ideal for fast unit tests that run on every `pnpm test` without needing Postgres.

- **`packages/db/package.json`** — adds `vitest ^2.1.8` devDep and a `test: vitest run` script, matching every other package.
- **`packages/db/vitest.config.ts`** — projects-mode entry, mirrors the adapters and agent packages so `pnpm --filter @brandfactory/db test` behaves identically to the root `pnpm test`.
- **Root `vitest.config.ts`** — `packages/db` appended to the `projects` list.
- **`packages/db/src/mappers.test.ts`** — 12 new cases, no database, all deterministic:
  - Happy paths for `rowToWorkspace`, `rowToBrand`, `rowToCanvas`, `rowToGuidelineSection`, `rowToProject` (both `freeform` and `standardized` variants), and `rowToCanvasBlock` (text and image with optional dims).
  - Data-integrity failures fail loud: `rowToGuidelineSection` and `rowToCanvasBlock(text)` throw on a malformed body (input is a `Map` to simulate a non-JSON serialized artifact); `rowToProject` throws on standardized + null `templateId`; `rowToCanvasBlock` throws on image without `blobKey` and file without `filename`.
- **Live-DB integration tests deferred** for this pass — the existing `scripts/smoke.ts` already walks the full lifecycle against real Postgres (users → workspace → brand → sections → project+canvas → blocks → events → shortlist → soft-delete → settings), and promoting it to a gated vitest suite is a mechanical refactor that can ride with Phase 6 where a live Postgres harness will already be in scope for the applier route tests.

### LOW — `userId` in the server's unhandled-error log context

`packages/server/src/middleware/error.ts:29` already logged `{ name, message, stack }` on an unhandled error, and the logger is bound with `requestId` on middleware entry — but `c.var.userId` was not propagated. That made tracing production incidents harder: `requestId` correlates across a single request, `userId` correlates across a session.

- **`packages/server/src/middleware/error.ts`** — reads `c.get('userId')` and spreads `{ userId }` into the log fields when defined (skipped cleanly on unauthenticated paths). One line-net change; no test required since the existing `error.test.ts` covers the unhandled path and the log is a diagnostic side effect.

### Deliberately deferred

Surfaced by the same review, kept out of scope for this pass by design:

- **`projects.template_id` CHECK constraint.** The mappers already throw on a standardized row with null `templateId` (defense-in-depth landed in Phase 5). A DB-level `CHECK (kind = 'freeform' OR template_id IS NOT NULL)` adds a second rail, but lands cleanest via a `drizzle-kit generate` round-trip against a live DB — not worth hand-authoring the migration + snapshot drift. Ride with the next planned migration.
- **Model-id whitelist in `@brandfactory/adapter-llm`.** Only load-bearing once runtime overrides from the settings route reach arbitrary strings; today the settings route validates against the shared `LLMProviderIdSchema` and the model id comes from the same trust boundary as the provider.
- **Brand name / description prompt-injection sanitation in `buildSystemPrompt`.** Real risk is low (a user only authors their own brand), and any hardening belongs at the create-time validation boundary rather than the prompt-assembly layer.

### Verification

```
pnpm install        ✔  lockfile updated (vitest added to @brandfactory/db)
pnpm typecheck      ✔  9/9 workspaces pass
pnpm lint           ✔  clean
pnpm format:check   ✔  clean
pnpm test           ✔  120 tests passing (25 files) — up from 106
```

---

## 0.6.0 — 2026-04-19

Phase 5 lands `@brandfactory/agent` — a server-only orchestration library that turns `(brand, canvas, user message) → streamed AgentEvent[]`. Same release rolls in a four-item hardening pass surfaced by a repo-wide review of phases 0–5: one HIGH (realtime subscribe race), one MEDIUM (unbounded blob PUT body), two LOW (redundant DB predicate, overlapping shared union). `pnpm test` grew from 83 (0.5.1) to 106 (+20 from the agent package, +3 from the hardenings); typecheck, lint, format clean across 9 workspaces.

### Phase 5 — `@brandfactory/agent`

A pure-orchestration library. **It never talks to the DB, the realtime bus, or an HTTP surface directly** — all side effects flow through an injected `CanvasOpApplier`. Phase 6's `POST /projects/:id/agent` route implements that interface against the real persistence layer and forwards the resulting events to SSE + the realtime bus.

#### Package wiring

- **`packages/agent/package.json`** — new package. Deps: `@brandfactory/shared`, `@brandfactory/adapter-llm` (both `workspace:*`), `ai ^4.0.20` (kept in lockstep with adapter-llm so the shared `LanguageModel` type references exactly one copy of `ai`), `zod ^4.3.6`. Dev-deps: `@types/node`, `tsx`, `vitest`. Scripts: `typecheck`, `lint`, `test` (`vitest run`), `smoke` (`tsx scripts/smoke.ts`).
- **`packages/agent/vitest.config.ts`** — projects-mode entry, mirrors the other packages so `pnpm --filter @brandfactory/agent test` and the root `pnpm test` behave identically.
- **`packages/agent/tsconfig.json`** — `include` widened to `['src/**/*.ts', 'scripts/**/*.ts']` and `rootDir: src` dropped, so `scripts/smoke.ts` participates in the TS project (otherwise type-aware ESLint fails with "was not found by the project service").
- **Root `vitest.config.ts`** — appended `packages/agent` to the `projects` list.

#### Prompt assembly — system + canvas context

- **`packages/agent/src/prompts/prose-mirror-to-text.ts`** — `proseMirrorDocToPlainText(doc)`. Walks a ProseMirror / TipTap JSON tree and flattens it. Block-level node types (paragraph, heading, list_item, blockquote, code_block, bullet_list, ordered_list, horizontal_rule — both snake_case and camelCase spellings) produce their own block, joined with `\n\n`; inline text nodes concatenate. Deliberately lossy: marks (bold/italic/links) are dropped because the model doesn't need them and stripping them keeps the prompt compact.
- **`packages/agent/src/prompts/system-prompt.ts`** — `buildSystemPrompt(brand: BrandWithSections): string`. Fixed composition order: role preamble → `# Brand: <name>` (+ description if set) → `## Brand guidelines` (sections rendered in ascending `priority` order; block skipped when zero sections) → `## Canvas awareness` paragraph naming the three tools so the model can reason about intent. Tests pin structural invariants but not exact wording, so future wordsmithing doesn't break the suite.
- **`packages/agent/src/prompts/canvas-context.ts`** — `buildCanvasContext({ blocks, shortlistBlockIds, recentOps? }): string`. Renders `CANVAS STATE` block with `PINNED:` / `UNPINNED:` lists; unpinned items truncated at `CANVAS_CONTEXT_UNPINNED_LIMIT = 20` (exported for Phase 6 tuning) with an `… and K more` tail. `RECENT OPS:` block rendered only when non-empty. `summarizeBlock` branches text / image / file: text is plain-text-flattened, whitespace-collapsed, truncated at 200 chars; image is `[image: <alt|"untitled">] (W×H)?`; file is `[file: <name>] (<mime>)`. Pure / deterministic / memoizable.

#### Canvas tools + `CanvasOpApplier` (the side-effect seam)

- **`packages/agent/src/tools/applier.ts`** — `CanvasOpApplier` interface: `addCanvasBlock(input)`, `pinBlock(blockId)`, `unpinBlock(blockId)`. v1 `AddCanvasBlockInput` is `{ kind: 'text', body: ProseMirrorDoc, position: number }` — image/file variants intentionally deferred (both need a `blobKey` from the separate upload flow, not minted by the agent). Every method returns the applied `CanvasBlock` so the stream layer can synthesize the `canvas-op`/`pin-op` event without a second DB round-trip.
- **`packages/agent/src/tools/definitions.ts`** — `buildCanvasTools(applier, opts?)`. Three AI-SDK tools (`add_canvas_block`, `pin_block`, `unpin_block`) whose parameter schemas reuse `ProseMirrorDocSchema` / `CanvasBlockIdSchema` from shared (no redefinition). Each `execute` returns a compact `{ blockId, isPinned }` so the model reasons about what happened without leaking full rows into the conversation. Tool names exported via `CANVAS_TOOL_NAMES`. **Internal `onApplied` hook**: `opts.onApplied?(toolCallId, event)` fires after the applier returns, passing the AI-SDK's `toolCallId` and a pre-shaped `CanvasOpEvent`/`PinOpEvent` — this is the hook `streamResponse` uses to correlate tool-results to canvas-op events. External callers that just want the `ToolSet` (e.g. a Phase-6 authz introspector) pass no opts.

#### `streamResponse` — the entry point

- **`packages/agent/src/stream.ts`** — `streamResponse(input): AsyncIterable<AgentEvent>`. Builds system-prompt + canvas-context and concatenates as `system + '\n\n' + canvasContext` (the context is prepended to system, not injected as a user message, so the model treats it as static context); builds tools with the `onApplied` hook that stores events in a `Map<toolCallId, event>`; translates `AgentMessage[]` → AI-SDK `CoreMessage[]`; calls `streamText({ model, system, messages, tools, abortSignal })`; consumes `result.fullStream` as an async generator yielding typed `AgentEvent`s. Buffer flush points: `text-delta` accumulates and lazily allocates an assistant message id (`randomUUID()`); `tool-call` flushes pending text then yields a `tool-call` event; `tool-result` looks up the pending event by `toolCallId` and yields it; `step-finish` / `finish` flush text; `error` re-throws out of the generator. Trailing `takeMessage()` after the loop covers the case where the upstream stream ended without a finish part.
  - **Widened local stream-part type.** AI-SDK exports `TextStreamPart<TOOLS>`; with `TOOLS` inferred as the generic `ToolSet`, the `tool-call` / `tool-result` arms narrow to `never`. A local `AgentStreamPart` union redeclares the minimal shape we consume plus an explicit "other kinds" arm (`reasoning` / `source` / `file` / `step-start` / `tool-call-streaming-*`) so the `switch` stays exhaustive without a default-case never-guard. Runtime behaviour is unchanged — purely a TS-side workaround for v4 inference. The only `as` cast in the package (`as unknown as AsyncIterable<AgentStreamPart>`) is documented in-place.
  - **Message-id allocation.** Phase 5 mints assistant message ids locally (uuid v4). Phase 6 is free to regenerate them DB-side on persist — the id is opaque before that point, no conflict.

#### Barrel + smoke

- **`packages/agent/src/index.ts`** — re-exports only the public surface: `streamResponse`, `StreamResponseInput`, `buildSystemPrompt`, `buildCanvasContext`, `BuildCanvasContextInput`, `CANVAS_CONTEXT_UNPINNED_LIMIT`, `buildCanvasTools`, `CANVAS_TOOL_NAMES`, `CanvasOpApplier`, `AddCanvasBlockInput`. Internal helpers and the widened stream-part type stay private. No `**/*` globs in `exports`.
- **`packages/agent/scripts/smoke.ts`** — drives `streamResponse` against a real openrouter-backed `LLMProvider` with an in-memory `InMemoryApplier` that records every mutation. Hard-coded "Northstar Coffee" `BrandWithSections` (voice + audience), two seed canvas blocks (one pinned, one draft), single user message asking for three taglines via `add_canvas_block` then a pin. Prints each event as it arrives. Exits 0 on success, 1 if the script fatals, 2 if the run completed but the applier never received an `add_canvas_block` call (signal: model doesn't tool-use reliably, not a bug in the package). Gated on `OPENROUTER_API_KEY` — missing key is a clear error + exit 1, not a mid-stream failure.

#### Tests (Phase 5)

20 new vitest cases, all deterministic / no network:

- `prompts/prose-mirror-to-text.test.ts` — 6 cases: paragraph; paragraph + heading; bullet list; nested list; inline text runs; empty doc.
- `prompts/system-prompt.test.ts` — 2 cases: happy path (brand name, description, section labels in priority order, plain-text bodies, no raw JSON); brand with zero sections (canvas-awareness block still rendered, guidelines block skipped).
- `prompts/canvas-context.test.ts` — 4 cases: empty canvas (both placeholders); pinned/unpinned split across text/image/file; unpinned truncation + "and K more" tail; RECENT OPS rendering.
- `tools/tools.test.ts` — 5 cases: exposed tool names; each tool's `execute` forwards args to the applier and returns compact JSON; zod rejects bad input before any applier call.
- `stream.test.ts` — 3 cases driven by a hand-rolled `LanguageModelV1` fake: plain text-delta stream → single assistant `message` event; text-delta → tool-call → synthesized `canvas-op` (asserts both event order AND that the applier was called with decoded args); upstream `error` part → generator throws with the original message.

The fake `LanguageModel` implements only the slice `streamText` actually touches (`specificationVersion`, `provider`, `modelId`, `defaultObjectGenerationMode`, `supportsImageUrls`, `supportsStructuredOutputs`, `doGenerate` (throws), `doStream`). Cast through `as unknown as LanguageModel` — the AI-SDK doesn't export a test helper.

#### Phase 5 non-goals (reaffirmed)

Deliberately out of scope; Phase 6 or later: route in `@brandfactory/server`, persistence, realtime publish, workspace- settings resolution (caller passes `{ providerId, modelId }` in `llmSettings`), assistant-message persistence, rate-limit / concurrency-guard.

---

### Post-Phase-5 hardening pass

Same review cadence as 0.4.1 / 0.5.1. Four items surfaced by a repo-wide audit of phases 0–5; all four landed in this release so Phase 6 starts on a clean floor. Three are tiny / boundary-only; one (the realtime subscribe race) is the kind of latent bug that Phase 6's high-rate text-delta fan-out would have surfaced as "every token shows up twice in the canvas".

#### Realtime — same-tick subscribe race (HIGH)

`adapter-realtime/native-ws.ts` previously did the dedup check synchronously (`if (unsubscribers.has(msg.channel)) return`) but populated the unsubscribers map only after `opts.authorize` resolved. Two `subscribe` messages for the same channel arriving in the same tick both passed the dedup check, both awaited authorize, and both registered a handler — the client then received every event N times for N rapid duplicates. Phase 6 fans agent text-deltas through this bus at high rate and any client that re-subscribes on reconnect / visibility-change can trigger it.

- **`packages/adapters/realtime/src/native-ws.ts`** — stake a placeholder unsubscribe in the map *before* awaiting authorize. After authorize: if denied AND the slot still holds the placeholder, delete it; if the socket closed mid-await (the `close` handler clears the map), bail out. Otherwise replace the placeholder with the real unsubscribe. Single-tick dedup now works because the map is mutated synchronously on the first subscribe.
- **`packages/adapters/realtime/src/native-ws.test.ts`** — new case: fire two `subscribe` messages for the same channel back-to-back with an async `authorize` that takes 25ms; assert `authorize` runs exactly once and a single `publish` arrives at the client exactly once. Without the placeholder, both assertions fail.

#### Blobs — `BLOB_MAX_BYTES`-gated 413 (MEDIUM)

`PUT /blobs/:key` previously called `c.req.arrayBuffer()` with no ceiling. The signed URL is short-lived and gated by HMAC, so the attack surface is "an authenticated client can OOM the server", which is small but real and trivial to exploit. Plan deferred content-type / max-body to Phase 8, but a max-body limit is one constant + one length check — splitting it from content-type and landing it now is cheap.

- **`packages/server/src/env.ts`** — new env var `BLOB_MAX_BYTES` (`z.coerce.number().int().min(1).default(25 * 1024 * 1024)`). Not conditional on `STORAGE_PROVIDER` so the route can read it without branching; supabase deploys simply never hit the route.
- **`packages/server/src/routes/blobs.ts`** — `BlobsDeps` gains `maxBytes: number`. PUT handler reads `content-length` first and rejects with `413 BLOB_TOO_LARGE` before reading the body when declared length exceeds the cap. After reading: a belt-and-suspenders second check on `buf.byteLength` catches clients that omit or lie about `content-length`.
- **`packages/server/src/app.ts`** — passes `deps.env.BLOB_MAX_BYTES` into `createBlobsRouter`.
- **`packages/server/src/test-helpers.ts`** — `testEnv` defaults `BLOB_MAX_BYTES: 25 * 1024 * 1024`; `createTestApp` already threads `env` overrides through `createApp`, so route tests can shrink the cap to 4 bytes for assertion.
- **`.env.example`** — documents `BLOB_MAX_BYTES=26214400` with a comment about the 413 path.
- **`packages/server/src/routes/blobs.test.ts`** — two new cases: PUT with `content-length: 5` against `BLOB_MAX_BYTES=4` → 413 (pre-read path); PUT with the same body but no `content-length` header → still 413 (post-read path). Both assert the storage was not written.

#### DB — drop redundant `isNotNull` predicate (LOW)

`db/queries/events.ts:listBlockEvents` previously did `where(and(eq(canvasEvents.blockId, blockId), isNotNull(canvasEvents.blockId)))`. The `isNotNull` is implied by the equality on a non-null parameter — the predicate read as if `blockId` were a nullable parameter, which it isn't. Cosmetic but distracting; SQL behaviour unchanged.

- **`packages/db/src/queries/events.ts`** — drop the `isNotNull(canvasEvents.blockId)` clause; drop the now-unused `isNotNull` import. Behaviour parity preserved (existing tests cover the path).

#### Shared — collapse overlapping `RealtimeEventPayload` union (LOW)

`shared/realtime/envelope.ts` declared `RealtimeEventPayloadSchema = z.union([AgentEventSchema, CanvasOpEventSchema, PinOpEventSchema])`. But `AgentEventSchema` already unions all four `AgentEvent` branches (message, tool-call, canvas-op, pin-op), so the trailing two branches are redundant. No security impact (the union accepts the same set of values either way), but the structure was confusing — and would eventually mislead a reader who assumed the trailing branches existed for a reason.

- **`packages/shared/src/realtime/envelope.ts`** — `RealtimeEventPayloadSchema = AgentEventSchema` (re-aliased so call sites read as wire-protocol code, not agent-internals code). `RealtimeEventPayload` type unchanged. Two import symbols (`CanvasOpEventSchema`, `PinOpEventSchema`) dropped from the file's import line.

### Items still on the deferral list

Same review surfaced these; each has a natural home in a later phase, none block Phase 6:

- WS `?token=` query fallback exposure to upstream proxy logs — Phase 7 CORS + cookie-based ticket flow.
- Logger redaction for tokens / secrets — Phase 8 swap to pino.
- Blobs PUT content-type persistence — Phase 8 polish (content- type already accepted on the request, just not stored alongside bytes).
- 404 vs 403 ordering on `GET /brands/:id` and friends — consistent across routes, matches the WS `authorizeChannel` walk; product call to revisit.
- Live WS upgrade end-to-end test, live HTTP/WS boot smoke transcript — needs Postgres + Docker; held over from Phase 4.
- `update_block` / `remove_block` agent tools — re-open after we see what the model tries to do.
- Image / file canvas tool variants — needs the agent-side story for obtaining a `blobKey`.

### Verification

```
pnpm install        ✔  lockfile updated, no new peer-dep categories
pnpm typecheck      ✔  9/9 workspaces pass
pnpm lint           ✔  0 problems
pnpm format:check   ✔  all files clean
pnpm test           ✔  24 files, 106 tests pass (was 24 / 103)
pnpm --filter @brandfactory/agent smoke
                    ☐  run locally with OPENROUTER_API_KEY set
```

---

## 0.5.1 — 2026-04-19

Cleanup pass surfaced by a repo-wide review after Phase 4 landed. Six correctness / type-system / boundary tightenings, no new feature surface. `pnpm test` holds at 83 tests (the existing route coverage already exercised every changed path; behaviour parity preserved); typecheck, lint, format clean across 9 workspaces.

### Project + canvas — atomic creation in one transaction

- **`packages/db/src/queries/projects.ts`** — new `createProjectWithCanvas(input): Promise<{ project; canvas }>` runs both inserts inside `db.transaction`. Mirrors the existing `CreateProjectInput` discriminator. Phase 4 ran the two inserts back-to-back; a mid-write failure orphaned the project and surfaced as a 500 with no canvas. Phase 5's agent will create projects programmatically — fix-before-it-bites.
- **`packages/server/src/db.ts`** — `Db` facade now exposes `createProjectWithCanvas` and drops the standalone `createProject` / `createCanvas` (the route was the only consumer; the lower-level helpers stay on the `@brandfactory/db` surface for the smoke script).
- **`packages/server/src/routes/projects.ts`** — POST `/brands/:brandId/projects` calls the new helper and destructures `{ project }` so the response body is unchanged.
- **`packages/server/src/test-helpers.ts`** — fake `createProjectWithCanvas` writes both maps in one shot; signatures match the real helper.
- **`packages/server/src/{authz,ws}.test.ts`** — seed helpers updated to use `createProjectWithCanvas` (drift here would have failed compile after the facade change).

### `LLMProviderId` — single source of truth in shared

The four-provider tuple was redeclared in three places (shared's `workspace/settings.ts` schema, adapter-llm's `port.ts` union, server's `env.ts` const tuple). The server's `as const satisfies readonly LLMProviderId[]` caught server↔adapter drift, but a divergent shared schema would have shipped silently and Phase 5's agent reads `resolveLLMSettings` — a drifted shared schema could emit a wrong `llmProviderId` value through the wire DTO.

- **New: `packages/shared/src/llm/provider-ids.ts`** — owns `LLM_PROVIDER_IDS` (the const tuple), `LLMProviderIdSchema = z.enum(LLM_PROVIDER_IDS)`, and `type LLMProviderId = z.infer<...>`. Single source.
- **`packages/shared/src/index.ts`** — barrel exports the new module.
- **`packages/shared/src/workspace/settings.ts`** — drops its local `z.enum([...])` declaration; imports `LLMProviderIdSchema` from `../llm/provider-ids`. The `WorkspaceSettings`, `UpdateWorkspaceSettingsInput`, and `ResolvedWorkspaceSettings` schemas keep their existing names and shapes.
- **`packages/adapters/llm/src/port.ts`** — drops its local string-literal union; re-exports `LLMProviderId` from `@brandfactory/shared` so existing call sites (`import { LLMProviderId } from '@brandfactory/adapter-llm'`) keep working.
- **`packages/adapters/llm/package.json`** — adds `@brandfactory/shared: workspace:*` to deps. No cycle (shared has no adapter deps).
- **`packages/server/src/env.ts`** — imports `LLM_PROVIDER_IDS` directly from shared. The local tuple + `satisfies` block goes away; the `superRefine` `default: never` exhaustiveness guard stays.
- **`packages/server/src/settings.ts`** — `env.LLM_PROVIDER` is now natively typed `LLMProviderId`, so the `as LLMProviderId` cast in `resolveLLMSettings` is removed along with the "kept aligned by hand" comment.

After this pass there is exactly one place to widen the provider list; every consumer fails compile or boot if anyone tries to drift.

### `workspace_settings` — trust-boundary validation, not a CHECK

The column is intentionally `text` (not `pgEnum`) so widening the provider list doesn't need a migration — but that meant any caller using an `as`-cast or hand-rolled SQL could write garbage that bypassed the route's zod gate. Adding a CHECK constraint would have undone the widen-without-migration design.

- **`packages/db/src/queries/workspace-settings.ts`** — `rowToWorkspaceSettings` (read path) and `upsertWorkspaceSettings` (write path) both run the value through `LLMProviderIdSchema.parse`. The helper is now the trust boundary: nothing past it sees a provider id outside `LLM_PROVIDER_IDS`. If the shipped enum widens in shared but production hasn't deployed the new server yet, a row written by the new code surfaces loudly in the old code instead of corrupting downstream typing.
- **`packages/db/src/schema/workspace_settings.ts`** — comment updated to call out the helper as the trust boundary, with a pointer to the `LLMProviderIdSchema` parse.
- Migration intentionally not regenerated; column type is unchanged.

### Realtime — discriminated-union return from `buildAdapters`

`main.ts` previously did `adapters.realtime as NativeWsRealtimeBus` to reach `bindToNodeWebSocketServer`. The cast defeated the type system — adding a future redis or supabase realtime impl would have failed at runtime, not compile time.

- **`packages/server/src/adapters.ts`** — new `RealtimeAdapter = { provider: 'native-ws'; bus: NativeWsRealtimeBus }` discriminated union. `Adapters.realtime: RealtimeAdapter`. `buildAdapters` returns `{ provider: 'native-ws', bus: createNativeWsRealtimeBus() }`.
- **`packages/server/src/main.ts`** — cast removed. The Hono app receives `adapters.realtime.bus` directly (it only needs the `RealtimeBus` pub/sub surface). The WS upgrade is mounted via a `switch` on `adapters.realtime.provider` with a `const _exhaustive: never = adapters.realtime.provider` default branch — adding a second variant fails compile at the `default:` case.
- **`packages/server/src/adapters.test.ts`** — assertion updated to check `realtime.provider === 'native-ws'` and that `realtime.bus` carries the expected functions.
- `AppDeps.realtime` keeps its `RealtimeBus` type (the app doesn't need the binder), so route modules and `createTestApp` are unchanged.

### Blobs — `instanceof BlobNotFoundError`

- **`packages/server/src/routes/blobs.ts`** — imports `BlobNotFoundError` from `@brandfactory/adapter-storage`; uses `err instanceof BlobNotFoundError` instead of the previous `(err as Error).name === 'BlobNotFoundError'` sniff. The class is already on the storage port, so the sniff bought nothing and was brittle if the impl ever renamed it.
- **`packages/server/src/routes/blobs.test.ts`** — fake store throws `new BlobNotFoundError(key)` instead of constructing a generic `Error` with a hand-set `name`.

### Brand guidelines — atomic upsert + reorder

Phase 4's `PATCH /brands/:id/guidelines` looped `upsertSection` (one statement per item, no shared tx) then called `reorderSections` (which is itself in a tx). A failure mid-loop left the brand half-updated.

- **`packages/db/src/queries/brands.ts`** — new `updateBrandGuidelines(brandId, sections): Promise<BrandGuidelineSection[]>`. Single `db.transaction`: each input either updates an existing row by id+brand or inserts a new one; the final select returns the sorted list, same shape as `listSectionsByBrand`. `upsertSection` and `reorderSections` are kept on the package surface — the smoke script still uses `upsertSection`.
- **`packages/server/src/db.ts`** — `Db` facade exposes `updateBrandGuidelines` instead of `upsertSection` + `reorderSections`. The route was the only server consumer.
- **`packages/server/src/routes/brands.ts`** — PATCH calls `updateBrandGuidelines` with a flat map; the previous "collect ids, then reorder" two-step is gone.
- **`packages/server/src/test-helpers.ts`** — fake `updateBrandGuidelines` mirrors the real helper's "update by id, else insert" branch and returns the sorted section list.

### Items deliberately deferred

Same review surfaced these; each has a natural home in a later phase, none block Phase 5:

- WS `?token=` query fallback exposure to upstream proxy logs — Phase 7 CORS / cookie-based ticket flow.
- Logger redaction for tokens/secrets — Phase 8 swap to pino.
- Blobs PUT content-type / max-body validation — Phase 8 polish (content-type persistence is already on that list).
- Live WS upgrade end-to-end test — needs the live boot smoke (Postgres + ws server); captured under Phase 4 follow-ups.
- 404 vs 403 ordering on `GET /brands/:id` and friends — consistent across routes, matches the WS `authorizeChannel` walk; product call to revisit.

### Verification

All green:

```
pnpm install       ✔
pnpm typecheck     ✔  9/9 workspaces pass
pnpm lint          ✔  0 problems
pnpm format:check  ✔  all files clean
pnpm test          ✔  19 files, 83 tests pass
```

Phase 4 wrap was already at 83; this pass kept the count steady because every changed code path had route-level coverage.

### Post-Phase-4 cleanup record — `docs/completions/phase4-cleanup.md`

Per-issue writeup of all six fixes, files changed, the deliberately-deferred items, and the rationale for choosing helper-boundary validation over a `CHECK` constraint on `workspace_settings.llm_provider_id`.

---

## 0.5.0 — 2026-04-19

The first bootable backend in the repo. `@brandfactory/server` ships a Hono-on-`@hono/node-server` HTTP surface with a `/rt` WebSocket upgrade, wired to the Phase 3 adapter bundle and the Phase 2 query helpers. Running `pnpm --filter @brandfactory/server dev` boots the server end-to-end: `loadEnv()` → `buildAdapters` → `buildDbDeps` → `createApp` → `serve` → `mountRealtime` → SIGTERM/SIGINT-driven ordered shutdown (WS → HTTP → `pool.end()`). Test count grew from 34 to 83 (49 new server tests across 11 new files); typecheck, lint, format clean across 9 workspaces.

### Phase 4 execution plan — `docs/executing/phase-4-server.md`

Expanded Phase 4 of the scaffolding plan into a file-by-file task list and locked sixteen design decisions: Hono on `@hono/node-server`, the `main.ts` (deploy entry) / `app.ts` (factory) / `index.ts` (barrel) split, end-to-end types via Hono's chained `.get/.post` builders so Phase 7 can infer through `hono/client`, zod at every boundary via `@hono/zod-validator`, bearer-only auth with `c.var.userId` as the contract, single-owner authorization via `requireXAccess` walks, ~40-line inline JSON logger, minimal error boundary with a wire shape Phase 9 will keep stable, env-only API keys with a `workspace_settings` row for provider/model overrides, `PATCH /brands/:id/guidelines` as an upsert-and-reorder over the full section list (deletion out of scope), `/blobs` mounted only when `STORAGE_PROVIDER === 'local-disk'`, `/rt` upgrade via `ws.Server({ noServer: true })` with token via `Authorization` or `?token=`, channel naming `project:` / `brand:` / `workspace:` with an `authorizeChannel` walk, `dev` script as `tsx watch src/main.ts` (build deferred to Phase 8), and vitest coverage of every middleware + route happy path + at least one error path.

### Shared additions — client-importable DTOs

Phase 4 introduced four new HTTP boundaries; their input/output schemas live in shared so `web` can validate the same wire types.

- `workspace/settings.ts` — `WorkspaceSettingsSchema`, `UpdateWorkspaceSettingsInputSchema`, `ResolvedWorkspaceSettingsSchema` (`{ workspaceId, llmProviderId, llmModel, source: 'workspace' | 'env' }`). Plus a client-importable `LLMProviderIdSchema` (re-aligned to a single source of truth in 0.5.1).
- `workspace/create.ts` — `CreateWorkspaceInputSchema` (`{ name }` only; `ownerUserId` is injected by the route from the authed user).
- `brand/create.ts` — `CreateBrandInputSchema` (`{ name, description? }`).
- `brand/update-guidelines.ts` — `UpdateBrandGuidelinesInputSchema` (`{ sections: Array<{ id?, label, body, priority }> }`). `id` present → upsert existing, absent → insert new. Section deletion is out of scope for Phase 4.
- `project/create.ts` — `CreateProjectInputSchema` discriminated on `kind ∈ {freeform, standardized}`.
- `src/index.ts` — barrel updated.

### DB additions — `workspace_settings` table

- `src/schema/workspace_settings.ts` — singleton-per-workspace row: `workspace_id uuid pk fk→workspaces(id) on delete cascade`, `llm_provider_id text`, `llm_model text`, `updated_at timestamptz`. Provider id is stored as `text`, not a `pgEnum`, so the shipped-provider list can widen without a migration; the server validates `LLMProviderIdSchema` at the edge.
- `src/queries/workspace-settings.ts` — `getWorkspaceSettings`, `upsertWorkspaceSettings` (`INSERT ... ON CONFLICT (workspace_id) DO UPDATE`).
- `drizzle/0001_shocking_the_watchers.sql` — generated via `pnpm --filter @brandfactory/db db:generate`. Idempotent (`IF NOT EXISTS` on the table, `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` on the FK).
- `scripts/smoke.ts` extended: asserts `getWorkspaceSettings` returns `null` pre-write, then upsert-with-provider-a → upsert-with-provider-b exercises the `ON CONFLICT` branch.

### Server implementation — `packages/server`

The bulk of the phase. Twenty-plus source files, eleven new test files.

- **`package.json`** — added `hono`, `@hono/node-server`, `@hono/zod-validator` (bumped to `^0.7.6` for zod-4 support), `ws`, `@brandfactory/db` runtime deps; `@types/ws` dev dep; `dev` / `start` scripts (`tsx watch src/main.ts` / `tsx src/main.ts`).
- **`src/env.ts`** — appended `PORT` (coerced number, default `3001`), `HOST` (default `'0.0.0.0'`), `LOG_LEVEL` (enum, default `'info'`). No `superRefine` changes needed.
- **`src/logger.ts`** — ~55-line inline JSON logger with level filtering and a `child(fields)` builder. Injectable `write` and `now` for tests; the default writes `JSON.stringify({ ts, level, msg, ... })` to stdout.
- **`src/errors.ts`** — `HttpError` plus `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError` subclasses. Wire shape `{ code, message, details? }` matches what Phase 9 will keep stable.
- **`src/context.ts`** — `AppEnv` bindings type; `ServerHono` alias so every route module shares the same `c.var` types.
- **`src/middleware/request-id.ts`** — reads `x-request-id`, falls back to `randomUUID()`, echoes the header on the response.
- **`src/middleware/logger.ts`** — attaches a child logger (with `requestId`) to `c.var.log`; logs `{ method, path, status, durationMs, userId }` after each request.
- **`src/middleware/auth.ts`** — `createAuthMiddleware(auth)` extracts `Bearer <token>`, calls `auth.verifyToken`, writes `c.var.userId` or throws `UnauthorizedError`. `createOptionalAuthMiddleware(auth)` attaches `userId` when a valid token is present but never throws — used on `/health`.
- **`src/middleware/error.ts`** — `onError` maps `HttpError` → status+code, `ZodError` → 400 with `details`, unknown → 500 and logs the stack.
- **`src/authz.ts`** — `requireWorkspaceAccess`, `requireBrandAccess`, `requireProjectAccess`. The `AuthzDeps` interface lists only the `getXById` helpers each walk uses, so tests drop in fakes without touching the singleton.
- **`src/db.ts`** — `Db` interface + `buildDbDeps()` facade over `@brandfactory/db`'s module exports. Each field is typed as `typeof db.helperName`, so renaming or changing a helper's signature in Phase 2's package surfaces here as a type error.
- **`src/settings.ts`** — `resolveLLMSettings(workspaceId, env, deps)`. Returns the stored row with `source: 'workspace'` or falls back to env with `source: 'env'`. Phase 6 consumes it from the agent endpoint.
- **`src/routes/health.ts`** — `GET /health` → `{ status: 'ok', version }`. No auth required.
- **`src/routes/me.ts`** — `GET /me`; calls `auth.getUserById(userId)`, 404s `USER_NOT_FOUND` on miss.
- **`src/routes/workspaces.ts`** — `GET /`, `POST /`, `GET /:id` (with `requireWorkspaceAccess` on the single-resource route).
- **`src/routes/brands.ts`** — two router factories (`createWorkspaceBrandsRouter` for `GET /:workspaceId/brands` and `POST /:workspaceId/brands`; `createBrandsRouter` for `GET /:id` and `PATCH /:id/guidelines`) mounted separately at `/workspaces` and `/brands` in `app.ts`. `GET /:id` hydrates sections into `BrandWithSections`. `PATCH /:id/guidelines` loops `upsertSection` then calls `reorderSections` with the full priority list (refactored to a single-tx `updateBrandGuidelines` helper in 0.5.1).
- **`src/routes/projects.ts`** — `createBrandProjectsRouter` (list + create under `/brands/:brandId/projects`) and `createProjectsRouter` (`GET /projects/:id`). Creation implicitly creates the 1:1 canvas row (refactored to a single `createProjectWithCanvas` tx helper in 0.5.1).
- **`src/routes/settings.ts`** — `GET` + `PATCH` on `/workspaces/:id/settings`.
- **`src/routes/blobs.ts`** — `GET /:key{.+}` + `PUT /:key{.+}` (wildcard segment matches nested keys). Both verify `?exp=&sig=` via `verifySignature` and surface `ForbiddenError` on mismatch. `GET` returns a `Response(bytes)` with `content-type: application/octet-stream` (content-type persistence is a Phase 8 polish). `PUT` reads the request body via `c.req.arrayBuffer()` and calls `storage.put(key, bytes, { contentType })`.
- **`src/app.ts`** — `createApp(deps)` composes middleware + routes and returns the typed Hono instance. Mounts `/health` first, then path-scoped auth middleware on `/me/*`, `/workspaces/*`, `/brands/*`, `/projects/*`, then the route modules, then `/blobs` if `STORAGE_PROVIDER === 'local-disk'`. Exports `type AppType = ReturnType<typeof createApp>` so Phase 7's `hono/client` can infer end-to-end types.
- **`src/ws.ts`** — `mountRealtime({ httpServer, realtime, auth, db, log })`. Creates `ws.Server({ noServer: true })`, intercepts `httpServer`'s `upgrade` only on pathname `/rt`, and binds the realtime bus with a token-based `authenticate` and an `authorizeChannel`-based `authorize`. Token extraction accepts both `Authorization: Bearer` and `?token=` (browsers can't set custom headers on `new WebSocket`). Returns a `close()` handle for graceful shutdown.
- **`src/main.ts`** — the deployable entry: `dotenv/config` → `loadEnv` → `createLogger` → `buildAdapters` → `buildDbDeps` → `createApp` → `serve` → `mountRealtime`. `SIGTERM`/`SIGINT` trigger an ordered shutdown (WS → HTTP → `pool.end()`).
- **`src/index.ts`** — barrel extended with `createApp`, `AppType`, `buildDbDeps`, `Db`, `createLogger`, `Logger`, `LogLevel`, the error classes, and `mountRealtime`.
- **`src/test-helpers.ts`** — `silentLogger`, `createFakeDb` (in-memory implementation of the full `Db` surface), `createFakeAuth`, `createFakeAdapters`, `testEnv`, `createTestApp`. Every fake matches the real signature so drift in the underlying package shows up as a type error.

### Tests — 11 new files, 49 new tests

Totals: 13 server files / 58 server tests, 19 repo files / 83 repo tests.

- `src/middleware/auth.test.ts` — valid bearer, missing header, invalid token, optionalAuth no-header, optionalAuth with valid token (5).
- `src/middleware/error.test.ts` — `HttpError`, `HttpError` with details, `ZodError` → 400, unknown → 500 with `log.error` called (4).
- `src/authz.test.ts` — owner passes / non-owner 403 / missing 404 per helper (9).
- `src/routes/health.test.ts` — smoke (1).
- `src/routes/me.test.ts` — happy path, 404 when the auth provider has no matching user, 401 without a bearer (3).
- `src/routes/workspaces.test.ts` — create-mine, list-mine-only, forbidden-on-others, 400 on empty name (4).
- `src/routes/brands.test.ts` — create in owned workspace, forbidden on non-owned workspace, `GET /brands/:id` hydrates sections, `PATCH` upsert + reorder (label edit + priority swap) (4).
- `src/routes/projects.test.ts` — freeform create (asserts the canvas was implicitly created), standardized create with `templateId`, `GET /projects/:id` returns `canvas` nested (3).
- `src/routes/settings.test.ts` — env fallback, PATCH then GET reflects `source: 'workspace'`, bogus provider → 400 (3).
- `src/routes/blobs.test.ts` — signed PUT, signed GET (round-trip), expired → 403, tampered → 403, missing sig params → 400, not-mounted under `STORAGE_PROVIDER=supabase` → 404 (6).
- `src/ws.test.ts` — `authorizeChannel` for workspace / brand / project happy paths, wrong user denied, missing aggregate denied, unknown prefix denied, malformed channel denied (7).

### `.env.example` — extended

Appended `PORT`, `HOST`, `LOG_LEVEL` with a comment explaining that `/blobs` is only mounted when `STORAGE_PROVIDER=local-disk`. Updated `BLOB_PUBLIC_BASE_URL` default to `:3001/blobs` to match `PORT=3001`.

### API notes worth remembering

- **Hono sub-app middleware bleeds across `app.route('/', child)`.** The first attempt defined an "auth-required" sub-app (`api.use('*', authRequired)`) and mounted it at `/`. That made the auth middleware fire for `/blobs/*` too — breaking the blob tests with 401s. Fix: drop the sub-app and scope `authRequired` per prefix on the root app (`app.use('/me/*', authRequired)` etc.). Route modules themselves stayed unchanged.
- **`zod-validator` peer range.** `@hono/zod-validator@0.4.x` peers `zod@^3.19.1`, which breaks with zod 4. `0.7.6` peers `zod ^3.25 || ^4.0`. Bumped on install.
- **`@hono/node-server`'s `serve()` return type.** The callback receives a partial `{ port }` info object; the function returns Node's `http.Server` but the type assertion has to be `as unknown as HttpServer` because the exported type uses a narrower interface. Isolated to `main.ts`.
- **Hono param wildcards.** `/:key{.+}` matches keys with `/` segments (needed for nested blob paths). Documented in Hono but non-obvious; `/:key` alone would reject `nested/path/hello.txt`.
- **`BlobNotFoundError` detection.** Phase 4 sniffed `err.name === 'BlobNotFoundError'` to keep `routes/blobs.ts` decoupled from the storage impl package; 0.5.1 swapped this for `instanceof BlobNotFoundError` against the exported class.

### Phase 4 completion record — `docs/completions/phase4.md`

Phase-level wrap with per-file detail (mirrors the Phase 3 writeup shape rather than splitting per-task). Captures the sixteen locked decisions delivered as specified, the ws-mount override surprise, the conditional `/blobs` mount, and the follow-ups (live boot smoke against Postgres / live WS upgrade / logger swap to pino in Phase 8).

### Verification

All green:

```
pnpm install       ✔
pnpm typecheck     ✔  9/9 workspaces pass
pnpm lint          ✔  0 problems
pnpm format:check  ✔  all files clean
pnpm test          ✔  19 files, 83 tests pass (was 13 files / 34 tests)
```

Zero new peer-dep warnings beyond the pre-existing `ai-sdk`/`zod@3` set documented in 0.4.0. The live HTTP/WS boot smoke (`curl localhost:3001/health` etc.) needs a running Postgres; Docker wasn't available in the session so that transcript wasn't captured — `createApp` runs end-to-end against every route in unit tests, including the blob upload/download round-trip, the auth gate, the error boundary, and the conditional `/blobs` mount.

---

## 0.4.1 — 2026-04-19

Cleanup pass surfaced by a repo-wide review after Phase 3 landed. No new surface area, no phase progression — purely raising the floor before Phase 4 starts writing the HTTP/WS server. `pnpm test` grew from 31 to 34 tests (two env conditional-required additions, one UUID-version test), all green; typecheck, lint, format clean across 9 workspaces.

### Server env loader — exhaustiveness + coverage

- **`packages/server/src/env.ts`** — the `LLM_PROVIDER` switch inside `superRefine` now has a `default` branch with `const _exhaustive: never = env.LLM_PROVIDER` + a `ctx.addIssue` that reports `unhandled LLM_PROVIDER: <value>`. Why: the existing `as const satisfies readonly LLMProviderId[]` guard catches *syntactic* drift between the schema's enum tuple and `adapter-llm`'s `LLMProviderId`, but if the union widens and the switch isn't updated, the previous code silently skipped per-provider validation. Now a future widening fails the TS assignment (compile time) *and* the env loader (runtime) — belt and suspenders. How to apply: this is the standard "enum + switch" exhaustiveness pattern; use it any time we have a narrowing switch over a union imported from another package.
- **`packages/server/src/env.test.ts`** — two new tests covering gaps the Phase 3 suite left open:
  - "rejects supabase storage missing all three required fields" — asserts all three messages (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET`) appear in the single thrown error.
  - "reports every failure in a single error when multiple conditions are violated" — supabase auth + supabase storage + anthropic LLM all misconfigured in one env; asserts five distinct field names surface in the same error. Locks in `loadEnv`'s "report every issue, not just the first" contract. Test count for `env.test.ts` is now 8 (was 6).

### ESLint — type-aware, server-ready

- **`eslint.config.js`** — flipped parser to type-aware mode (`parserOptions.projectService: true`, `tsconfigRootDir: import.meta.dirname`) and added three rules:
  - `@typescript-eslint/no-floating-promises` — Phase 4 introduces async HTTP/WS handlers; a dropped promise in a route silently swallows its rejection and never reaches the error middleware. The rule forces every promise to be awaited, void-ed, or returned.
  - `@typescript-eslint/no-explicit-any` — prevents `any` as an escape hatch; use `unknown` with a narrowing check instead.
  - `@typescript-eslint/consistent-type-imports` with `fixStyle: 'inline-type-imports'` — keeps runtime vs type-only imports explicit so bundlers can drop type-only imports cleanly and `verbatimModuleSyntax` doesn't surprise anyone. Also extended `ignores` with `**/drizzle/**` and `**/*.config.ts` so generated migration SQL and bespoke Node config files don't need to sit inside a tsconfig project for the type-aware parser.
- **`packages/adapters/storage/src/local-disk.ts`** + **`supabase.ts`** — two import lines fixed by `eslint --fix` (type-only imports moved to `import type`). No runtime change.
- Intentionally *not* adopted: `@typescript-eslint/recommendedTypeChecked` — it pulled in `require-await`, `no-unnecessary-type-assertion`, `no-base-to-string`, and `prefer-promise-reject-errors`, which collectively flagged 36 pre-existing issues across mappers, test fakes, and idiomatic drizzle casts. Adopting those rules is a bigger cleanup (and some of the flagged casts are load-bearing for drizzle's inferred row types). We picked the three rules that pay for themselves immediately and deferred the rest.

### Storage — constant-time `verifySignature`

- **`packages/adapters/storage/src/local-disk.ts`** — `verifySignature` now always computes the HMAC and runs `timingSafeEqual` before deciding expired-vs-tampered. Previously the expiry check returned first, so a remote observer could theoretically distinguish "signature expired" from "signature tampered" by response-time delta. Not exploitable given a 15-minute TTL and the current lack of a Phase 4 HTTP route to measure against, but it's defense-in-depth for when that route lands. Implementation: the provided sig is padded/truncated to `expected.length` so `timingSafeEqual` never throws on length, then both "sig matches" and "not expired" are evaluated and the function throws a single `InvalidSignatureError('invalid signature')` if either fails. All six existing tests still pass — they assert on the error class, not the message.

### Auth — RFC-4122 v4 regex

- **`packages/adapters/auth/src/local.ts`** — the UUID regex now requires the version nibble to be `4` and the variant nibble to be one of `{8, 9, a, b}`. Previously it accepted any 128-bit hex in UUID shape. Practical impact is near-zero (pg's `gen_random_uuid()` only ever emits v4, so real dev tokens already match), but the provider is now refusing tokens that couldn't have come from our ID generator — a cheap invariant to enforce.
- **`packages/adapters/auth/src/local.test.ts`** — `VALID_UUID` updated to a valid v4 shape (`…-4333-8444-…`); added a new test "verifyToken rejects a non-v4 uuid token" that uses the old non-v4 shape as the negative. Test count is now 5 (was 4).

### DB — `createCanvas` helper + smoke cleanup

- **`packages/db/src/queries/canvas.ts`** — new `createCanvas(projectId): Promise<Canvas>` helper. Parallels the shape of `createWorkspace`, `createBrand`, `createProject`, etc. Previously the smoke script inserted canvases via `db.insert(canvases).values(...).returning()` because no helper existed; Phase 4 routes would have either duplicated that boilerplate or added the helper then anyway.
- **`packages/db/scripts/smoke.ts`** — swapped the direct insert for `await createCanvas(project.id)`. Removed now-unused `canvases` and `db` imports. Smoke still does the same flow; it's just shorter and uses the same surface Phase 4 will.

### LLM factory — documented type boundary

- **`packages/adapters/llm/src/factory.ts`** — added a short block comment above `defaultDeps` explaining the `as unknown as LanguageModel` cast: per-provider AI-SDK return types are structurally compatible with but not nominally equal to `LanguageModel`, so the cast is the intentional boundary between per-provider shapes and the AI-SDK core surface. Removes the "why is this cast here" question from future readers; revisit if AI-SDK exposes a direct helper for this conversion.

### Scaffold comments — `web` and `agent`

- **`packages/web/src/index.ts`** — `export {}` preserved, one-line comment added above: `// Scaffold. Real entry point (Vite + React) lands in Phase 7.`
- **`packages/agent/src/index.ts`** — same treatment with a Phase 5 pointer. Stops the "is this broken or intentionally empty" confusion on first read.

### @types/node — explicit per-package devDeps

- Added `@types/node@^22.9.0` to the devDependencies of every workspace that declares `"types": ["node"]` in its tsconfig: `@brandfactory/db`, `@brandfactory/server`, `@brandfactory/adapter-auth`, `@brandfactory/adapter-storage`, `@brandfactory/adapter-realtime`, `@brandfactory/adapter-llm`. Previously these resolved via pnpm's hoisting of the root-level devDep, which worked but made the dependency implicit. Now the graph is self-describing: every package that imports `node:crypto`, `node:fs/promises`, `NodeJS.ProcessEnv`, etc. declares its node types dep directly. `@brandfactory/shared` deliberately skipped — its tsconfig doesn't list node types and its source doesn't import from `node:*`.

### Architecture doc — AuthProvider + BlobStore sketches

- **`docs/architecture.md`** — the ports sketch under `packages/adapters` now reflects the shipped Phase 3 surface:
  - `AuthProvider` is `verifyToken, getUserById` (was `verifyToken, getUser, listUsers`). Listing users is DB territory, not an identity-provider concern — spelled out in the body with a pointer to the Phase 3 completion record.
  - `BlobStore` is `put, get, delete, getSignedReadUrl, getSignedWriteUrl` (was `put, get, getSignedUrl, delete`) with a one-line note that signed URLs are the transport for both reads and writes, so the server can stay out of the byte path. This closes the "architecture doc updates owed" item in `docs/completions/phase3.md`.

### Verification

All green:

```
pnpm install       ✔
pnpm test          ✔  8 files, 34 tests pass
pnpm typecheck     ✔  9/9 workspaces pass
pnpm lint          ✔  0 problems (with type-aware + 3 new rules)
pnpm format:check  ✔  all files clean
```

Outstanding zod peer-dep warnings (`@ai-sdk/*`, `@openrouter/*`, `ai`, `ollama-ai-provider` all want `zod@^3.x`; we run `zod@^4.3`) are unchanged and documented in 0.4.0 — still harmless in our usage.

---

## 0.4.0 — 2026-04-19

First swappable port-and-adapter layer in the repo. Four `@brandfactory/adapter-*` packages each export a port type plus the default impls that satisfy it. `@brandfactory/server` reads a single zod-validated env at boot and assembles the four adapters into a typed bundle — no vendor name leaks past the adapter boundary. Realtime, storage, and auth all surface dependency-injection seams so Phase 3 ships the first real unit-test layer alongside the code (vitest, projects mode, 31 tests across 8 files).

### Phase 3 execution plan — `docs/executing/phase-3-adapters.md`

- Expanded Phase 3 of the scaffolding plan into a file-by-file task list across nine tasks (shared envelope prerequisite, four adapter packages, server env loader + `buildAdapters`, root vitest setup, `.env.example`, smoke check).
- Locked fifteen design decisions up front: ports live in their adapter package (no new `core` workspace), `buildAdapters(env)` lives in `packages/server`, env validation lives in `packages/server/src/env.ts` and adapters never read `process.env` themselves, the LLM port returns an AI-SDK `LanguageModel` (no extra abstraction), the realtime port is pub/sub only with HTTP/WS upgrade deferred to Phase 4, the storage port surfaces signed URLs for both reads and writes (HMAC-SHA256 over `(method, key, exp)` for `local-disk`), `AuthProvider` collapses to `verifyToken` + `getUserById` only (`listUsers` dropped — DB territory, not identity-provider territory), settings are env-only in Phase 3, vitest is the project test runner, the WS framing schema lives in `@brandfactory/shared` (so `web` can speak the same protocol), per-provider config is discrete env vars validated with `superRefine`, vitest runs in projects mode with one root config + per-package configs, and deferred adapter impls are absent from code rather than throw-stubs (the `*_PROVIDER` enum narrows to shipped impls so a misconfigured env fails loudly at boot).
- Archived to `docs/archive/phase-3-adapters.md` on completion.

### Prerequisite shared addition — `packages/shared/src/realtime/envelope.ts`

Per locked decision 12, the WS framing schema lives in shared so both `web` and `server` can validate the same protocol — adapter packages are server-only and `web` cannot import from them.

- `RealtimeChannelSchema = z.string().min(1)` (intentionally loose for Phase 3; tighter naming convention lands when the server picks one).
- `RealtimeEventPayloadSchema = z.union([AgentEventSchema, CanvasOpEventSchema, PinOpEventSchema])`.
- `RealtimeClientMessageSchema` — browser → server: `subscribe | unsubscribe`, discriminated on `type`.
- `RealtimeServerMessageSchema` — server → browser: `event` (kept as a single-branch discriminated union so adding `error`/`ack` later is mechanical).
- Inferred types exported alongside; barrel re-export in `packages/shared/src/index.ts`.

### Phase 3 implementation — four adapter packages

Each adapter follows the same shape: `port.ts` declares the interface and any error classes, one file per impl exports a factory function (`createXxx(config, deps?)`) returning a plain object satisfying the port, `index.ts` is a barrel that opens with a header comment listing shipped *and* planned-but-not-yet-shipped impls so future intent survives without runtime stubs.

- **`@brandfactory/adapter-auth`** —
  - Port: `verifyToken(token) → { userId }` + `getUserById(id) → User | null`. `User` is re-exported from `@brandfactory/db` so callers get one canonical row type. `InvalidTokenError` for any rejection.
  - `local`: dev-only, the bearer token IS the user id (uuid-validated via regex, then looked up via `@brandfactory/db.getUserById`). Token-as-id collapses crypto-free local dev into a single line of setup; production callers wire a real provider instead.
  - `supabase`: `jose.createRemoteJWKSet` + `jose.jwtVerify` against the project JWKS. `audience` and `issuer` optional. The `sub` claim becomes `userId`. A `jwks` test seam lets unit tests pass an in-memory key set instead of fetching one. Phase 3 does not sync Supabase Auth's `auth.users` back into our `users` table.

- **`@brandfactory/adapter-storage`** —
  - Port: `BlobStore` with `put | get | delete | getSignedReadUrl | getSignedWriteUrl`. Bodies accepted as `Uint8Array` or Node readable streams. `BlobNotFoundError` and `InvalidSignatureError` exposed.
  - `local-disk`: filesystem under `rootDir` with `mkdir -p` on each `put`. Path-traversal defense via `path.resolve` + a startsWith check against the resolved root (`../escape.bin` throws before any I/O). Signed URLs are HMAC-SHA256 over `${method}\n${key}\n${exp}`, hex-encoded, with a 15-minute default TTL. URL shape: `${publicBaseUrl}/${encodeURI(key)}?exp=<unix>&sig=<hex>`. A `verifySignature({ method, key, exp, sig, signingSecret, now? })` helper is exported for the Phase 4 server route — does an expiry check, recomputes the HMAC, and compares with `crypto.timingSafeEqual`. Constant-time + length-checked.
  - `supabase`: thin wrapper over `client.storage.from(bucket)`'s `upload | download | remove | createSignedUrl | createSignedUploadUrl`. A `client` dep injection seam keeps unit tests off the real `@supabase/supabase-js` fetch path.

- **`@brandfactory/adapter-realtime`** —
  - Port: `RealtimeBus` with `publish(channel, event) → Promise<void>`
    + `subscribe(channel, handler) → unsubscribe`. Event type imported from `@brandfactory/shared` (`AgentEvent | CanvasOpEvent | PinOpEvent`).
  - `native-ws`: in-process `Map<channel, Set<handler>>`. Empty sets are collected on unsubscribe. Handler exceptions are swallowed so one bad subscriber can't break fan-out (will surface via a logger in Phase 4).
  - `bindToNodeWebSocketServer(wss, { authenticate, authorize? })` wires a `ws.Server`'s `connection` event to per-client subscribe/unsubscribe handling. Failed `authenticate` → `socket.close(4401, 'unauthorized')`. Inbound frames are validated against `RealtimeClientMessageSchema` from shared. Outbound frames are typed as `RealtimeServerMessage`. Adapter does not own the HTTP upgrade — that lives in `packages/server` (Phase 4).

- **`@brandfactory/adapter-llm`** —
  - Port: `LLMProvider.getModel({ providerId, modelId }) → LanguageModel`, `LLMProviderId = 'openrouter' | 'anthropic' | 'openai' | 'ollama'`, `LLMProviderConfig` (per-provider config blocks), `ProviderNotConfiguredError`. `LanguageModel` is `import type` from `ai` — no intermediate abstraction since Phase 5's `agent` package will consume AI-SDK directly.
  - `createLLMProvider(config, deps?)`: per-provider AI-SDK clients are constructed eagerly via `createAnthropic` / `createOpenAI` / `createOpenRouter` / `createOllama` and cached in a `Map<LLMProviderId, ProviderFactory>` so a long-running server doesn't rebuild on every `getModel` call. Exhaustiveness on `providerId` enforced by a `_exhaustive: never` default branch. API-key providers throw `ProviderNotConfiguredError` if the matching config block is missing; `ollama` is always callable (defaults to a local daemon, no key needed). Each `buildXxx` is a test seam — unit tests pass `vi.fn()` factories and never load the real SDK paths.

### Server env loader + `buildAdapters` — `packages/server`

- **`src/env.ts`** — one `EnvSchema = z.object({…}).superRefine(…)`. Required base fields: `DATABASE_URL`, the four `*_PROVIDER` selectors, `LLM_MODEL`. Optional per-provider fields are `.optional()` and promoted to required by `superRefine` based on which providers are active:
  - `AUTH_PROVIDER='supabase'` → `SUPABASE_JWKS_URL` required.
  - `STORAGE_PROVIDER='local-disk'` → `BLOB_LOCAL_DISK_ROOT` + `BLOB_SIGNING_SECRET` + `BLOB_PUBLIC_BASE_URL` required.
  - `STORAGE_PROVIDER='supabase'` → `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + `SUPABASE_STORAGE_BUCKET` required.
  - `LLM_PROVIDER='anthropic'|'openai'|'openrouter'` → matching `*_API_KEY` required. `LLM_PROVIDER='ollama'` requires nothing.
  - `LLM_PROVIDER_IDS` declared `as const satisfies readonly LLMProviderId[]` so a future enum widening in `adapter-llm` won't silently drift from this schema — TS fails the satisfies check.
  - `loadEnv(source = process.env)` returns the parsed `Env` or throws with a multi-line `path: message` summary of every issue.
- **`src/adapters.ts`** — `buildAdapters(env): { auth, storage, realtime, llm }` switches on each `*_PROVIDER` and calls the matching factory with the right env slice. Realtime is currently unconditional (only `native-ws` ships in Phase 3); adding a second impl widens the enum *and* the switch in lockstep, with the compiler enforcing exhaustiveness.

### Vitest setup — root + per-package projects mode

- Root `vitest.config.ts` declares `test.projects` pointing at the five tested workspaces (`adapters/{auth,storage,realtime,llm}` + `server`).
- Each project ships its own `vitest.config.ts` using `defineProject` with a `name` (so the runner labels output per package), `include: src/**/*.test.ts`, `environment: 'node'`. Per-package `pnpm --filter <pkg> test` continues to work, and so does the root `pnpm test`.
- `vitest@^2.1.8` added as a root devDep; root `test` script is now `vitest run` instead of the old `pnpm -r --parallel test`.

### `.env.example` — extended

Adapter selection (`AUTH_PROVIDER`, `STORAGE_PROVIDER`, `REALTIME_PROVIDER`, `LLM_PROVIDER`, `LLM_MODEL`), the local-disk trio (`BLOB_LOCAL_DISK_ROOT`, `BLOB_SIGNING_SECRET`, `BLOB_PUBLIC_BASE_URL`), the Supabase set (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_ISSUER`, `SUPABASE_STORAGE_BUCKET`), and the LLM keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OLLAMA_BASE_URL`). Header comment explains that `*_PROVIDER` picks which adapter the server wires up at boot.

### Smoke check — unit tests across the adapter layer

Per the scaffolding plan, Phase 3's smoke is **unit tests per adapter**, not an end-to-end. Test counts (all green):

- `adapter-auth/local.test.ts` — 4 tests: uuid happy path, non-uuid rejection, missing-user rejection, getUserById delegation. Uses an injected `getUserById` so no DB is touched.
- `adapter-auth/supabase.test.ts` — 3 tests: mints RS256 keys via `jose.generateKeyPair`, verifies a valid token decodes to the right `sub`, expired tokens reject, no-`sub` tokens reject. JWKS provided via the test seam — no real Supabase or network.
- `adapter-storage/local-disk.test.ts` — 6 tests: round-trips put/get/delete in a `mkdtemp` root, asserts traversal rejection, signs/verifies a read URL, rejects expired and tampered sigs, asserts a PUT-signed URL doesn't verify as GET.
- `adapter-storage/supabase.test.ts` — 2 tests: hand-rolled fake client verifies the adapter calls the right SDK methods with the right args, including content-type passing on writes.
- `adapter-realtime/native-ws.test.ts` — 4 tests: spins up a real `http.Server` + `ws.Server` on an ephemeral port and verifies in-process publish/subscribe + idempotent unsubscribe, fan-out to two real WS clients on the same channel, over-the-wire unsubscribe stops further delivery, and `authenticate() → null` closes the socket with code `4401`.
- `adapter-llm/factory.test.ts` — 5 tests: caching (one `buildAnthropic` call across two `getModel` calls), modelId passing, openrouter `baseURL` plumbing, ollama-with-no-config, and the `ProviderNotConfiguredError` path.
- `server/env.test.ts` — 6 tests: local happy path, supabase happy path, and four conditional-required failure paths (`SUPABASE_JWKS_URL`, `BLOB_SIGNING_SECRET`, `ANTHROPIC_API_KEY`, ollama-with-no-key).
- `server/adapters.test.ts` — 1 test: `loadEnv` + `buildAdapters` for the local + native-ws + openrouter combo, asserts the returned bundle has the four expected method shapes.

### Cross-cutting changes outside the adapter packages

- **`packages/shared`** — new `src/realtime/envelope.ts` + barrel re-export. No other shared changes.
- **`packages/db/src/client.ts`** — `pool` and `db` are now lazy `Proxy`-wrapped singletons. The `DATABASE_URL` check moved from module-import time to first-access time. Required because vitest setup files run *after* module evaluation, so import-time `throw`s cannot be neutralized by a sentinel value. Real callers see identical behavior (still throws on first query if env isn't set); test-time imports for type-only consumers no longer fail.
- **Root `package.json`** — `vitest@^2.1.8` added to devDeps; root `test` script now runs `vitest run` instead of the old `pnpm -r --parallel test` recursion.
- **Root `vitest.config.ts`** — new file, declares projects mode.

### Architecture doc updates owed

Per locked decision 10, `docs/architecture.md` originally sketched `AuthProvider` with `listUsers`. The Phase 3 port drops that method — listing users is `@brandfactory/db` territory, not an identity concern. Update needed: amend the AuthProvider port sketch in `docs/architecture.md` and link to the Phase 3 completion record.

### API notes worth remembering

- **Zod 4 vs AI-SDK peer:** the AI-SDK provider modules declare a peer dependency on `zod@^3.x`; this repo runs `zod@^4.3`. pnpm warns; the `LanguageModel` type we re-export is a plain TS interface and isn't zod-derived, so the version skew is harmless in our usage. If we ever consume a zod schema *exported* by an AI-SDK module, revisit.
- **`ws@8` `connection` handler:** delivers `(socket, req: IncomingMessage)`; we read the request from the second arg for `authenticate`. Header-based auth (e.g. `Sec-WebSocket-Protocol: bearer.<token>`) belongs in the user-supplied `authenticate` callback, not in the bus.
- **HMAC URL format choice:** `${method}\n${key}\n${exp}` was picked because newlines aren't valid in any of the inputs and the format is trivially debuggable (`echo -ne "GET\nfoo\n123" | openssl dgst -sha256 -hmac secret`). Verifier and signer share a single source-of-truth function.
- **`jose.generateKeyPair('RS256')`** returns `KeyLike` (`CryptoKey | KeyObject`); the supabase auth test signs with `KeyLike` rather than `CryptoKey` to avoid pulling the DOM lib into our node-only tsconfig.
- **Vitest projects mode requires per-package configs.** Vitest 2 needs a `vitest.config.ts` at each project root (or an inline config). Per-package configs also let `web` later pick `environment: 'jsdom'` without polluting the rest.

### Phase 3 completion record — `docs/completions/phase3.md`

Phase-level wrap with per-task notes inline (Phase 3's surface area was tighter than Phase 2; one document is enough). Captures the fifteen locked design decisions delivered as specified, every adapter's port + impl + test detail, the cross-cutting changes outside the adapter packages (shared envelope, db client lazy singleton, root vitest config, root `package.json` test script), the architecture-doc TODO around `listUsers`, and the API quirks worth remembering. Also documents what Phase 3 explicitly did *not* include (HTTP server / routes / middleware / WS upgrade endpoint / blob HTTP routes / workspace-level LLM settings / agent prompt assembly / Supabase Auth ↔ users sync / API-key encryption at rest / e2e — all per the plan's exclusion list).

### Verification

All green on a fresh install:

```
pnpm install       ✔
pnpm test          ✔  8 files, 31 tests pass
pnpm typecheck     ✔  9/9 workspaces pass
pnpm lint          ✔  0 problems
pnpm format:check  ✔  all files clean
```

The Phase 2 `db smoke` script was not re-run in this session because Docker wasn't available locally. The `client.ts` lazy-singleton refactor preserves the runtime contract (still throws on first DB access if `DATABASE_URL` is unset); the Phase 3 unit tests exercise the import-without-DB paths that previously broke.

---

## 0.3.0 — 2026-04-18

First database layer in the repo. `@brandfactory/db` is the typed, migration-driven Postgres package every backend concern will build against: drizzle-orm over `pg`, schema mirrors `@brandfactory/shared`, ids are real `uuid` columns while shared keeps its branded-string types at the type layer. A one-shot smoke script walks a real user → workspace → brand → project → canvas → block → event flow end-to-end against a docker-compose Postgres.

### Phase 2 execution plan — `docs/executing/phase-2-database-package.md`

- Expanded Phase 2 of the scaffolding plan into a file-by-file task list across seven tasks (package setup, connection, schema, queries, local-dev compose, barrel, smoke).
- Locked nine design decisions up front: pins collapse to a boolean on `canvas_blocks` (no `pins` table), block kinds drop to `text | image | file` (no `snippet`), every block carries `createdBy` provenance, canvas blocks use `deleted_at` soft-delete, guideline sections are normalized to their own table, one canvas per project (unique constraint), `agent_messages` deferred to Phase 6, ids are `uuid defaultRandom()`, timestamps are `timestamptz` with pgEnums for stable value sets.
- Enumerated open questions with leanings (enum volatility, `canvas_events.block_id` FK, position rebalancing, canvas-per- project cardinality, event payload shape) so execution had clear defaults.
- Archived to `docs/archive/phase-2-database-package.md` on completion.

### Prerequisite shared amendments — `packages/shared`

Small, localized patch to line shared up with the locked DB shape before any Drizzle file was written.

- `project/canvas.ts` — `SnippetCanvasBlockSchema` dropped from the union. `PinIdSchema` / `PinCreatedBySchema` / `PinSchema` removed entirely (pins are a block boolean now, not a row). `CanvasBlockKind` → `z.enum(['text', 'image', 'file'])`. `CanvasBlockBaseShape` gained `isPinned`, `pinnedAt`, `createdBy`, `deletedAt`. `ShortlistView` stays — still a derived projection, now computed from `is_pinned = true AND deleted_at IS NULL`.
- `ids.ts` — `PinIdSchema` / `PinId` removed.
- `agent/events.ts` — `CanvasOpSchema` payloads no longer carry `SnippetCanvasBlock`; `PinOpSchema` stays (pin / unpin ops still flow on the stream) but no longer references `PinSchema`.

### Phase 2 implementation — `packages/db`

Seven source files under `src/schema/`, six under `src/queries/`, one mapper module, one client, one barrel.

- **Package setup.** `package.json` pulls `drizzle-orm` + `pg` as runtime deps and `drizzle-kit` + `@types/pg` + `tsx` as dev deps. Scripts: `db:generate`, `db:migrate`, `db:studio`, `smoke`, plus the usual `lint` / `typecheck` / `format:check`. `tsconfig.json` extends the base with `rootDir: .` and `outDir: dist` so scripts and src compile together. `drizzle.config.ts` reads `DATABASE_URL`, points at `src/schema/**/*.ts` → `drizzle/`.
- **Connection module.** `src/client.ts` — reads `DATABASE_URL` (throws if missing), constructs a singleton pg `Pool`, and exports `db = drizzle(pool, { schema })` so the drizzle query builder is typed end-to-end against the schema map.
- **Schema (8 tables, 6 pgEnums).**
  - `users` — `id`, `email` (unique), `display_name` (nullable), timestamps. V1 stub to own workspaces and be the FK target for `canvas_events.user_id`; real auth columns land with Phase 3.
  - `workspaces` — `owner_user_id` FK → users `ON DELETE restrict`, index on `(owner_user_id)`.
  - `brands` — `workspace_id` FK `ON DELETE cascade`, index on `(workspace_id)`.
  - `guideline_sections` — FK to brand, `label`, `body` (jsonb — ProseMirror doc), integer `priority`, `createdBy` pgEnum, timestamps. Index on `(brand_id, priority)` for ordered reads.
  - `projects` — `kind` pgEnum (`freeform | standardized`), `template_id text nullable` (app-layer enforces non-null when `kind = 'standardized'`), FK to brand.
  - `canvases` — `project_id` FK + **unique** (one canvas per project in V1).
  - `canvas_blocks` — one wide table with nullable per-kind columns (`body`, `blob_key`, `alt`, `width`, `height`, `filename`, `mime`) rather than table-per-kind, matching shared's discriminated union. Carries `is_pinned` / `pinned_at`, `created_by`, `deleted_at`, integer `position`. Three partial indexes: active layout `(canvas_id, position) WHERE deleted_at IS NULL`, shortlist `(canvas_id) WHERE deleted_at IS NULL AND is_pinned = true`, and `(canvas_id, deleted_at)` for housekeeping.
  - `canvas_events` — append-only. FK to canvas, `block_id uuid` **without FK** (log survives any future hard-delete path), op
    + actor pgEnums, `user_id` FK `ON DELETE set null`, `payload` jsonb. Only `created_at` — no `updated_at`. Indexes: `(canvas_id, created_at desc)` for the canvas timeline and `(block_id, created_at desc) WHERE block_id IS NOT NULL` for per-block history.
- **Mappers.** `src/mappers.ts` — row → shared-type converters for workspaces, brands, guideline sections, projects, canvases, and canvas blocks. `rowToProject` discriminates on `kind`; throws on a null `template_id` when kind is `standardized`. `rowToCanvasBlock` reconstructs the discriminated union on read and throws on missing per-kind columns — a loud data-integrity signal, not a silent fallback.
- **Query helpers (18, grouped by aggregate).** Dumb CRUD, no business rules. Inputs typed against `@brandfactory/shared` where they map 1:1, returns flow back through the mappers.
  - `users.ts` — `getUserById`, `getUserByEmail`, `createUser`. `User` type exposed as the inferred row (shared doesn't model users yet).
  - `workspaces.ts` — `getWorkspaceById`, `listWorkspacesByOwner`, `createWorkspace`.
  - `brands.ts` — `getBrandById`, `listBrandsByWorkspace`, `createBrand`, `listSectionsByBrand`, `upsertSection` (update when `id` supplied, insert otherwise), `reorderSections` (wrapped in a single transaction).
  - `projects.ts` — `getProjectById`, `listProjectsByBrand`, `createProject` with a distributive union input so `standardized` projects carry `templateId` at the type level.
  - `canvas.ts` — `getCanvasByProject`, `listActiveBlocks`, `createBlock` (switches on `kind` to build the insert payload), `updateBlock`, `softDeleteBlock`, `restoreBlock`, `setPinned` (stamps / clears `pinned_at`), `getShortlistView` (joins `canvases` to filter by `projectId` and returns `ShortlistView`).
  - `events.ts` — `appendCanvasEvent`, `listCanvasEvents` (supports `since` + `limit`, `desc(created_at)`), `listBlockEvents` (`asc(created_at)`, carries `IS NOT NULL` so the partial index on `block_id` is usable).
- **Barrel.** `src/index.ts` re-exports `db`, `pool`, the full schema barrel, and every query module.

### Local dev Postgres — `docker/` + repo-root `.env.example`

- `docker/compose.yaml` — single `postgres:16` service, `brandfactory`/`brandfactory`/`brandfactory` user/password/database, port 5432, named volume `postgres_data`, `pg_isready` healthcheck.
- `docker/README.md` — one paragraph: `up -d postgres` to start, `down -v` to nuke.
- Repo-root `.env.example` — single `DATABASE_URL` line matching the compose credentials. Also documents that drizzle-kit does not auto-load `.env` — export or prefix the command.
- `.prettierignore` — excludes `packages/*/drizzle/` so generated migration artifacts don't fail `format:check`.

### Smoke check — `packages/db/scripts/smoke.ts`

Runs end-to-end against the docker Postgres after `db:generate` + `db:migrate`. Creates a user, workspace, brand, two guideline sections, a freeform project, a canvas (direct insert — no `createCanvas` helper yet), a pinned text block, appends `add_block` + `pin` events, asserts the shortlist contains exactly one block, soft-deletes it, appends `remove_block`, asserts shortlist empty, and finally asserts `listBlockEvents` returns `[add_block, pin, remove_block]` in chronological order. Closes the pool in `finally`. Exits 0 on success, non-zero on assertion failure. Idempotent re-runs aren't a goal — canonical reset is `docker compose down -v`.

### Drizzle / pg API notes

- `pgTable` third argument is an array (`(table) => [...]`) in drizzle-orm 0.36, not the object form from older releases.
- Partial indexes use `.where(sql\`…\`)` on the index builder — generates the `WHERE …` clause verbatim in the migration SQL.
- `timestamp(..., { withTimezone: true, mode: 'string' })` gives `timestamptz` columns that round-trip as ISO-8601 strings, which is what `z.iso.datetime()` in shared already expects.
- `pgEnum` values land as a real `CREATE TYPE` in the migration; adding a value later is a one-liner (`ALTER TYPE ADD VALUE`), removing a value is not — that trade-off is accepted for the value sets defined here.
- `defaultRandom()` on a `uuid` column compiles to `DEFAULT gen_random_uuid()`; Postgres 13+ has it built in, no `pgcrypto` extension required.

### Phase 2 completion record — `docs/completions/phase2.md`

Phase-level wrap with per-task records (`phase2-task1.md` through `phase2-task7.md`). Captures the nine locked design decisions delivered as specified, how each open question landed (enums kept as `pg_enum`, no FK on `canvas_events.block_id`, position rebalancing deferred until first collision, strict 1:1 canvas-per-project, plain jsonb event payloads validated at the app layer), and the cross-cutting changes outside `packages/db` (shared amendments, docker compose, repo `.env.example`, `.prettierignore`). Also documents what Phase 2 explicitly did *not* include (no auth / realtime / HTTP routes / agent_messages / seed data / multi-service compose / RLS — all per the plan's exclusion list) and the three intentional omissions from the plan itself: no build pipeline (exports `src/index.ts` directly, matching every other `workspace:*` package), no `createCanvas` helper (the plan's Task 4 list didn't include it), no parse-at-boundary runtime validation on reads (casts suffice for trusted rows; Phase 9 hardening owns that call).

### Verification

All green against a running docker-compose Postgres:

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

---

## 0.2.0 — 2026-04-18

First runtime code in the repo. `@brandfactory/shared` is now the wire contract every other package builds against: schema-first with zod, types inferred, zero business logic, one runtime dep (`zod ^4.3.6`). Both `packages/server` and `packages/web` depend on it via `workspace:*` and successfully parse a `BrandSchema` payload end-to-end.

### Phase 1 execution plan — `docs/executing/phase-1-shared-package.md`

- Expanded Phase 1 of the scaffolding plan into a concrete, methodical file-by-file task list before any code was written.
- Locked five design decisions up front: brand guidelines are fully dynamic (no category enum), sections are normalized (their own table in Phase 2), suggested categories ship as seed data, section body = ProseMirror/TipTap JSON, concurrency v1 = section-level last-write-wins.
- Enumerated open questions with leanings (`createdBy` on sections, integer `priority`, derived `ShortlistView`) so execution had clear defaults.

### Phase 1 implementation — `packages/shared`

Nine source files under `src/`, grouped by domain, behind a single barrel.

- **Primitives.** `json.ts` — recursive `JsonValue` + `ProseMirrorDoc` alias (typed as generic JSON at the schema boundary; TipTap enforces ProseMirror validity client-side). `ids.ts` — `brandedId<TBrand>()` helper plus eight concrete branded ids (`BrandId`, `WorkspaceId`, `ProjectId`, `CanvasId`, `CanvasBlockId`, `PinId`, `SectionId`, `UserId`). Runtime is a plain string; the compile-time type is nominal so `BrandId` and `ProjectId` are not interchangeable.
- **Workspace.** `workspace/workspace.ts` — `id`, `name`, `ownerUserId`, timestamps. No membership/permissions until multi-user flows land.
- **Brand + guidelines.** `brand/brand.ts` exports three schemas: `BrandSchema` (the row, no embedded sections), `BrandSummarySchema` (`pick` projection for list/picker surfaces) and `BrandWithSectionsSchema` (API-level join shape). `brand/guideline-section.ts` — fully user-defined sections: free-text `label`, `body: ProseMirrorDoc`, sparse-integer `priority`, `createdBy: 'user' | 'agent'`, timestamps. No hardcoded category enum. `brand/suggested-categories.ts` — static `SUGGESTED_SECTIONS` seed (Voice & tone, Target audience, Values & positioning, Visual guidelines, Messaging frameworks) rendered by the frontend as a starter picker. Data, not schema.
- **Project + canvas.** `project/project.ts` — discriminated union on `kind`: `freeform` vs `standardized` (with `templateId`). `project/canvas.ts` — `CanvasSchema` container, `CanvasBlockSchema` 4-way discriminated union (`text`, `image`, `file`, `snippet`), `PinSchema`, and `ShortlistViewSchema` as a derived projection (not a stored entity). Base shapes are plain TS object literals spread into each branch, keeping zod's discriminated-union fast path intact.
- **Agent event stream.** `agent/events.ts` — `AgentMessageSchema`, `AgentToolCallSchema`, `CanvasOpSchema` (add-block / update-block / remove-block), `PinOpSchema` (pin / unpin), event-stream envelopes (`CanvasOpEventSchema`, `PinOpEventSchema`) and the outer `AgentEventSchema`. The outer union uses `z.union` rather than `z.discriminatedUnion` because two branches wrap an inner discriminated union on `op` — a pattern zod's discriminated-union fast path doesn't accept.
- **Conventions.** Schema-first with `z.infer` types, `z.iso.datetime()` at every timestamp, no defaults, no business logic, no validators or guards. ESM-only, zero runtime deps beyond `zod`.

### Consumer wiring

- `packages/server` and `packages/web` each gained `@brandfactory/shared: workspace:*` as a dependency. These wire-ups would have been needed by Phases 4 / 7 anyway; landing them now let the smoke check actually exercise the cross-package `import`.

### Zod 4 API notes

- Datetimes use `z.iso.datetime()` (zod 4 form; the v3 `z.string().datetime()` still works but is deprecated).
- Integers use `z.number().int()` — universal across zod 4 minor versions, no behaviour difference vs the top-level `z.int()` helper.
- `z.record(z.string(), V)` — zod 4 requires both key and value schemas.

### Phase 1 completion record — `docs/completions/phase1.md`

Full record of what was written, where, and why. Includes the five locked design decisions, the plan's open questions resolved with justification, and the in-flight refinements to the execution plan (`ProjectBase` / `CanvasBlockBase` as plain object literals, `AgentEventSchema` as `z.union`, `BrandSummary` added as a `pick` projection, `GuidelineSectionCreatedBySchema` / `PinCreatedBySchema` exported as separate enums to hedge against future divergence). Also documents the cross-package `BrandSchema.parse(...)` probe and what Phase 1 explicitly does *not* include (Drizzle schema, curation UI, Yjs/CRDT, prompt assembly, validators).

### Verification

All green on a fresh install:

```
pnpm install       ✔
pnpm lint          ✔  0 problems
pnpm typecheck     ✔  9/9 workspaces pass
pnpm format:check  ✔
```

End-to-end probe: `BrandSchema.parse(...)` round-trips from both `packages/server/src/index.ts` and `packages/web/src/index.ts` against a literal payload, typed with the inferred `Brand`. Probe reverted after verification — the runtime code still lives only in `packages/shared`.

---

## 0.1.0 — 2026-04-18

First tagged milestone. Lays the conceptual and structural groundwork for every phase that follows. No runtime code yet — the repo installs, lints, and typechecks on a flat pnpm workspaces skeleton.

### Vision & product docs

- **`docs/vision.md`** — full product vision. Brand as single source of truth; workspaces; projects (freeform and standardized templates); the universal Ideate → Iterate → Finalize loop; split-screen agent + canvas surface; who it's for; what's explicitly out of scope.
- **`docs/highlevel-vision.md`** — condensed one-pager version of the above, intended for README-style contexts.
- **`docs/ref/example-brand-wikis.md`** — reference material for brand guideline shapes we want to support.

### Architecture blueprint — `docs/architecture.md`

- Stack decision: **Vite + React + TS** (frontend), **Node + Hono + TS** (backend), **Drizzle on any Postgres** (Supabase as default adapter), **Vercel AI SDK** with **OpenRouter + Anthropic native + Ollama + OpenAI** as simultaneously-available LLM providers, selectable per workspace from a frontend settings page.
- Repo shape: flat `packages/*` monorepo (no `apps/` vs `packages/` split), scoped names `@brandfactory/*`, adapter sub-grouping under `packages/adapters/*`.
- Module boundaries documented for `shared`, `db`, `agent`, and `adapters`. `packages/agent` is explicitly **backend-only** — consumed by `server`, not by `web`. The wire contract (event shapes, tool-call signatures) lives in `packages/shared`.
- Ports-and-adapters pattern spelled out with concrete LLM/storage/auth examples. Domain code depends on the capability, not the vendor.
- Data-flow walkthrough, self-hosting story, extensibility surface, and pending decisions (auth for non-Supabase deployments, canvas conflict resolution, agent in-process vs worker, LLM settings storage).

### Scaffolding implementation plan — `docs/executing/scaffolding-plan.md`

- 10 phases (0 – 9) from repo foundation to hardening pass.
- Each phase defines a concrete outcome, a checkboxed task list, and a smoke check so it's unambiguous when the phase is done.
- Phases named by target directory (`packages/server`, `packages/web`) rather than `apps/` to match the flat layout.
- Explicit non-goals for the scaffolding effort (standardized templates, public shareable pages, CRDT collaboration, integrations, billing) so we don't scope-creep the foundation.

### Phase 0 implementation — repo foundation

Everything required to `pnpm install && pnpm lint && pnpm typecheck` on a fresh clone.

- **Root tooling:** `package.json` (scripts: `dev`, `build`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `prepare`), `pnpm-workspace.yaml`, `.nvmrc` (Node 20 LTS floor), `.editorconfig`, `.gitignore`, `.gitattributes`, `.prettierrc`, `.prettierignore` (`docs/` excluded so authored prose isn't auto-rewrapped), `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `isolatedModules`), root `tsconfig.json`, `eslint.config.js` (ESLint 9 flat config: `@eslint/js` recommended → `typescript-eslint` recommended → `eslint-config-prettier`), `.husky/pre-commit` running `pnpm lint-staged` on commit, `scripts/dev.sh` placeholder.
- **9 peer workspaces** created with matching `package.json` + `tsconfig.json` + `src/index.ts` stubs: `@brandfactory/web`, `@brandfactory/server`, `@brandfactory/shared`, `@brandfactory/db`, `@brandfactory/agent`, `@brandfactory/adapter-auth`, `@brandfactory/adapter-storage`, `@brandfactory/adapter-realtime`, `@brandfactory/adapter-llm`.
- **Dev tooling pinned:** ESLint 9, Prettier 3, TypeScript 5.6, typescript-eslint 8, husky 9, lint-staged 15, `@types/node` 22. No runtime dependencies yet — those land with the phases that need them.

### Phase 0 completion record — `docs/completions/phase0.md`

Full record of what was written, where, and why, including decisions made during execution (e.g. deferring TypeScript project references, excluding `docs/` from Prettier, keeping pre-commit fast by leaving `tsc` out of the hook). Also lists what Phase 0 explicitly does *not* include so Phase 1 can land without ambiguity.

### Verification

All green on a fresh install:

```
pnpm install       ✔
pnpm lint          ✔  0 problems
pnpm typecheck     ✔  9/9 workspaces pass
pnpm format:check  ✔
```
