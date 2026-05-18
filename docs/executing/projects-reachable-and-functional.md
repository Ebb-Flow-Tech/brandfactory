# Projects: reachable + functional

Status: planning
Targets vision items: **Projects** (vision.md §Projects) and **the split-screen workspace** (vision.md §The workspace experience)

## Why this plan exists

Today a user can log in, create a workspace, create a brand, and edit guideline sections. Then they hit a wall. The vision puts **Projects** at the center — "creative work happens inside Projects attached to a workspace" — and the **split-screen workspace** (agent chat + canvas) is the daily-use surface of the product. Neither is reachable from the live UI.

What's surprising is that almost all the code already exists. Phase 7 (changelog 0.7.1–0.7.4) shipped:

- Server: `GET/POST /brands/:brandId/projects`, `GET /projects/:id` (full `ProjectDetail`), canvas CRUD, agent streaming, messages, blob upload.
- Frontend: `/projects/$projectId` route, `SplitScreen` + `TopBar` + `ChatPane` + `CanvasPane` components, `useProjectDetail` query, `useProjectStream` realtime subscription, `useAgentChat` SSE hook, `applyAgentEvent` cache writer, `ShortlistToggle` mode switcher.
- Even the `useBrandProjects` query hook exists in `packages/web/src/api/queries/brands.ts` — it's just never called.

The brand editor page (`packages/web/src/routes/brands.$brandId.tsx`) has **zero** project references. There is no list, no "New project" dialog, no link out to a project. The 0.7.3 changelog narrative claimed "create a project, open its split-screen" works end-to-end; the per-step records below it don't actually back that up, and the UI confirms it.

So this plan is two threads:

- **Thread A — Wiring.** Make Projects visible from a brand: list view, "New project" dialog, navigation to the detail page. Small, mechanical, no new backend.
- **Thread B — Verification.** Drive the now-reachable split-screen through every user motion the vision calls out, document what actually works vs. is broken vs. is genuinely missing. The output is a verification matrix and a follow-up bug/gap list — not new code unless something is broken on the critical path.

Thread A is a prerequisite for Thread B; they should land in the same change. The combined diff is small (one new mutation hook, one dialog component, one section on the brand page, plus tests).

## Scope: in / out

**In scope.**

- Freeform project list on the brand page.
- Freeform project creation (name only; backend already requires `kind: 'freeform'`).
- Navigation: brand → project → back to brand (TopBar's breadcrumb already does this).
- Empty-state, loading, and error states matching the brand-list page convention.
- Frontend unit tests for the new dialog (mirror `NewBrandDialog` coverage if present).
- A manual verification matrix run by a human in a browser, recorded in this doc on completion.

**Out of scope.**

- **Standardized project templates** (vision's social-media calendar). `CreateProjectInputSchema` supports the discriminator already; UI for picking a template waits until there's at least one template registered. Tracked in the follow-up roadmap, not here.
- **Shortlist view + soft-delete + finalize → promote-to-guidelines** (vision items #3–#4 from the prior conversation). Separate thread.
- **Project rename / delete / archive** — useful, not part of "reachable + functional". Defer.
- **Agent canvas-awareness depth pass** (vision: "what's pinned, what isn't, what's been added since the last message"). Verification will surface whether the current prompt is enough; depth work is a separate plan.
- **New Playwright / e2e harness.** The verification matrix is a manual checklist for v1; codifying it is a Phase-9 conversation already flagged in the changelog (line 374).

## Thread A — Wiring projects into the brand page

### Step A.1 — `useCreateProject` mutation hook

**File:** `packages/web/src/api/queries/brands.ts` (extend, do not create a new file — the hook is brand-scoped because `POST` lives at `/brands/:brandId/projects`).

Add:

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

`brandKeys.projects(brandId)` is already declared. `CreateProjectInput` is exported from `@brandfactory/shared`.

**Why brands.ts, not projects.ts.** Query-hook files in `src/api/queries/` are scoped by **route prefix**, not domain — `workspaces.ts` holds workspace-scoped lists/creates including brands-under-workspace; `brands.ts` should hold brand-scoped lists/creates including projects-under-brand. Mirrors the existing convention.

### Step A.2 — `NewProjectDialog` component

**Pattern:** mirror `NewBrandDialog` in `packages/web/src/routes/workspaces.$wsId.index.tsx` (lines 23–101). Same Dialog primitive, same form pattern, same `toast.error(AppError ? err.message : 'Failed to create project')` shape, same `onSuccess` → navigate to the new detail route.

**Inputs.** One required field: `name` (1–120 chars, validated by the shared schema). Submit button disabled until trimmed name is non-empty or mutation is pending.

**Submit payload.** `{ kind: 'freeform', name: name.trim() }`. We don't expose a kind picker until a standardized template exists; until then, freeform is the only legal value and a picker would be UI noise.

**On success.** `navigate({ to: '/projects/$projectId', params: { projectId: project.id } })`. The brand-list page does the same thing for brands; we keep the convention.

**Location.** Co-locate inside `brands.$brandId.tsx` rather than a separate file — `NewBrandDialog` is co-located the same way, and lifting it to a shared component is premature until we have a second consumer.

### Step A.3 — Projects section on the brand editor page

**File:** `packages/web/src/routes/brands.$brandId.tsx`

The current `BrandEditorPage` (lines 283–312) renders a header + the guidelines form. Add a **Projects** section above the guidelines form (rationale below), structured as:

```
[← Workspace]
Brand name
Brand guidelines  ← current subtitle, becomes ambiguous; change to "Identity" or remove

——————————————————————————

Projects                        [+ New project]
[project card] [project card] [project card]
  -- or empty state --

——————————————————————————

Guidelines (section heading, was the implicit page)
[guideline editor — unchanged]
```

**Why Projects above Guidelines.** Vision: projects are where work happens; guidelines are the slower-moving artifact promoted to from project work. The brand page is *both* a guidelines editor and a project launcher; ordering Projects first matches the daily-use flow ("open the brand → start/resume a project") and avoids scroll-past on long guideline lists.

**Project card.** Pattern after `BrandCard` (workspaces page, lines 103–120): clickable card, name + created-date + (if standardized in the future) kind badge. Navigates to `/projects/$projectId`.

**Empty state.** "No projects yet. Create one to start brainstorming with the agent." — single line, muted, no big illustration. Matches the brand-list empty state.

**Loading / error.** Match the brand-list patterns (`Loading…`, `Failed to load projects.`). Independent of the brand load — the page still renders if projects fail.

**Data wiring.** `useBrandProjects(brandId)` (already exists in `brands.ts`). One extra round-trip on brand page load; acceptable. Worth noting: `GET /projects/:id` returns `ProjectDetail` (project + canvas + blocks + shortlist + messages + brand); the list endpoint returns bare `Project[]` — that's the right shape, no over-fetching.

### Step A.4 — Navigation cleanup (no-op check)

- **Forward**: project card → `/projects/$projectId`. New, in Step A.3.
- **Back from project**: `TopBar.tsx` already renders `<Link to="/brands/$brandId">` with the brand name as breadcrumb. Verify in browser; no change expected.
- **Back from brand**: existing `← Workspace` link at the top of `BrandEditorPage` is fine.

### Step A.5 — Tests

**New:** `packages/web/src/routes/brands.$brandId.test.tsx` (or extend the existing test if one exists; check) — one happy-path render test that mounts the page with a brand + 2 projects in `useBrandProjects` cache + an empty-state variant. RTL only, no `user-event` (matches house style, changelog line 341).

**Skip:** mutation-flow integration test for `useCreateProject`. The hono RPC `$post` shape is type-checked at build time; the mutation is `fetch` glue (same call-out as `uploadBlob` in changelog line 374). If the manual smoke surfaces a regression, add coverage then.

**Existing suites must stay green.** `pnpm test` runs against 9 workspaces; nothing in this thread touches server, db, agent, or adapters.

### Files touched (Thread A, anticipated)

- `packages/web/src/api/queries/brands.ts` — add `useCreateProject`.
- `packages/web/src/routes/brands.$brandId.tsx` — add `NewProjectDialog`, `ProjectCard`, projects section, restructured header.
- `packages/web/src/routes/brands.$brandId.test.tsx` — new (or extend if it exists).

Net diff target: under ~200 lines added, all in the web package.

## Thread B — End-to-end verification

Once Thread A lands and a fresh `pnpm dev` boot exposes the path, run the matrix below in a browser against the local stack (`packages/server` on `:3001`, `packages/web` on `:5173`, dev Postgres + `db:seed`). Record pass/fail/notes inline in this doc on completion; the doc becomes a phase-completion record like `docs/completions/phase7-step-*.md`.

### Pre-checks

1. `pnpm db:seed` runs cleanly; the printed dev token logs in.
2. Seeded brand from `db:seed` (id `00000000-0000-4000-8000-000000000003`) opens; guidelines render; **the new Projects section is visible** and shows the seeded project (`…04`) if `db:seed` still creates it.
3. The seeded project's detail page (`/projects/$projectId`) opens without errors.

If any of (2) or (3) fails, Thread A has a regression — fix before moving on.

### Verification matrix

Each row is one user motion the vision explicitly calls out. Mark `✅ works`, `⚠️ works with caveat (note inline)`, or `❌ broken (note inline + file a follow-up)`.

| # | Motion | Expected | Result |
|---|--------|----------|--------|
| 1 | Click "New project" on a brand, type a name, submit | Navigates to `/projects/$projectId`; split-screen renders empty | |
| 2 | Send a chat message ("hello") in `ChatPane` | User bubble appears immediately; `Thinking…` then assistant bubble streams in | |
| 3 | Ask the agent to "add three tagline ideas to the canvas" | Three text blocks materialize in `CanvasPane` while the chat streams (or shortly after); blocks persist on reload | |
| 4 | Click the pin icon on a block | Block flips to pinned visually; `ShortlistToggle` count increments | |
| 5 | Click pin again | Unpins; count decrements | |
| 6 | Toggle `ShortlistToggle` to "pinned only" | Canvas filters to pinned blocks only | |
| 7 | Toggle back to "all" | Full canvas returns | |
| 8 | Drag a block to a new position | Order updates immediately; survives reload | |
| 9 | Drag-drop an image file onto the canvas | Image uploads, appears as a block | |
| 10 | Drag-drop a non-image file (PDF) onto the canvas | File block appears with filename / download affordance | |
| 11 | Open the same project in a second tab | Initial state matches; an edit in Tab A appears in Tab B without manual refresh | |
| 12 | Click brand name in the project's `TopBar` | Returns to the brand page; project shows up in the list | |
| 13 | Reload the project page directly via URL | State rehydrates correctly (no flash of empty canvas) | |
| 14 | Hard-refresh while the agent is mid-stream | Reload doesn't crash; reconnection is clean (canvas-ops broadcast in flight are received via realtime) | |
| 15 | Mid-stream send a second message | 409 `AGENT_BUSY` toast; first stream continues uninterrupted | |

### Vision-bar checks (depth, not breadth)

These are about *quality* of the experience, not whether it works at all. Note observations even if there's no fix in this thread:

- **Agent canvas-awareness.** Does asking "give me five more like the pinned ones" actually condition on pinned blocks? (Look at what `packages/agent/src/prompts/` assembles — pinned vs unpinned vs recent-deltas.) Likely partial. Capture findings; depth pass is a separate plan.
- **"Live-aware" feel.** Does the agent acknowledge edits made between turns? Vision says it should see "what's been added since the last message."
- **Canvas as multimodal "dump zone".** Vision describes a Pinterest/mymind-style spatial board for moodboards. The current canvas is a vertical stack with drag-reorder + drop-zone upload — the *multimodal* part works, the *spatial* board does not. Note explicitly.

### Output

On completion, append a **Findings** section to this file (or move the whole doc to `docs/completions/`) covering:

1. Verification matrix with results filled in.
2. List of any bugs found (with severity + suggested fix locus).
3. List of vision-bar gaps observed (feeds the next planning round: shortlist view depth, soft-delete + restore, finalize → promote, agent prompt depth).
4. A short narrative: "what shipped, what holds water, what doesn't."

## Verification (this plan itself)

Before merge of Thread A:

- `pnpm typecheck` green across 9 workspaces.
- `pnpm lint` green.
- `pnpm format:check` green.
- `pnpm test` green (test count change: +1 to +3 depending on what we add in A.5).
- `pnpm --filter @brandfactory/web build` succeeds.
- Manual smoke of rows 1, 11, 12 minimum (the new wiring + first-order realtime + back-nav) before opening the PR.

## Questions for review

1. **Header restructure on the brand page.** The current page subtitle is "Brand guidelines"; once Projects sits above the guidelines editor, that subtitle becomes ambiguous. Options: (a) drop the subtitle entirely and let the two section headings ("Projects", "Guidelines") carry the structure; (b) rename it to "Identity" or "Overview" and treat the page as a brand home; (c) split into two tabs/sub-routes (`/brands/$brandId` shows projects, `/brands/$brandId/guidelines` shows the editor). I lean (a) for v1 simplicity, but (c) starts paying off once we add Shortlist / Finalize surfaces. Which way?

2. **Section order: Projects above Guidelines, or below?** Argued above for Projects-first (daily-use flow). Some users might expect Guidelines to dominate the brand page since that's its current identity. Worth confirming before flipping the visual hierarchy.

3. **Empty-state copy.** "No projects yet. Create one to start brainstorming with the agent." Fine, or do you want something more vision-flavored ("Ideate → Iterate → Finalize. Start a project to begin.")?

4. **Project card metadata.** Just name + createdAt? Or also: last-edited timestamp, count of canvas blocks, last assistant message preview? More signal helps a returning user pick up where they left off, but every extra field is one more query/computation. Default to name + createdAt unless you want more.

5. **Standardized template UI scaffolding now or later?** Today the backend supports `kind: 'standardized', templateId: string`. We could ship a disabled-looking "Standardized templates (coming soon)" segmented control on the New Project dialog to telegraph the roadmap, or omit it entirely until a template exists. I lean omit — empty roadmap surfaces tend to look broken — but flagging.

6. **`db:seed` and the seeded project.** Current seed (per changelog line 211) inserts a freeform project + canvas. Once Thread A is live, the seeded project will be the first thing every dev sees. Worth confirming the seed is what we want a brand-new contributor's first impression to be (empty canvas? a couple of demo blocks? a sample assistant message?) — currently it's empty AFAICT. Out of scope to *change* here, but worth a yes/no.

7. **Verification: where does the matrix output live?** Options: (a) append a Findings section to this doc and move it to `docs/completions/` once done (matches the phase-completion-doc pattern in `docs/completions/phase*`); (b) leave this doc as the plan and start a fresh `docs/completions/projects-reachable-and-functional.md`. I lean (a) — keeps plan + outcome in one place — but the completions folder convention may dictate (b).

8. **Scope creep watch.** Once a user reaches a working project, the obvious next clicks are "rename this project", "delete this project", "go back to the project list without losing my draft message". None of those are in scope, but if Thread B's matrix surfaces them as friction, do you want a follow-up appended to this plan or kept on the roadmap for the next thread?
