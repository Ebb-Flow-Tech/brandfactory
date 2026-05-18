# Projects reachable + functional — Phase A.4 completion (navigation no-op check)

**Status:** shipped — code-side audit of all three navigation paths (brand→project, project→brand, brand→workspace) confirms they are correctly wired. **No code change in this phase.** Browser-side visual confirmation is a user/operator step, deferred to Phase B.
**Plan source:** [docs/executing/projects-reachable-and-functional.md §Step A.4](../executing/projects-reachable-and-functional.md).
**Verification:** static read of routes + components. No new tests, no diff. Existing checks unchanged: `pnpm --filter @brandfactory/web typecheck` · `pnpm --filter @brandfactory/web lint` · `pnpm format:check` · `pnpm --filter @brandfactory/web test` all green (56 web tests).
**Builds on:** [Phase A.1](./projects-reachable-and-functional-phase-a1.md) · [Phase A.2](./projects-reachable-and-functional-phase-a2.md) · [Phase A.3](./projects-reachable-and-functional-phase-a3.md).

A.4 exists because the plan correctly anticipated that **the three nav paths Threads A depends on already exist**, and that "verifying they still work" is its own phase rather than a no-op subsection of A.3. Documenting that explicitly keeps the per-phase ledger honest — A.3 added a navigation site (the project card), A.4 confirms the round-trip closes.

## The three paths, audited

### 1. Forward: brand → project (new in A.3)

- **Site:** `packages/web/src/routes/brands.$brandId.tsx` — `ProjectCard.onClick`.
- **Code:**
  ```ts
  void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
  ```
- **Target route:** `packages/web/src/routes/projects.$projectId.tsx:52` — `path: '/projects/$projectId'`, gated by `getAuthToken()` (login redirect if absent).
- **Status:** ✅ wired. Type-checked end-to-end: `Project.id` is `ProjectIdSchema` (UUID v4), the route's `useParams` returns `{ projectId: string }`, and `useProjectDetail(projectId)` is the first call in `ProjectPage`.

### 2. Back from project: project → brand

- **Site:** `packages/web/src/components/project/TopBar.tsx:7–13`.
- **Code:**
  ```tsx
  <Link to="/brands/$brandId" params={{ brandId: brand.id }} ...>
    {brand.name}
  </Link>
  ```
- **Mount:** `ProjectPage` renders `<TopBar project={data} brand={data.brand} />` (`projects.$projectId.tsx:35`). `data.brand` is part of `ProjectDetail` from the GET endpoint, so the breadcrumb always has the brand object — no extra round-trip.
- **Target route:** `packages/web/src/routes/brands.$brandId.tsx` — the route we just restructured in A.3.
- **Status:** ✅ wired, pre-existing from Phase 7. After A.3 lands, returning here puts the user back on the brand page with the just-created project visible in the list (cache invalidation from `useCreateProject`'s `onSuccess` in A.1 + TanStack Query's refetch on focus close the loop).

### 3. Back from brand: brand → workspace

- **Site:** `packages/web/src/routes/brands.$brandId.tsx:370–382`.
- **Code:**
  ```tsx
  {brand ? (
    <Link to="/workspaces/$wsId" params={{ wsId: brand.workspaceId }} ...>← Workspace</Link>
  ) : (
    <Link to="/workspaces" ...>← Workspaces</Link>
  )}
  ```
- **Target routes:** `/workspaces/$wsId` (workspace detail) and `/workspaces` (list) both exist.
- **Status:** ✅ wired, pre-existing. The branch on `brand` (loaded vs. not-yet-loaded) is the right degradation — without a loaded `brand` we don't know which workspace to return to, so the list is the sensible fallback. A.3 did not touch this code.

## What "no-op check" means here

The plan explicitly framed A.4 as verification, not as a change. There are three things that could have come out of an A.4 audit:

1. **All three paths are correctly wired.** ← This case. Document and move on.
2. **One path is wired but to the wrong target** (e.g. TopBar links to `/workspaces/$wsId` instead of `/brands/$brandId`). Would have meant a one-line fix in this phase.
3. **A path is missing entirely.** Would have meant a small new edit + a follow-up note in this doc.

Outcome: case 1. No edit, no test, no completion-side bug to file. The completion doc is the artefact.

## What this phase explicitly does NOT include

- **Browser confirmation.** Static type-checking confirms the routes/params line up; it does not confirm the live navigation animates correctly, that focus management is sane, or that the back-from-project breadcrumb actually paints the brand name from realtime cache vs. fetch. Those are visual / runtime properties that need eyes on the screen. They're rolled into the Phase B matrix (rows 1, 11, 12 specifically).
- **Edge-case nav checks.** What happens when a user navigates to a project under a brand they no longer have access to? When the brand 404s while you're on its project? When the back-link is clicked mid-stream? Those are Phase B observation territory, not no-op-check territory.
- **Browser-history / `Cmd-[` behavior, deep-link resilience, scroll-restore on back nav.** Out of scope for this thread; would be a separate hardening pass.
- **`TopBar` redesign / additional breadcrumb levels.** Out of scope. The current `brand.name / project.name` shape is the convention.

## Why A.4 was worth doing as its own phase

Skipping A.4 would have left a small but real ambiguity: "I added a navigate-out site in A.3 — does the world it navigates to actually work?" The plan's per-phase ledger discipline rewards answering that explicitly. The cost is one short completion doc; the benefit is that A.5 + B can proceed assuming the three nav paths are accounted for, instead of inheriting an implicit assumption.

## Follow-up phases (preview)

| Phase | Scope | Status |
|---|---|---|
| A.5 | RTL render test for `BrandEditorPage` with projects + empty-state variants. | Not started. |
| B | End-to-end verification matrix (15 rows) + vision-bar observations. Rows 1, 11, 12 will exercise the three nav paths audited here. | Not started. |
