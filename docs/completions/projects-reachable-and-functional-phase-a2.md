# Projects reachable + functional — Phase A.2 completion (`NewProjectDialog`)

**Status:** shipped — modal dialog for creating a freeform project under a brand. Co-located in `brands.$brandId.tsx`; **not yet rendered** by the page (A.3 wires it).
**Plan source:** [docs/executing/projects-reachable-and-functional.md §Step A.2](../executing/projects-reachable-and-functional.md).
**Verification:** `pnpm --filter @brandfactory/web typecheck` · `pnpm --filter @brandfactory/web lint` · `pnpm format:check` · `pnpm --filter @brandfactory/web test` — all green (56 web tests passing, unchanged).
**Builds on:** [Phase A.1](./projects-reachable-and-functional-phase-a1.md) (`useCreateProject` hook).

A.2 lands the component shell — a controlled `Dialog` with a single `name` field, mutation handling, optimistic dialog close, and navigation to the new project's detail route on success. By itself it changes no UX: the dialog is defined but unrendered, just like A.1's hook was uncalled. A.3 renders both together when it adds the Projects section to the brand page.

## What changed

One file modified:

- `packages/web/src/routes/brands.$brandId.tsx`
  - Added `useNavigate` to the `@tanstack/react-router` import.
  - Added `useCreateProject` to the existing import from `@/api/queries/brands`.
  - Added the full `@/components/ui/dialog` re-export set (`Dialog`, `DialogContent`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger`).
  - Added `NewProjectDialog({ brandId })` component immediately above `BrandEditorPage`, prefixed with a single-line `eslint-disable` marker because the dialog is intentionally unused until A.3.

The component mirrors `NewBrandDialog` in `workspaces.$wsId.index.tsx` (lines 23–101): same `Dialog` / `DialogTrigger` / `DialogFooter` structure, same external-`<form>` + `form="..."` submit-button pattern (so the footer button submits the form without nesting), same `disabled={!name.trim() || mutation.isPending}` gating, same `'Creating…' | 'Create'` label switch, same `toast.error(err instanceof AppError ? err.message : 'Failed to create project')` shape.

## Why these choices

**Co-location, not extraction.** `NewBrandDialog` is co-located inside `workspaces.$wsId.index.tsx`; the plan asked for the same here. Extracting both to a shared `components/dialogs/` folder is premature until a third dialog appears — until then, the duplication is mechanical and visible at the point of use, which beats one-more-file indirection.

**`onSuccess` on the `mutate` call, not on the hook.** `useCreateProject` (Phase A.1) declares one `onSuccess` that invalidates the list cache — that's the only cache effect every consumer wants. Per-call concerns (close the dialog, clear the form, navigate to detail) live on the `mutate` invocation in this component. TanStack Query runs **both** `onSuccess`es in order (hook-level first, then per-mutate). That's the pattern `BrandEditorForm.save()` (lines 183–190) already uses for the guidelines save → reset → toast flow, and the pattern transfers cleanly.

**No `kind` picker in the UI.** Submit payload is hard-coded `{ kind: 'freeform', name: trimmed }`. The shared schema (`CreateProjectInputSchema`) supports both `freeform` and `standardized`, but the standardized variant requires a `templateId` and no templates are registered yet (review Q5). A disabled "Standardized templates (coming soon)" picker would telegraph the roadmap but, as I argued in the question round, empty-roadmap surfaces look broken — omit until the day there's an option to pick. The hook from A.1 already accepts the full union, so this UI choice is reversible without touching the API layer.

**`name.trim()` checked twice.** Once in the submit-button `disabled` predicate (`!name.trim()`), once in the `onSubmit` early return (`if (!trimmed) return`). Belt-and-braces: a user can still trigger submit via Enter in the input even if the button isn't visible/clickable, and the submit handler should never POST whitespace.

**Why the placeholder `"Launch campaign"`.** Concrete and project-flavoured (matches the vision's "draft a campaign, sketch a product concept, plan a launch") rather than abstract like `"My project"`. `NewBrandDialog` uses `"Acme"` for the same reason — anchors the field with a recognisable example.

**No `id` collisions with the guidelines editor.** The dialog uses `id="project-name"` for both the form (`new-project-form`) and the input label htmlFor. `BrandEditorForm` only uses `label-${section._key}` ids (per-row UUID), so there's no collision risk even if both surfaces ever render simultaneously.

## The `eslint-disable` marker (and why)

The dialog is defined here but not yet rendered. ESLint's `@typescript-eslint/no-unused-vars` rule (configured: `Allowed unused vars must match /^_/u`) would flag `NewProjectDialog` as defined-but-never-used. Three options were on the table:

1. **Prefix with `_NewProjectDialog`.** Satisfies the underscore-convention escape hatch, but means renaming the symbol again in A.3. Two diffs where one would do.
2. **Bundle A.2 and A.3 into one phase.** Goes against the user's phase-by-phase ledger preference (see [Phase A.1 doc](./projects-reachable-and-functional-phase-a1.md)).
3. **`// eslint-disable-next-line @typescript-eslint/no-unused-vars`** with a one-line rationale pointing at A.3.

Chose option 3. The disable is scoped to one line, carries an inline reason that explains its lifespan (`consumed in Phase A.3 (Projects section on the brand page)`), and gets removed entirely the moment A.3 renders the dialog. Net debt across A.2 + A.3 is zero. The alternative — symbol-renaming for a single intermediate phase — would be more invasive and harder to spot in the A.3 diff.

This is the only line-level lint suppression in the file. If A.3 doesn't land (project paused, scope cut), the disable is the breadcrumb that explains why a finished-looking component exists with no caller.

## Verification

```
pnpm --filter @brandfactory/web typecheck   ✔ clean
pnpm --filter @brandfactory/web lint        ✔ clean (eslint-disable scoped to one line)
pnpm format:check                           ✔ all files formatted
pnpm --filter @brandfactory/web test        ✔ 56 passed (9 files)
```

No test count change. No runtime behaviour change — the dialog isn't reachable from the live UI yet.

## What this phase explicitly does NOT include

- **The Projects section on the brand page.** Phase A.3 lands the section heading, the project list, the "+ New project" trigger that mounts this dialog, and the page-header restructure (drop the "Brand guidelines" subtitle; place Projects above Guidelines).
- **A test for the dialog.** Phase A.5 lands a single RTL render test for the new page structure. Per the plan: no mutation-flow integration test — the hono RPC `$post` shape is type-checked at build time and the mutation body is fetch-glue (changelog line 374 call-out). If the manual smoke (Phase B) surfaces a regression, add coverage then.
- **A standardized-template picker.** Out of scope until at least one template exists in the registry.
- **A description / metadata field on the project.** The shared schema only has `name` (and `kind` discriminator); the dialog matches.

## Follow-up phases (preview)

| Phase | Scope | Status |
|---|---|---|
| A.3 | Projects section on `brands.$brandId.tsx`: header restructure (drop "Brand guidelines" subtitle), Projects above Guidelines, `ProjectCard` mirror of `BrandCard`, empty/loading/error states, mount `<NewProjectDialog brandId={…} />` and **remove the `eslint-disable` marker added here**. | Not started. |
| A.4 | Navigation no-op check (project card → detail, `TopBar` breadcrumb back to brand, `← Workspace` back to workspace). | Not started. |
| A.5 | RTL render test for the brand page with projects + empty-state variants. | Not started. |
| B | End-to-end verification matrix (15 rows) + vision-bar observations. | Not started. |
