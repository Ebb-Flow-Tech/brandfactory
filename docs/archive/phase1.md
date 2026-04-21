## Phase 1 Completion — Shared Package

**Status:** complete
**Scope:** [scaffolding-plan.md § Phase 1](../executing/scaffolding-plan.md) as expanded by [phase-1-shared-package.md](../executing/phase-1-shared-package.md)
**Smoke check:** `pnpm lint && pnpm typecheck && pnpm format:check` — all green, including a throwaway `BrandSchema.parse(...)` round-trip from both `packages/server` and `packages/web`.

This doc records exactly what was written, where, and why. Phase 2 (`packages/db`) consumes these schemas to derive Drizzle tables; anything that needs to change to accommodate storage should land there, not here.

---

## Goal

Stand up `@brandfactory/shared` as the single source of truth for domain types and zod schemas consumed by both frontend and backend. Schema-first, types inferred. Zero business logic. The only runtime dep added in this phase is `zod`.

## Final package shape

```
packages/shared/
├── package.json           # adds zod ^4.3.6 as a dependency
├── tsconfig.json          # unchanged from Phase 0
└── src/
    ├── index.ts           # barrel — grouped by domain
    ├── json.ts            # JsonValue + ProseMirrorDoc alias
    ├── ids.ts             # branded-id helper + 8 concrete ids
    ├── workspace/
    │   └── workspace.ts
    ├── brand/
    │   ├── brand.ts                 # Brand, BrandSummary, BrandWithSections
    │   ├── guideline-section.ts     # BrandGuidelineSection (+ createdBy enum)
    │   └── suggested-categories.ts  # static seed list for starter UI
    ├── project/
    │   ├── project.ts               # discriminated union: freeform | standardized
    │   └── canvas.ts                # Canvas, CanvasBlock (4 variants), Pin, ShortlistView
    └── agent/
        └── events.ts                # AgentMessage, AgentToolCall, CanvasOp, PinOp, AgentEvent
```

All files ESM, `import type` where the consumer only needs a type, zero runtime deps beyond `zod`.

## Consumers updated

Both `packages/server` and `packages/web` gained a workspace dep on `@brandfactory/shared` (`workspace:*`). That wiring is needed anyway for subsequent phases; landing it now was the cleanest way to actually exercise the cross-package `import` during the smoke check.

---

## Files written

### `src/json.ts` — primitives

Recursive `JsonValue` type + `JsonValueSchema` via `z.lazy` + `z.union`. `ProseMirrorDoc` and `ProseMirrorDocSchema` are thin aliases — the schema layer intentionally does not enforce ProseMirror structure; the TipTap editor does that client-side. The alias exists so consumers can be explicit about intent (`body: ProseMirrorDoc` reads differently than `body: JsonValue`).

`z.record(z.string(), JsonValueSchema)` — zod 4 requires both key and value schemas; the key is `z.string()` because `JsonValue` object keys are strings by definition.

### `src/ids.ts` — branded ids

One helper plus eight concrete ids: `BrandId`, `WorkspaceId`, `ProjectId`, `CanvasId`, `CanvasBlockId`, `PinId`, `SectionId`, `UserId`.

```ts
export function brandedId<TBrand extends string>(_name: TBrand) {
  return z.string().min(1).brand<TBrand>()
}
```

The `_name` arg exists solely to capture the literal type parameter at the call site (`brandedId('BrandId')` → brand is `'BrandId'`). Not used at runtime. Underscore prefix keeps ESLint's `no-unused-vars` quiet (root config ignores `^_`).

Runtime value: a plain `string`. Compile-time type: `string & z.BRAND<'BrandId'>`, which is nominal — you cannot pass a `ProjectId` where a `BrandId` is expected. Zod's branding is erased at emit time, so there is no runtime cost.

### `src/workspace/workspace.ts`

Minimal envelope: `id`, `name (1..120)`, `ownerUserId`, `createdAt`, `updatedAt`. No membership / permissions — those land when we actually have multi-user flows (not in scaffolding).

### `src/brand/guideline-section.ts`

The flexible core. Sections are fully user-defined — no category enum. Shape:

- `id: SectionId`, `brandId: BrandId`
- `label: string (1..120)` — free text, not a fixed key
- `body: ProseMirrorDoc` — rich content from day one
- `priority: number.int()` — sparse integer ordering. Reorders update this column on a single row; if two clients collide, the server re-balances. Switching to lexorank later is a storage-level change that doesn't reshape this schema.
- `createdBy: 'user' | 'agent'` — attribution for agent-authored suggestions. Useful for UI affordances ("this was suggested — accept or reject") and for analytics. Keeping it from v1 avoids a migration once the agent starts writing sections.
- `createdAt`, `updatedAt` — ISO-8601 strings (`z.iso.datetime()`).

### `src/brand/suggested-categories.ts`

Static `as const satisfies readonly SuggestedSection[]` array with five starters: Voice & tone, Target audience, Values & positioning, Visual guidelines, Messaging frameworks. `label`, `description`, `exampleBody` per item. This is **data**, not a type constraint — the frontend renders it as a picker when a brand is new; the schema never checks against it.

`exampleBody` is plain text, not a ProseMirror doc. The frontend is free to transform it into a starter doc (or use it as placeholder text in the editor). Keeping it as a string means this file has no runtime dep on ProseMirror / TipTap.

### `src/brand/brand.ts`

Three schemas:

- `BrandSchema` — the row: `id`, `workspaceId`, `name`, `description (nullable)`, timestamps. **No `guidelines` / `sections` field.** Sections live in their own table and are fetched separately.
- `BrandSummarySchema` — `pick` projection of `id`, `workspaceId`, `name` for list/picker surfaces that don't want to pay for the full row.
- `BrandWithSectionsSchema` — `BrandSchema.extend({ sections: z.array(BrandGuidelineSectionSchema) })`. The API-level join shape for endpoints that hydrate sections; not a storage shape.

### `src/project/project.ts`

Discriminated union on `kind`:

- `FreeformProjectSchema` — `kind: 'freeform'`, no extra fields.
- `StandardizedProjectSchema` — `kind: 'standardized'`, plus `templateId: string`.

`ProjectBaseShape` is a plain object literal (not a zod schema) spread into each branch. This keeps `z.discriminatedUnion('kind', [...])` valid — discriminated-union branches must be top-level `z.object` literals, not `.extend()` chains off a base. The cost is a tiny bit of duplication; the benefit is zod's fast-path discriminator validation.

### `src/project/canvas.ts`

`CanvasSchema` is a lightweight container: `id`, `projectId`, timestamps. Blocks live in their own table (see Phase 2); the canvas row exists as a stable parent id.

`CanvasBlockSchema` is a 4-way discriminated union on `kind`:

- `text` → `body: ProseMirrorDoc`
- `image` → `blobKey`, optional `alt`, optional positive-int `width` / `height`
- `file` → `blobKey`, `filename`, `mime`
- `snippet` → `body: ProseMirrorDoc`, optional `sourceBlockId: CanvasBlockId` (provenance back to a parent block the snippet was pulled from)

Same pattern as projects: `CanvasBlockBaseShape` is a plain object literal spread into each branch. `position` is `number().int()` for deterministic ordering — same sparse-integer rationale as guideline sections.

`PinSchema` — `id`, `canvasId`, `blockId`, `createdBy: 'user' | 'agent'`, `createdAt`. Pins are separate rows; a block and its pin are distinct.

`ShortlistViewSchema` — derived projection (`{ projectId, blockIds[] }`). Not a stored entity. The server computes it as a filtered read over `pins`. The schema exists so the wire shape is typed; storage doesn't need a table for it.

### `src/agent/events.ts`

Five top-level schemas plus internals:

- `AgentMessageSchema` → `{ kind: 'message', id, role: 'user' | 'assistant', content }`
- `AgentToolCallSchema` → `{ kind: 'tool-call', callId, toolName, args: JsonValue }`
- `CanvasOpSchema` → discriminated union on `op` with three branches (`add-block`, `update-block`, `remove-block`). Standalone type so the agent package and DB layer can both consume it directly (e.g. a `CanvasOpApplier` takes a `CanvasOp`).
- `PinOpSchema` → discriminated union on `op` with `pin` / `unpin`.
- `CanvasOpEventSchema` → `{ kind: 'canvas-op', op: CanvasOp }` — event-stream envelope.
- `PinOpEventSchema` → `{ kind: 'pin-op', op: PinOp }` — event-stream envelope.
- `AgentEventSchema` → `z.union([AgentMessageSchema, AgentToolCallSchema, CanvasOpEventSchema, PinOpEventSchema])`.

**Why `z.union` on the outer event, not `z.discriminatedUnion`:** the two op-event branches wrap an inner discriminated union on `op`. Zod's `discriminatedUnion` requires each branch to be a single `z.object`, not a nested union. The outer `union` performs a tiny bit of trial-parsing per event; negligible for streamed agent output.

### `src/index.ts` — barrel

Grouped by domain (primitives → workspace → brand → project → agent), not alphabetical, so consumers can read the exports top-down and see the shape of the domain. Uses `export *` per file — everything the files export is public API for this phase.

---

## Design decisions locked during implementation

These map to the "open questions" in the plan and were decided per the plan's own leanings:

### `createdBy` on sections and pins — kept

Useful for attribution the moment the agent starts authoring (Phase 5 / 6). Cheaper to include now than migrate later. Enum is `'user' | 'agent'` — no third value is on the horizon.

### `priority` / `position` as `number.int()`

Sparse integers, re-balance on conflict. Revisit if reorder churn becomes visible. Lexorank strings are a storage-layer change that wouldn't reshape this API.

### `ShortlistView` is derived, not stored

Just a filter over `pins`. The schema exists for the wire shape; there is no table for it. If performance ever demands a materialized view, it can be added at the DB layer without touching this schema.

### Timestamps as ISO strings at the wire layer

`z.iso.datetime()` on every timestamp. DB layer converts to/from `Date`. This keeps the wire contract free of Date-vs-string drift across serialization boundaries and means `JSON.parse(await res.text())` gives us schema-valid values directly.

### No defaults in schemas

Defaults belong in the callers. A schema with `z.string().default('')` silently accepts `undefined` and that produces bugs where missing fields look valid. Callers supply defaults intentionally.

### No business logic

This package is contracts only. No `canUserEditBrand`, no `isShortlistEmpty`. Those belong to whichever layer enforces them (server routes, agent, UI).

---

## Decisions made during execution (refinements to the plan)

A handful of small calls that deviated from or refined [phase-1-shared-package.md](../executing/phase-1-shared-package.md):

### `ProjectBase` / `CanvasBlockBase` as plain object literals, not zod schemas

The plan suggested `ProjectBaseSchema.extend({ kind: z.literal('freeform') })`. `.extend()` works at runtime but the result isn't directly usable as a `z.discriminatedUnion` branch in all zod versions without extra coaxing — the safe pattern is to define a plain TS object literal of zod fields and spread it into each branch's `z.object({...})`. Tiny bit of duplication, full discriminated-union fast-path validation.

### `AgentEventSchema` uses `z.union`, not `z.discriminatedUnion`

Plan wrote it as `z.discriminatedUnion('kind', [message, toolCall, canvasOp, pinOp])`. The canvas-op and pin-op event branches wrap an inner discriminated union on `op`; zod won't accept a nested union as a single discriminated branch. Using `z.union` on the outer event costs a trial-parse per event, which is fine at the cardinality agent events stream at. See the comment in `agent/events.ts`.

### Zod 4 API — `z.iso.datetime()`, `z.number().int()`, `z.record(keySchema, valueSchema)`

The shared package runs against `zod ^4.3.6`. Phase doc predates that. Three concrete API notes for future reference:

- **Datetimes:** `z.iso.datetime()` is the zod 4 form. The old `z.string().datetime()` still works on v4 but is deprecated.
- **Integers:** `z.number().int()` is used rather than the newer top-level `z.int()` helper — universal across minor zod 4 releases, no behaviour difference.
- **Records:** zod 4 requires both key and value schemas (`z.record(z.string(), V)` instead of `z.record(V)`).

### `BrandSummary` added

Not in the plan's file layout but implied by "`Brand, BrandSummary`" in the module layout comment. Defined as `BrandSchema.pick({ id, workspaceId, name })` so it stays locked to `BrandSchema` and can't drift.

### `GuidelineSectionCreatedBySchema` / `PinCreatedBySchema` exported as separate enums

Same literal (`'user' | 'agent'`) in two places, but they're exported as separate named schemas so a future divergence (e.g. pins gain `'import'`) doesn't force a cross-module migration.

### `packages/server` and `packages/web` gained `@brandfactory/shared` as a workspace dep

Phase 4 / Phase 7 would have needed this anyway. Landing it now was the only way to actually exercise the cross-package `import` during the smoke check — otherwise the check would only prove the shared package typechecks in isolation, which it always would.

### Smoke-check probe used `BrandSchema.parse(...)`, not just a type-only import

Types don't catch zod-side problems (missing fields on the `z.object`, wrong discriminator, etc.). Running `BrandSchema.parse(validPayload)` at typecheck time — with a locally-typed `Brand` variable as the result — proves both the schema shape and the inferred type line up end-to-end. Throwaway was reverted after the check passed.

### Prettier rewrapped two files on first format-check

`suggested-categories.ts` and `canvas.ts` had a couple of multiline property assignments that Prettier preferred to collapse / re-wrap. Applied the rewrites; no semantic change.

---

## Verification

From a clean tree with the shared package and its consumers wired:

```
pnpm install           ✔
pnpm lint              ✔  0 problems
pnpm typecheck         ✔  9/9 workspaces pass
pnpm format:check      ✔  all files match Prettier style
```

End-to-end probe (temporarily added, then removed) — both `packages/server/src/index.ts` and `packages/web/src/index.ts` successfully imported `BrandSchema` + `Brand` from `@brandfactory/shared` and parsed a literal payload.

---

## What Phase 1 does NOT include (and why)

- **Drizzle schema / migrations.** Lands in Phase 2 and consumes these types. Moving storage concerns into `shared` would collapse the layering the plan is built on.
- **A UI for curating suggested categories.** The seed list is static for v1. If individual brands want to edit their own starter libraries later, that graduates into a DB-backed admin surface — not a schema change.
- **Yjs / CRDT body types.** Body stays as generic ProseMirror JSON. A future `body_yjs` companion column can coexist without reshaping this API.
- **Agent prompt assembly.** Phase 5 consumes these types to build prompts, but prompt code does not live in `shared`.
- **Validators / guards / helpers.** No `isFreeformProject(project)`, no `findPinnedBlocks(canvas, pins)`. Consumers can derive these trivially from the discriminated unions; putting them here invites creep.

---

## Ready for Phase 2

The domain contracts are in place. Phase 2 (`@brandfactory/db`) can define Drizzle tables directly off these types — `brands`, `brand_guideline_sections`, `workspaces`, `projects`, `canvases`, `canvas_blocks`, `pins` — and DB rows serialize back through the same zod schemas to the wire. If a storage-side constraint forces a schema change, it surfaces there and edits propagate out through `shared`.
