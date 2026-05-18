# Projects reachable + functional — Phase A.1 completion (`useCreateProject` hook)

**Status:** shipped — frontend mutation hook for creating a freeform/standardized project under a brand.
**Plan source:** [docs/executing/projects-reachable-and-functional.md §Step A.1](../executing/projects-reachable-and-functional.md).
**Verification:** `pnpm --filter @brandfactory/web typecheck` · `pnpm --filter @brandfactory/web lint` · `pnpm format:check` · `pnpm --filter @brandfactory/web test` — all green (56 web tests passing, unchanged count).

Phase A.1 is the first of several wiring steps that make Projects reachable from the brand page. By itself it changes no user-visible behaviour — it adds a hook that nothing yet calls. The point of landing it as its own phase is to keep the surface change auditable: API client glue moves separately from the UI that consumes it, mirroring the way `useBrandProjects` (the matching list hook) was landed in 0.7.3 ahead of any consumer.

## What changed

One file modified, three lines of imports + 15 lines of hook:

- `packages/web/src/api/queries/brands.ts`
  - Added `CreateProjectInput` to the existing type import from `@brandfactory/shared`.
  - Added `useCreateProject(brandId: string)` mutation hook below `useBrandProjects`.

```ts
export function useCreateProject(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await api.brands[':brandId'].projects.$post({
        param: { brandId },
        json: input,
      })
      return callJson<Project>(res)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
    },
  })
}
```

No backend change, no shared-schema change, no other file touched.

## Why these choices

**File placement — `brands.ts`, not `projects.ts`.** Query-hook files under `src/api/queries/` are scoped by **route prefix**, not domain. `POST /brands/:brandId/projects` lives under the brand route in the server (`packages/server/src/routes/projects.ts:31`), so the mutation that calls it lives in the brand query module — same way `useBrandProjects` (the GET list at the same route prefix) already does. A `projects.ts` query file is reserved for hooks that hit `/projects/:id*` routes (detail, canvas, messages, etc., already scaffolded in 0.7.x).

**Input type — `CreateProjectInput` from shared.** The discriminated union (`{ kind: 'freeform', name }` | `{ kind: 'standardized', name, templateId }`) is already the validator shape on the server side, exported via `packages/shared/src/index.ts:23` (`export * from './project/create'`). Accepting it directly here means the hook accepts both kinds without UI-side knowledge of the discriminator; the dialog in Phase A.2 will hard-code `kind: 'freeform'` for v1 per the plan's scope, but the hook itself doesn't need to constrain that.

**Cache invalidation — `invalidateQueries`, not `setQueryData`.** The sibling hook `useUpdateBrandGuidelines` uses `setQueryData` to merge returned sections into the cached `BrandWithSections`; this hook deliberately doesn't. Three reasons:

1. The list cache (`brandKeys.projects(brandId)`) holds `Project[]`, and the new project is a fresh item to append, not a merge. A correct `setQueryData` would still be a one-liner (`old ? [...old, project] : [project]`), but…
2. The list is the only consumer that needs the new row to appear, and it's cheap to refetch — a single `GET /brands/:brandId/projects` returning `Project[]` (bare rows, no `ProjectDetail` expansion). Invalidate is more robust to server-side sort/filter changes (e.g. if the list ever starts sorting by recency, optimistic-append would put the row in the wrong place).
3. Phase A.2's `NewProjectDialog` navigates to `/projects/$projectId` on success — the user lands on the detail page, not the list. The list cache refresh happens out-of-band before the user navigates back. No perceived latency.

**`void` on the invalidate.** `invalidateQueries` returns a `Promise<void>` representing the refetch. The mutation's `onSuccess` doesn't need to await it (the next user action is navigation, not a re-read of the list). `void` silences the `no-floating-promises` lint that the eslint-config opts into for the web package.

**No new tests in this phase.** Per the plan's Step A.5: the hono RPC `$post` shape is already type-checked at build time, and the mutation body is a thin `fetch`-glue layer. The plan explicitly skips an integration test here, citing the same call-out used for `uploadBlob` (changelog line 374). The render test for the dialog lands in Phase A.5 once the dialog itself exists.

## Verification

All workspace-scoped checks pass against the modified package:

```
pnpm --filter @brandfactory/web typecheck   ✔ clean
pnpm --filter @brandfactory/web lint        ✔ clean
pnpm format:check                           ✔ all files formatted
pnpm --filter @brandfactory/web test        ✔ 56 passed (9 files)
```

No test count change vs. 0.7.4 / 1.0.0 baseline (the web package's 56 cases). No other workspace touched.

## What this phase explicitly does NOT include

- **No UI surface.** The dialog (Phase A.2), the Projects section on the brand page (A.3), the navigation hookup (A.4), and the render test (A.5) land in subsequent phases under separate completion docs.
- **No projects-scoped query file.** `packages/web/src/api/queries/projects.ts` is unchanged. Project-detail hooks (`useProjectDetail`, `useProjectStream`) already live in their own modules from Phase 7; the create hook does not belong there because the route is brand-scoped.
- **No standardized-template support in callsites.** The hook accepts `CreateProjectInput` (both kinds), but Phase A.2's dialog will submit `kind: 'freeform'` only. A standardized-template picker waits until at least one template is registered (review Q5).
- **No optimistic update.** As argued above — list cache invalidates on success; the detail-page navigation absorbs any perceived latency.

## Follow-up phases (preview)

| Phase | Scope | Status |
|---|---|---|
| A.2 | `NewProjectDialog` component co-located in `brands.$brandId.tsx`. | Not started. |
| A.3 | Projects section on the brand editor page (drop "Brand guidelines" subtitle, add Projects above Guidelines). | Not started. |
| A.4 | Navigation no-op check (forward / back-via-`TopBar` / back-via-`← Workspace`). | Not started. |
| A.5 | RTL render test for the brand page with projects + empty-state variants. | Not started. |
| B | End-to-end verification matrix (15 rows) + vision-bar observations. | Not started. Pre-checks adjusted: no `db:seed` per review Q6 — starts from a freshly-created brand. |
