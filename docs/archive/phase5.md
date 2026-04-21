# Phase 5 Completion — Agent package (`@brandfactory/agent`)

**Status:** complete (library + in-memory smoke script; live-LLM smoke deferred to the contributor running it — gated on `OPENROUTER_API_KEY`).
**Scope:** [scaffolding-plan § Phase 5](../executing/scaffolding-plan.md#phase-5--agent-package) as expanded by [phase-5-agent-plan.md](../executing/phase-5-agent-plan.md).
**Verification:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` — all green across 9 workspaces. Test count grew from 83 (0.5.1) to 103 (+20 new, all in `@brandfactory/agent`). Zero new peer-dep warnings beyond the zod v4 vs AI-SDK v3 peer warnings already documented in 0.4.0.

Single phase-level writeup (same format as Phase 3 / Phase 4), organized by task order from the plan. No net-new surface in other packages — the agent is consumed by Phase 6's `POST /projects/:id/agent` route, which lands next.

---

## What Phase 5 shipped

A server-only orchestration library that turns `(brand, canvas, user
message) → streamed AgentEvent[]`. It composes the system prompt,
assembles canvas context, defines three canvas-mutation tools, and
streams Vercel-AI-SDK output through a typed async iterable. **It never
talks to the DB, the realtime bus, or an HTTP surface directly** — all
side effects flow through an injected `CanvasOpApplier`. The server
(Phase 6) implements that interface against the real persistence layer
and forwards the resulting events to SSE + the realtime bus.

### Package layout

```
packages/agent
├── package.json              # new deps: ai, zod, shared, adapter-llm, tsx
├── tsconfig.json             # now includes scripts/**/*.ts
├── vitest.config.ts          # projects-mode entry, mirrors other packages
├── scripts/
│   └── smoke.ts              # real-LLM driver (openrouter, gated on env)
└── src/
    ├── index.ts              # barrel — public surface for Phase 6
    ├── stream.ts             # streamResponse — the entry point
    ├── stream.test.ts
    ├── prompts/
    │   ├── system-prompt.ts
    │   ├── system-prompt.test.ts
    │   ├── canvas-context.ts
    │   ├── canvas-context.test.ts
    │   ├── prose-mirror-to-text.ts
    │   └── prose-mirror-to-text.test.ts
    └── tools/
        ├── applier.ts        # CanvasOpApplier interface (the side-effect seam)
        ├── definitions.ts    # buildCanvasTools + CANVAS_TOOL_NAMES
        └── tools.test.ts
```

---

## 5.1 — Package wiring

- **`packages/agent/package.json`** — added deps `@brandfactory/shared`,
  `@brandfactory/adapter-llm` (both `workspace:*`), `ai ^4.0.20` (kept
  aligned with adapter-llm), `zod ^4.3.6`. Dev-deps `@types/node`,
  `tsx`, `vitest`. Scripts: `typecheck`, `lint` (unchanged), plus new
  `test` (`vitest run`) and `smoke` (`tsx scripts/smoke.ts`).
- **`packages/agent/vitest.config.ts`** — `defineProject({ name,
  include: 'src/**/*.test.ts', environment: 'node' })`, mirroring the
  other packages. Needed so `pnpm --filter @brandfactory/agent test`
  works the same as the root `pnpm test`.
- **Root `vitest.config.ts`** — added `packages/agent` to the
  `projects` list so the root `pnpm test` picks it up.
- **`packages/agent/tsconfig.json`** — dropped the narrow `rootDir:
  src`, widened `include` to `['src/**/*.ts', 'scripts/**/*.ts']`.
  Reason: `scripts/smoke.ts` needs to live in the TS project so
  type-aware ESLint / the IDE see it. Without this, `pnpm lint` failed
  with "was not found by the project service".
- **`pnpm install`** — lockfile updated with new workspace edges and
  hoisted `tsx`. The AI-SDK peer warnings about zod (`^3` peer vs our
  zod `^4`) carry over from adapter-llm; Phase 3 decided to live with
  them and there's no new warning category.

**Why single-sourcing `ai` with adapter-llm matters:** the shared
`LanguageModel` type (`import type { LanguageModel } from 'ai'`) must
reference exactly one copy of the module at compile time. Different
minor ranges would silently produce nominal mismatches on
`adapters.llm.getModel(...)` return values.

---

## 5.2 — `buildSystemPrompt` + `proseMirrorDocToPlainText`

### `prompts/prose-mirror-to-text.ts`

`proseMirrorDocToPlainText(doc)`. Walks a ProseMirror / TipTap JSON
tree and flattens it to plain text. Every block-level node
(paragraph, heading, list_item, blockquote, code_block, bullet_list,
ordered_list, horizontal_rule — both snake_case and camelCase spellings
accepted) produces its own block; blocks are joined with `\n\n`. Inline
text nodes concatenate into the block currently under construction.

Deliberately lossy — this is context for the LLM, not a faithful
rendering. Formatting marks (bold/italic/links) are dropped; the model
doesn't need them, and stripping them keeps the prompt compact.

### `prompts/system-prompt.ts`

`buildSystemPrompt(brand: BrandWithSections): string` composes the
prompt in this fixed order:

1. Role preamble — names the brand and binds every response to its
   guidelines.
2. `# Brand: <name>` header, plus `brand.description` if set.
3. `## Brand guidelines` block — sections rendered in ascending
   `priority` order as `### <label>\n<plain-text body>`. Skipped
   entirely when the brand has zero sections.
4. `## Canvas awareness` — short paragraph telling the model that a
   `CANVAS STATE` block follows, that pinned blocks are the user's
   shortlist, and that canvas mutations happen via tool calls (names
   the three tools so the model can reason about intent).

Tests pin the structural invariants (brand name present, every section
label in the right order, bodies are plain text not raw JSON) but not
the exact wording, so wordsmithing in future phases doesn't break the
suite.

---

## 5.3 — `buildCanvasContext`

`prompts/canvas-context.ts`. Signature matches the plan:

```ts
buildCanvasContext({
  blocks: CanvasBlock[],
  shortlistBlockIds: CanvasBlockId[],
  recentOps?: CanvasOp[],
}): string
```

Output layout:

```
CANVAS STATE

PINNED:
  - <id> <summary>
  - …

UNPINNED:
  - <id> <summary>
  - … and K more          (when truncated)

RECENT OPS:                (only rendered when non-empty)
  - add-block <id>
  - update-block <id>
  - remove-block <id>
```

Summary rules (`summarizeBlock`):

- **text** — first 200 chars of `proseMirrorDocToPlainText`,
  whitespace-collapsed, ellipsis suffix if truncated; `(empty)` if
  the block body has no text.
- **image** — `[image: <alt || "untitled">] (W×H)` when dimensions
  present, otherwise no dims suffix.
- **file** — `[file: <filename>] (<mime>)`.

`CANVAS_CONTEXT_UNPINNED_LIMIT = 20` is exported from the module so
Phase 6 can tune it without digging into the implementation.
`TEXT_SUMMARY_MAX_CHARS = 200` is module-local; if we need to tune it
from outside later we'll export it then.

Function is pure — no I/O, no randomness, deterministic on inputs —
so it's safe to memoize later if prompt-assembly shows up in a profile.

---

## 5.4 — Canvas tools + `CanvasOpApplier`

### `tools/applier.ts` — the side-effect seam

```ts
export interface CanvasOpApplier {
  addCanvasBlock(input: AddCanvasBlockInput): Promise<CanvasBlock>
  pinBlock(blockId: CanvasBlockId): Promise<CanvasBlock>
  unpinBlock(blockId: CanvasBlockId): Promise<CanvasBlock>
}

export interface AddCanvasBlockInput {
  kind: 'text'
  body: ProseMirrorDoc
  position: number
}
```

v1 is deliberately narrow: text-only `addCanvasBlock`, pin/unpin by
id. The image/file tool variants are deferred — both require a
`blobKey` obtained through the separate upload flow, not minted by the
agent (see plan §5.4 / follow-ups). Every method returns the applied
`CanvasBlock` so the stream layer can synthesize a `canvas-op`/`pin-op`
event without a second DB round-trip.

### `tools/definitions.ts`

`buildCanvasTools(applier, opts?)`. Three AI-SDK tools:

| Constant                                | Tool name           | Parameters schema                               | Execute                                                             |
| --------------------------------------- | ------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `CANVAS_TOOL_NAMES.addCanvasBlock`      | `add_canvas_block`  | `{ body: ProseMirrorDoc, position: number }`     | `applier.addCanvasBlock({ kind: 'text', ... })`                     |
| `CANVAS_TOOL_NAMES.pinBlock`            | `pin_block`         | `{ blockId: CanvasBlockId }`                     | `applier.pinBlock(args.blockId)`                                    |
| `CANVAS_TOOL_NAMES.unpinBlock`          | `unpin_block`       | `{ blockId: CanvasBlockId }`                     | `applier.unpinBlock(args.blockId)`                                  |

Each `execute` returns a compact `{ blockId, isPinned }` payload — the
model can reason about what happened without us leaking full rows into
the conversation.

Parameter schemas reuse `ProseMirrorDocSchema` and `CanvasBlockIdSchema`
from shared (no redefinition).

**Internal `onApplied` hook.** The second argument to `buildCanvasTools`
is an options bag with an optional `onApplied(toolCallId, event)`
callback. When set, each `execute` invokes it after the applier returns,
passing the `toolCallId` (from the AI-SDK's `ToolExecutionOptions`) and
a pre-shaped `CanvasOpEvent` / `PinOpEvent`. This is the hook
`streamResponse` uses to synthesize canvas-op events for the output
iterable (§5.5). External callers (e.g., a Phase-6 authz introspector
that just wants the `ToolSet`) pass no opts and the hook stays
undefined.

---

## 5.5 — `streamResponse`

### `stream.ts`

```ts
export function streamResponse(
  input: StreamResponseInput,
): AsyncIterable<AgentEvent>
```

Flow:

1. Build the system prompt (5.2) and canvas context (5.3).
   Concatenate as `system + '\n\n' + canvasContext` and pass as the
   `system` field to `streamText`. Canvas context is prepended to
   system rather than injected as a user message so the model treats
   it as static context, not something to respond to.
2. Build tools with an `onApplied` hook that stores `CanvasOpEvent` /
   `PinOpEvent` in a `Map<toolCallId, event>` keyed by the AI-SDK's
   tool-call id.
3. Translate `AgentMessage[]` → AI-SDK `CoreMessage[]`
   (`{ role, content }`).
4. Call `streamText({ model, system, messages, tools, abortSignal })`.
5. Consume `result.fullStream` as an async generator, yielding typed
   `AgentEvent`s:
   - `text-delta` → accumulate into a buffer; allocate an assistant
     message id on the first delta (`randomUUID()` from `node:crypto`).
   - `tool-call` → flush any pending text message, then yield
     `{ kind: 'tool-call', callId, toolName, args }`.
   - `tool-result` → look up `pendingByToolCall.get(toolCallId)` and
     yield the stored `canvas-op`/`pin-op` event (then delete).
   - `step-finish` / `finish` → flush the pending text message.
   - `error` → throw. The generator propagates the error out of the
     `for await` at the call site.

Trailing safeguard: a final `takeMessage()` flush after the loop in
case the upstream stream ended without a finish part.

**Widened local stream-part type.** The AI-SDK exports
`TextStreamPart<TOOLS>`; with `TOOLS` inferred as the generic
`ToolSet`, the `tool-call` / `tool-result` arms narrow to `never`
because `ToolCallUnion` / `ToolResultUnion` require typed tool names.
A local `AgentStreamPart` union redeclares the minimal shape we
consume (plus an explicit "other kinds" arm for `reasoning` / `source` /
`file` / `step-start` / `tool-call-streaming-*` so the `switch` stays
exhaustive without a default-case never-guard). Runtime behaviour is
unchanged — this is purely a TS-side workaround for v4 inference.

### Message-id allocation

Phase 5 generates assistant message ids locally (uuid v4). Phase 6 is
free to regenerate them DB-side for the persist step — the id is
opaque to consumers before that point, so no conflict.

---

## 5.6 — Package barrel

`src/index.ts` re-exports:

- `streamResponse`, `StreamResponseInput`
- `buildSystemPrompt`
- `buildCanvasContext`, `BuildCanvasContextInput`,
  `CANVAS_CONTEXT_UNPINNED_LIMIT`
- `buildCanvasTools`, `CANVAS_TOOL_NAMES`
- `CanvasOpApplier`, `AddCanvasBlockInput`

Everything else (prompt helpers, the widened stream-part type, the
module-local `TEXT_SUMMARY_MAX_CHARS`) stays internal. No `**/*` globs
in `exports`.

---

## 5.7 — Smoke script

`packages/agent/scripts/smoke.ts`. Drives `streamResponse` against a
real openrouter-backed `LLMProvider` (`createLLMProvider({ openrouter:
{ apiKey } })`), with an in-memory `InMemoryApplier` that records every
mutation. Hard-coded inputs:

- A `BrandWithSections` for a fictitious "Northstar Coffee" with two
  sections (voice + audience).
- Two seed canvas blocks, one pinned, one draft.
- A single user message asking for three tagline ideas posted via
  `add_canvas_block`, then a pin.

Prints each event as it arrives. Exits 0 on success, 1 if the script
fatals, 2 if the run completed but the applier never received an
`add_canvas_block` call (signal that the selected model doesn't
tool-use reliably, not a bug in the agent package).

**Gated on `OPENROUTER_API_KEY`.** Missing key → clear error + exit 1,
not a mid-stream failure.

---

## Tests (new)

20 new vitest cases, all deterministic, no network:

- `prompts/prose-mirror-to-text.test.ts` — 6 cases: paragraph,
  paragraph + heading, bullet list, nested list, inline text runs,
  empty doc.
- `prompts/system-prompt.test.ts` — 2 cases: happy path (brand name,
  description, section labels in priority order, plain-text bodies, no
  raw JSON); brand with zero sections (still renders the canvas-
  awareness contract, skips the guidelines block).
- `prompts/canvas-context.test.ts` — 4 cases: empty canvas (both
  placeholders), pinned/unpinned split across text/image/file,
  unpinned truncation + "and K more" tail, RECENT OPS rendering.
- `tools/tools.test.ts` — 5 cases: exposed tool names, each tool's
  `execute` forwards args to the applier and returns compact JSON,
  zod rejects bad input before any applier call.
- `stream.test.ts` — 3 cases driven by a hand-rolled
  `LanguageModelV1` fake:
  1. Plain text-delta stream → single assistant-role `message` event.
  2. text-delta → tool-call → synthesized `canvas-op`; asserts event
     order AND that the applier was called with the decoded args.
  3. Upstream `error` stream part → generator throws with the original
     message.

The fake `LanguageModel` implements only the slice `streamText`
actually touches (`specificationVersion`, `provider`, `modelId`,
`defaultObjectGenerationMode`, `supportsImageUrls`,
`supportsStructuredOutputs`, `doGenerate` (throws, shouldn't be hit),
`doStream`). Cast through `as unknown as LanguageModel` — the AI-SDK
doesn't export a test-helper we can reuse here.

---

## Non-goals (reaffirmed — plan §)

Phase 5 deliberately does not do any of the following; they belong to
Phase 6 or later:

- Create / modify any route in `@brandfactory/server`.
- Persist anything (no `@brandfactory/db` dep on the agent package).
- Publish on `RealtimeBus` (no `@brandfactory/adapter-realtime` dep).
- Resolve workspace settings (caller passes `{ providerId, modelId }`
  in `llmSettings`).
- Persist assistant messages.
- Rate-limit or concurrency-guard the stream.

---

## Follow-ups carried forward

Captured in plan §Follow-ups, no Phase 5 action:

- Message-id round-trip through the DB on persist (Phase 6 wire-up).
- Canvas-context token-budget truncator (the N=20 unpinned cap is a
  guess; swap for char-budget once we see real prompts).
- `update_block` / `remove_block` tools (re-open after we see what the
  model tries to do).
- Image / file tool variants (needs a story for how the agent obtains
  a `blobKey`).
- Multi-turn tool loops (`streamText` handles multi-step natively;
  verify behaviour in the smoke run before adding orchestration of our
  own).
- Eval-hook points (wait for a real eval harness).

---

## Verification

```
pnpm install        ✔  lockfile updated, no new peer-dep categories
pnpm typecheck      ✔  9/9 workspaces pass
pnpm lint           ✔  clean
pnpm format:check   ✔  clean
pnpm test           ✔  103 tests passing (24 files) — up from 83
pnpm --filter @brandfactory/agent smoke
                    ☐  run locally with OPENROUTER_API_KEY set
```
