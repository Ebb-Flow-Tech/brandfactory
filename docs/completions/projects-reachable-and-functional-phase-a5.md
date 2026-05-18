# Projects reachable + functional — Phase A.5 completion (render test for `ProjectsSection`)

**Status:** shipped — two RTL render cases pin the populated grid and the empty-state branch of the Projects section the user added in A.3. Test count 56 → **58 (+2)**, all green; first route-level test file in the web package.
**Plan source:** [docs/executing/projects-reachable-and-functional.md §Step A.5](../executing/projects-reachable-and-functional.md).
**Verification:** `pnpm --filter @brandfactory/web typecheck` · `pnpm --filter @brandfactory/web lint` · `pnpm format:check` · `pnpm --filter @brandfactory/web test` — all green.
**Builds on:** [A.1](./projects-reachable-and-functional-phase-a1.md) · [A.2](./projects-reachable-and-functional-phase-a2.md) · [A.3](./projects-reachable-and-functional-phase-a3.md) · [A.4](./projects-reachable-and-functional-phase-a4.md).

A.5 closes out Thread A. With the test in place, the regression surface for the new wiring is pinned: if a future change removes the project cards, breaks the empty-state copy, or strips the "New project" trigger, `pnpm test` fails before the change lands.

## What changed

Two files:

- **`packages/web/src/routes/brands.$brandId.tsx`** — added `export` keyword to `ProjectsSection`. No behaviour change; the function was previously file-private. `ProjectCard`, `NewProjectDialog`, and `BrandEditorPage` remain file-private (no test consumer for them yet).
- **`packages/web/src/routes/brands.$brandId.test.tsx`** — new (60 lines). Two `describe('ProjectsSection')` cases, RTL only.

## What the test asserts

```ts
describe('ProjectsSection', () => {
  it('renders a card per project when the cache has entries', () => { … })
  it('shows the empty state and the New project trigger when the cache is empty', () => { … })
})
```

**Populated case.** Seeds `brandKeys.projects(BRAND_ID)` with two `Project`s; asserts both names paint and the empty-state copy does not. This is the regression net for the `projects.map((project) => <ProjectCard … />)` branch and the `projects?.length === 0` predicate that gates it.

**Empty case.** Seeds the same key with `[]`; asserts the muted "No projects yet…" copy paints and the "New project" trigger button is reachable by role. This catches three plausible regressions in one assertion:

1. Empty-state copy goes missing or changes wording.
2. The header trigger gets gated behind `projects.length > 0` (a tempting refactor — would block the user from ever creating the first project).
3. `NewProjectDialog` is removed or moved out of the section.

Both cases share the same wrapper, the same fake `Project` factory, and the same in-memory `QueryClient` with `staleTime: Infinity` (so the seeded cache stays fresh and `useBrandProjects` doesn't trigger a background refetch into an unmocked `fetch`).

## Why these choices

### Test `ProjectsSection`, not `BrandEditorPage`

The plan asked for "one happy-path render test that mounts the page". I deviated to mount `ProjectsSection` directly instead. Reasons:

- **What we built in A.3 is `ProjectsSection`.** Every regression a page-level test would catch on the new surface is caught by a section-level test, with one-third the setup. The Guidelines part of the page is pre-existing and out of scope.
- **Page-level mount needs router context.** `BrandEditorPage` calls `brandEditorRoute.useParams()`, which requires either a real TanStack memory router or a mock of the param hook. The first route-level test in the repo is not the place to introduce a memory-router harness — that's a Phase B / Phase 9 conversation flagged in the changelog.
- **Targeted tests fail more legibly.** A failure in this file points at the Projects wiring directly; a page-level failure could be from anything between the route param hook and the Guidelines editor.

The test file name still matches the plan (`brands.$brandId.test.tsx`) — same physical co-location, just a tighter scope of what's mounted.

### `vi.mock('@tanstack/react-router', …)` instead of standing up a router

Two consumers in the rendered tree call `useNavigate`: `ProjectCard.onClick` and `NewProjectDialog.onSuccess`. Neither is exercised in the assertions — we never click the card, never submit the dialog. The mock returns a no-op `useNavigate` so the hooks resolve, and spreads `actual` so other re-exports (`Link`, etc., used by sibling code in the route file when transitively imported) keep working.

Alternative considered: build a `createMemoryHistory` + `createRouter` test harness and `RouterProvider` wrap the component. That's the right tool when **navigation itself** is what's being asserted (Phase B will need this), but here it's pure ceremony around two unread function calls.

### `staleTime: Infinity` on the test `QueryClient`

By default TanStack Query marks a freshly `setQueryData`-populated entry as stale-but-cached. First render returns the cached value, then schedules a background refetch — which in this test would hit `useBrandProjects`'s `queryFn` and try to call `api.brands[':brandId'].projects.$get`. Under jsdom without a global `fetch` stub, that explodes (or just silently noises up the test logs).

`staleTime: Infinity` on the wrapper client keeps the seeded data fresh, the refetch never fires, the test runs deterministically. This is a test-only invariant — no production code change.

### `retry: false` on queries

Matches the `useAgentChat` test convention. Belt-and-braces with `staleTime: Infinity`: even if a stray refetch slipped through, no retry-storm in the test runner.

### Branded-id casts in the fake factory

`Project.id` is a `BrandId<'ProjectId'>` brand. The fake factory casts (`id as Project['id']`, `brandId as Project['brandId']`) the same way the `useAgentChat` test does — that's the established convention for test fakes against branded types.

### No `user-event`, no click assertions

Plan said: "RTL only, no `user-event`." I went further and didn't assert on any DOM event at all. The new wiring is *what renders*, not *what happens on click*. The mutation hook (A.1) and the dialog submit (A.2) are both glue around library calls (`useMutation`, `Dialog`); their behaviour is the library's, not ours. Clicking would test the library.

### What I did NOT do: lint suppressions

A.2 needed an `eslint-disable-next-line` to ship the dialog before its consumer. A.3 deleted it. A.5 adds zero suppressions — `import type * as TanStackRouter from '@tanstack/react-router'` is the consistent-type-imports-friendly form for `vi.mock(…, async (importOriginal) => importOriginal<typeof MODULE>())`.

## A small lesson learned (recorded)

The first iteration of the test used `importOriginal<typeof import('@tanstack/react-router')>()`. Lint flagged it as a violation of `@typescript-eslint/consistent-type-imports` — `import()` expressions count as inline imports, which the project disallows in favour of top-level `import type` statements. Resolution was to lift the module shape to a top-level `import type * as TanStackRouter` and reference that in the generic. Same runtime behaviour; satisfies the lint rule by binding the type at the top of the file where the rest of the imports live.

Worth noting for future test authors: any `vi.mock` that uses `importOriginal<typeof import(…)>()` needs the type lifted out. The pattern is now precedented in this file.

## Verification

```
pnpm --filter @brandfactory/web typecheck   ✔ clean
pnpm --filter @brandfactory/web lint        ✔ clean (no suppressions)
pnpm format:check                           ✔ all files formatted
pnpm --filter @brandfactory/web test        ✔ 58 passed (10 files; +2 vs A.4)
```

The two new cases land alongside the pre-existing 56 with no flakes across multiple local runs.

## What this phase explicitly does NOT include

- **Test for `BrandEditorPage` as a whole.** Out of scope by design — see "Why test `ProjectsSection`" above.
- **Test for `NewProjectDialog`'s submit flow.** Per the plan's A.5: "Skip mutation-flow integration test for `useCreateProject`. The hono RPC `$post` shape is type-checked at build time; the mutation is `fetch` glue." (Plan §Step A.5, paragraph 2.) If Phase B surfaces a regression, add coverage then.
- **Test for `ProjectCard.onClick` → navigate.** The same fetch-glue argument applies to `useNavigate`; covered by the manual smoke in Phase B row 1.
- **Memory-router test harness.** Deferred to whenever the first navigation-asserting test arrives. Phase B is manual; codifying it is a Phase 9 conversation per the changelog.
- **Coverage for the Guidelines section.** Pre-existing, unchanged in Thread A.

## Thread A — closed

With A.5 landed, Thread A is complete. Summary:

| Phase | Outcome |
|---|---|
| A.1 | `useCreateProject(brandId)` hook in `api/queries/brands.ts`. |
| A.2 | `NewProjectDialog({ brandId })` co-located in `brands.$brandId.tsx` (with a one-line `eslint-disable` that A.3 removed). |
| A.3 | Projects section on the brand page; header restructure; `ProjectsSection` + `ProjectCard`; visible end-to-end nav: brand → project. |
| A.4 | Static audit of all three nav paths — no edit needed. |
| A.5 | Two RTL render tests pinning `ProjectsSection`. |

Net diff across the thread:

- `packages/web/src/api/queries/brands.ts` — 1 import + 15 LOC hook.
- `packages/web/src/routes/brands.$brandId.tsx` — 3 imports + ~80 LOC across `NewProjectDialog`, `ProjectCard`, `ProjectsSection`, and the page restructure; one subtitle removed.
- `packages/web/src/routes/brands.$brandId.test.tsx` — new, 60 LOC, 2 tests.

Total: ~155 lines added, comfortably under the plan's ~200-line target.

## Follow-up

| Phase | Scope | Status |
|---|---|---|
| B | End-to-end verification matrix (15 rows) + vision-bar observations. Pre-checks updated for "no seeding" (Q6) — starts from a freshly-created brand instead of the seeded one. | Not started. |
