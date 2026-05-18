# Projects reachable + functional — Phase A.3 completion (Projects section on the brand page)

**Status:** shipped — the brand editor page now lists projects, exposes a "New project" trigger, and navigates to project detail on card click. Phase A.1 + A.2 + A.3 together make Projects **reachable from the live UI** for the first time.
**Plan source:** [docs/executing/projects-reachable-and-functional.md §Step A.3](../executing/projects-reachable-and-functional.md).
**Verification:** `pnpm --filter @brandfactory/web typecheck` · `pnpm --filter @brandfactory/web lint` · `pnpm format:check` · `pnpm --filter @brandfactory/web test` — all green (56 web tests passing, unchanged).
**Builds on:** [Phase A.1](./projects-reachable-and-functional-phase-a1.md) (`useCreateProject`) · [Phase A.2](./projects-reachable-and-functional-phase-a2.md) (`NewProjectDialog`).

A.3 is the visible phase. Until this lands, `useCreateProject` had no caller and `NewProjectDialog` had no parent — both sat behind underscores and eslint-disables, mechanically correct but invisible. After A.3 the user can: open a brand → see existing projects (or an empty state) → click "New project" → name it → land on the split-screen workspace. The entire daily-use entry the vision describes ("open the brand → start/resume a project") works for the first time.

## What changed

One file modified — `packages/web/src/routes/brands.$brandId.tsx`:

- Added `Project` to the shared-types import.
- Expanded the `@/api/queries/brands` import to pull in `useBrandProjects` alongside `useBrand`, `useCreateProject`, `useUpdateBrandGuidelines`.
- **Removed the `// eslint-disable-next-line` marker** that A.2 added above `NewProjectDialog` — the dialog now has a real caller, so the unused-vars suppression is gone.
- Added two new components above `BrandEditorPage`:
  - `ProjectCard({ project })` — clickable card mirroring `BrandCard` in `workspaces.$wsId.index.tsx`. Shows `project.name` (semibold) + `Created <date>` (muted). Navigates to `/projects/$projectId` on click.
  - `ProjectsSection({ brandId })` — wires `useBrandProjects(brandId)`, renders a `<section>` with an `<h2>Projects</h2>` heading + `<NewProjectDialog brandId={...} />` trigger on the right, plus loading / error / empty / populated states underneath.
- Restructured the page body of `BrandEditorPage`:
  - **Dropped the `<p>Brand guidelines</p>` subtitle** beneath the brand-name `<h1>` (Q1 decision: the page is no longer guidelines-only, so the subtitle was misleading; two section headings carry the structure).
  - **Inserted `<ProjectsSection>` above** the guidelines.
  - **Wrapped the guidelines in their own `<section className="border-t pt-6">`** with an `<h2>Guidelines</h2>` heading. The `border-t` is the visual divider between the two sections that the plan's mockup called for.
  - Moved the brand loading/error states **inside the Guidelines section** — they're about the guidelines data, not the projects data, which has its own independent fetch.

Net: one new section visible above the existing editor; one subtitle removed; both data fetches independent.

## Why these choices

### Q1 — Header subtitle dropped (option a)

Three options were on the table for the page header (review question 1):

- **(a)** Drop the subtitle. Two section headings ("Projects", "Guidelines") carry structure.
- **(b)** Rename to "Identity" or "Overview" — page-as-brand-home framing.
- **(c)** Split into sub-routes (`/brands/$brandId` projects-only, `/brands/$brandId/guidelines` editor).

Picked **(a)**. Reasons:

- The subtitle in the pre-A.3 page (`Brand guidelines`) was descriptive of the *entire* page content because guidelines were the only thing on it. Once projects sits above guidelines, that descriptor becomes false. Keeping it (or renaming to "Overview") would actively mislead — a subtitle implies "what this page is", and the page now is "the brand". The `<h1>{brand.name}</h1>` carries that already.
- **(c)** is the right answer eventually, once Shortlist and Finalize surfaces also land and the brand page becomes a three-or-four-tab home. But at A.3 the page has two sections; a tab bar would feel ceremonial. Re-introducing routing structure when there's something to navigate between (vision items #3–#4, deferred per the plan) is the cleaner reversal of (a).
- **(b)** is the worst of the three: it preserves UI clutter (a subtitle) for no informational gain.

### Q2 — Projects above Guidelines

Argued for in the plan ("daily-use flow: open brand → resume project"). Confirmed in the question round. The implementation here matches: `ProjectsSection` renders first, the `border-t` divider then visually separates the slower-moving guidelines artifact below.

Caveat I want to flag: scroll cost. The guidelines form can grow long (many sections with rich text). When a user reloads on a brand with many guidelines, "the project I want to open" is now above the fold and the editor below. That's the intended trade-off. If a user complains about it, the natural escape hatch is (c) above — split into routes — not flipping the order.

### Q3 — Empty-state copy

"No projects yet. Create one to start brainstorming with the agent." — single line, muted, inline (not centered). Matches the plan verbatim. Two micro-decisions:

- **Inline `<p>`, not centered hero**, because this is one section of two — a centered full-page empty state would be visually heavier than the section itself. The brand-list empty state on the workspaces page IS centered, but that's the *whole* page's empty state; here it's one section's.
- **"brainstorming with the agent"** matches the vision's framing ("Ideate → chat back and forth with an agent that has full brand context"). The marketing-flavoured alternative ("Ideate → Iterate → Finalize. Start a project to begin.") was rejected as off-tone for an empty state.

### Q4 — `ProjectCard` shows only name + createdAt

Argued for in the plan: more fields = more queries/computation; ship lean. Specifically rejected:

- **`updatedAt`.** `Project` has it from `packages/shared/src/project/project.ts:11`, no extra query needed. But "Created on" and "Last opened on" tell *different* stories — recency-sort is a layer-on later, and a card with both dates is noisy. Single date wins until there's a real "which one did I leave off in" pain point.
- **Block count / last assistant message preview.** Both require `ProjectDetail`-shaped data; the list endpoint returns `Project[]` only. Bringing per-card detail in would either over-fetch on list load or fire N additional requests. Defer until the value justifies the cost.

Cards use the same `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]` grid as `BrandCard`, so a brand page with both a project list and a brand list (workspaces page) has visual rhythm.

### Independent fetches for brand and projects

The plan was explicit: "Independent of the brand load — the page still renders if projects fail." Implementation matches:

- `useBrand(brandId)` and `useBrandProjects(brandId)` are two separate TanStack Query subscriptions.
- `ProjectsSection` lives outside the `brand &&` guard in `BrandEditorPage`. It's keyed by `brandId` from the route params (always available), not by the brand's loaded state.
- The guidelines loading/error UI lives *inside* the Guidelines `<section>`, scoped to that fetch.

Consequence: a project list can render while guidelines are still loading, and a guidelines load failure doesn't blank the projects. Both fetches share the same auth token, so a 401 trips both at once — but that's the right behaviour (kick to login).

### `<section>` not `<div>` for both blocks

Semantic HTML in two places — `ProjectsSection` and the Guidelines wrapper. Each is a top-level region of the page with its own heading. Future a11y / outline tooling reads them as siblings. The brand header (back link + `<h1>`) intentionally stays as a `<div>` because it's the page header, not a content section.

### The `border-t pt-6` divider

Single horizontal rule between Projects and Guidelines. Matches the plan's mockup. No `mt-10` on the Guidelines section because `ProjectsSection` already has `mb-10`; doubling would over-space. The padding-top (`pt-6`) gives the divider visible breathing room from the section heading.

## Verification

```
pnpm --filter @brandfactory/web typecheck   ✔ clean
pnpm --filter @brandfactory/web lint        ✔ clean (eslint-disable from A.2 removed)
pnpm format:check                           ✔ all files formatted
pnpm --filter @brandfactory/web test        ✔ 56 passed (9 files)
```

No test count change yet — A.5 adds the render test. Manual smoke is in the Phase B matrix.

## What this phase explicitly does NOT include

- **Render test for the new page structure.** Lands in Phase A.5 (one RTL test with two cache variants: 2 projects + empty state).
- **Navigation confirmation.** Phase A.4 is a no-op verification step in a browser — forward via `ProjectCard`, back from project via `TopBar` breadcrumb, back from brand via `← Workspace` link.
- **Project rename / delete / archive.** Out of scope (Q8 / plan §Scope).
- **Standardized-template picker on the dialog.** Out of scope (Q5 / Phase A.2 §Why no `kind` picker).
- **Shortlist view, soft-delete, finalize → promote-to-guidelines.** Tracked separately; would justify the (c) header restructure when they land.
- **Project card recency-sort or "last opened" metadata.** Deferred per Q4.

## Follow-up phases (preview)

| Phase | Scope | Status |
|---|---|---|
| A.4 | Browser-side navigation no-op check (`ProjectCard` → detail, `TopBar` breadcrumb, `← Workspace`). | Not started. |
| A.5 | RTL render test for `BrandEditorPage` with projects + empty-state variants. | Not started. |
| B | End-to-end verification matrix (15 rows) + vision-bar observations. | Not started. |
