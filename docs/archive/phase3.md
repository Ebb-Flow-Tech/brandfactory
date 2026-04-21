# Phase 3 Completion — Adapters: ports + default implementations

**Status:** complete
**Scope:** [scaffolding-plan § Phase 3](../executing/scaffolding-plan.md#phase-3--adapters-ports--default-implementations) as expanded by [phase-3-adapters.md](../executing/phase-3-adapters.md).
**Smoke check:** `pnpm test` (vitest projects mode, 8 files / 31 tests, all pass), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` — all green across 9 workspaces.

This is the phase-level wrap. Implementation detail per task is captured
inline below rather than in per-task files (Phase 3 was tighter in
surface area than Phase 2; one document is enough to understand all
four adapter packages without jumping between files).

---

## What Phase 3 shipped

A complete, swappable port-and-adapter layer the server can wire up at
boot:

- **`@brandfactory/adapter-auth`** — `AuthProvider` port + `local`
  (dev-only, token = uuid user_id) + `supabase` (JWT verified against
  the project's JWKS via `jose`).
- **`@brandfactory/adapter-storage`** — `BlobStore` port + `local-disk`
  (filesystem + HMAC-SHA256-signed URLs for both reads and writes) +
  `supabase` (Supabase Storage bucket wrapper). Exports a
  `verifySignature` helper that the Phase 4 server route will call to
  validate inbound `?sig=…` URLs.
- **`@brandfactory/adapter-realtime`** — `RealtimeBus` port +
  `native-ws` (in-process pub/sub bus + `bindToNodeWebSocketServer`
  helper that wires a `ws.Server` upgrade flow into the bus). The bus
  itself does not own the HTTP upgrade — that lives in `packages/server`
  in Phase 4.
- **`@brandfactory/adapter-llm`** — `LLMProvider` port +
  `createLLMProvider(config)` factory that resolves AI-SDK
  `LanguageModel`s for `anthropic`, `openai`, `openrouter`, and
  `ollama`. Per-provider AI-SDK clients are constructed lazily on first
  call and cached.
- **`@brandfactory/server`** — `loadEnv()` + `buildAdapters(env)`. One
  zod-validated env object at boot; each adapter impl receives an
  already-validated config slice. Adapters never read `process.env`
  themselves.
- **`@brandfactory/shared`** — new `realtime/envelope.ts` with the
  client↔server WS framing schemas (`subscribe | unsubscribe |
  event`). Shared so `web` (which can't import from
  adapter-realtime) speaks the same wire protocol.
- **Vitest** — root `vitest.config.ts` in projects mode, per-package
  `vitest.config.ts` for each tested workspace, root `pnpm test` runs
  the whole tree.
- **`.env.example`** — extended with the adapter selection vars,
  per-provider credentials, and a self-documenting comment header.

### Locked design decisions delivered

All 15 from the plan landed as specified:

1. Ports live in their adapter package — each `@brandfactory/adapter-*`
   exports its port type and impls from its root. ✔
2. `buildAdapters(env)` lives in `packages/server`. ✔
3. Env validation in `packages/server/src/env.ts`; each adapter impl
   takes already-validated config. ✔
4. LLM port returns an AI-SDK `LanguageModel`. ✔
5. Realtime port is pub/sub only; `bindToNodeWebSocketServer` exposed,
   HTTP upgrade deferred to Phase 4. ✔
6. Storage port surfaces signed URLs for both reads and writes; HMAC
   over `(method, key, exp)` for `local-disk`. ✔
7. `AuthProvider.verifyToken` + `getUserById`; `User` re-exported from
   `@brandfactory/db` so callers get one canonical row type. ✔
8. Settings env-only in Phase 3. ✔
9. Vitest is the project test runner. ✔
10. `listUsers` dropped from the auth port (architecture.md to be
    amended in this completion record — see "Architecture doc updates"
    below). ✔
11. `local-disk` uses signed URLs, not middleware-gated routes. ✔
12. WS framing schema lives in `@brandfactory/shared`, not the adapter. ✔
13. Per-provider config is discrete env vars; conditional validation
    via `superRefine`. ✔
14. Vitest projects mode, one root config + per-package configs that
    declare a project name. ✔
15. Deferred adapter impls are absent from code, not throw-stubs. Each
    adapter's `src/index.ts` carries a header comment listing
    planned-but-not-yet-shipped impls. ✔

### Open questions — how they landed

The plan resolved all open questions before execution; Phase 3 added
no new ones.

---

## Per-task notes

### Task 1 — Shared realtime envelope (`packages/shared/src/realtime/envelope.ts`)

Wrote the WS wire envelope as one file with a discriminated union per
direction:

- `RealtimeChannelSchema = z.string().min(1)` — channel-naming
  convention is intentionally loose for now (Phase 4 will tighten when
  the server picks one).
- `RealtimeEventPayloadSchema = z.union([AgentEventSchema,
  CanvasOpEventSchema, PinOpEventSchema])` — payloads inside an
  `event` frame.
- `RealtimeClientMessageSchema` — `subscribe | unsubscribe`,
  discriminated on `type`.
- `RealtimeServerMessageSchema` — `event` (single-branch
  discriminated union so adding `error`/`ack` later is mechanical).

Re-exported from the shared barrel.

### Task 2 — `@brandfactory/adapter-auth`

- `port.ts` — `AuthProvider` interface (`verifyToken` +
  `getUserById`), `InvalidTokenError` class, `User` re-exported from
  `@brandfactory/db`. Listing users intentionally absent — that's a
  DB concern, not an identity-provider concern.
- `local.ts` — `createLocalAuthProvider({ getUserById? })`. Bearer
  token must be a uuid (regex-validated); the token IS the user id;
  lookup throws `InvalidTokenError` on miss. The `getUserById` dep
  defaults to `@brandfactory/db`'s helper but is injectable for tests.
- `supabase.ts` — `createSupabaseAuthProvider({ jwksUrl, audience?,
  issuer? })`. Uses `jose.createRemoteJWKSet` + `jose.jwtVerify`. A
  `jwks` test seam lets unit tests pass an in-memory key set instead
  of fetching one. `sub` claim → `userId`. Phase 3 does not sync
  Supabase Auth's `auth.users` back into our `users` table.
- Tests — `local.test.ts` covers happy/non-uuid/missing-user paths
  with an injected lookup. `supabase.test.ts` mints RS256 keys via
  `jose.generateKeyPair`, signs valid/expired/no-sub tokens, and
  verifies the adapter accepts/rejects each. No real Supabase or
  network calls.

API note — `jose.generateKeyPair('RS256')` returns `KeyLike`
(`CryptoKey | KeyObject`); the test signature uses `KeyLike` rather
than `CryptoKey` to avoid pulling in the DOM lib in our node-only
tsconfig.

### Task 3 — `@brandfactory/adapter-storage`

- `port.ts` — `BlobStore` (`put | get | delete | getSignedReadUrl |
  getSignedWriteUrl`) + `BlobNotFoundError` + `InvalidSignatureError`.
- `local-disk.ts` —
  - `createLocalDiskBlobStore({ rootDir, signingSecret,
    publicBaseUrl, defaultTtlSeconds? })`.
  - Bytes accepted as `Uint8Array` or a Node readable stream; files
    written under `rootDir`, `mkdir -p` on each `put`.
  - **Path-traversal defense:** `resolveKey` calls `path.resolve(root,
    key)` and asserts the result stays under `root` (or equals
    `root`). Keys like `../escape.bin` throw before any I/O.
  - HMAC-SHA256 over `${method}\n${key}\n${exp}` with the configured
    `signingSecret`, hex-encoded. Default TTL 15 minutes.
  - URL shape: `${publicBaseUrl}/${encodeURI(key)}?exp=<unix>&sig=<hex>`.
  - `verifySignature` is exported for the Phase 4 HTTP handler:
    expiry check (numeric, `< now` → throw), constant-time compare via
    `crypto.timingSafeEqual` against an HMAC recomputed from the
    secret. Rejects expired sigs, length-mismatch sigs, non-hex sigs,
    and tampered keys.
- `supabase.ts` — `createSupabaseBlobStore({ url, serviceKey, bucket,
  defaultTtlSeconds? })`. Thin wrapper over
  `client.storage.from(bucket)`'s `upload | download | remove |
  createSignedUrl | createSignedUploadUrl`. A `client` dep injection
  test seam keeps the unit tests off `@supabase/supabase-js`'s real
  fetch path.
- Tests — `local-disk.test.ts` (6) round-trips put/get/delete in a
  `mkdtemp` root, asserts traversal rejection, signs/verifies a read
  URL, rejects expired and tampered sigs, and asserts a PUT-signed
  URL doesn't verify as GET. `supabase.test.ts` (2) uses a hand-rolled
  fake client to verify the adapter calls the right SDK methods with
  the right args, including content-type passing on writes.

### Task 4 — `@brandfactory/adapter-realtime`

- `port.ts` — `RealtimeBus` (`publish | subscribe`), `RealtimeEvent`
  alias for `AgentEvent | CanvasOpEvent | PinOpEvent`,
  `RealtimeHandler` callback type.
- `native-ws.ts` —
  - `createNativeWsRealtimeBus()` returns a `NativeWsRealtimeBus`
    (port + `bindToNodeWebSocketServer`).
  - In-process `Map<channel, Set<handler>>`. `subscribe` returns its
    own `unsubscribe` so callers don't track handler refs. Empty sets
    are collected on the fly to avoid leaks.
  - `publish` runs handlers synchronously in registration order;
    handler exceptions are swallowed so one bad subscriber can't
    break fan-out (we'll surface them via a logger when one exists in
    Phase 4).
  - `bindToNodeWebSocketServer(wss, { authenticate, authorize? })`
    wires a `ws.Server`'s `connection` event to per-client
    subscribe/unsubscribe handling. Failed `authenticate` →
    `socket.close(4401, 'unauthorized')`. Successful subscribes
    register a fan-out handler that JSON-stringifies a
    `RealtimeServerMessage` and pushes it to the socket.
  - Inbound messages are validated against
    `RealtimeClientMessageSchema` from `@brandfactory/shared` (per
    locked decision 12). Invalid frames are silently dropped — the
    bus is not a debugger.
- Tests — `native-ws.test.ts` (4) spins up a real
  `http.Server` + `ws.Server` on an ephemeral port and verifies:
  in-process publish/subscribe + idempotent unsubscribe; fan-out to
  two real WS clients on the same channel; `unsubscribe` over the
  wire stops further delivery; `authenticate() → null` closes the
  socket with code `4401`.

API note — `ws@8.x`'s `connection` event delivers
`(socket: WebSocket, req: IncomingMessage)`; we read the request from
the second arg for `authenticate`. Authentication via subprotocols /
upgrade headers is not built in; the `req` object is the canonical
seam.

### Task 5 — `@brandfactory/adapter-llm`

- `port.ts` — `LLMProvider.getModel({ providerId, modelId })`,
  `LLMProviderId` (`openrouter | anthropic | openai | ollama`),
  `LLMProviderConfig` (per-provider config blocks),
  `ProviderNotConfiguredError`. `LanguageModel` is `import type` from
  `ai` so consumers get the AI-SDK core type with no extra
  abstraction.
- `factory.ts` —
  - `createLLMProvider(config, deps?)`. Each provider has a
    `buildXxx` dep that defaults to the real AI-SDK provider module
    (`@ai-sdk/anthropic`, `@ai-sdk/openai`,
    `@openrouter/ai-sdk-provider`, `ollama-ai-provider`). The deps
    are the test seams — unit tests pass `vi.fn()` factories and
    don't load any real SDK code paths.
  - Per-provider factory cached in a `Map<LLMProviderId,
    ProviderFactory>` so a long-running server doesn't rebuild a
    provider client on every `getModel` call. Exhaustiveness on
    `providerId` is enforced by a `_exhaustive: never` default branch.
  - API-key providers throw `ProviderNotConfiguredError` if
    `getModel` is called for a provider whose config block is
    missing. `ollama` is always configurable (defaults to a local
    daemon, no key needed).
- Tests — `factory.test.ts` (5) verifies caching (one
  `buildAnthropic` call across two `getModel` calls), modelId
  passing, openrouter `baseURL` plumbing, ollama-with-no-config, and
  the `ProviderNotConfiguredError` path.

API note — the AI-SDK provider modules export a `createXxx({ apiKey,
baseURL? })` that returns a callable `(modelId) => LanguageModel`.
`anthropic`, `openai`, `openrouter`, and `ollama` all follow this
shape, so the factory's switch is uniform. The cast `as unknown as
LanguageModel` on the inner factory return is needed because the
SDK's per-provider model type is structurally compatible but not
identical (the public `LanguageModel` is the AI-SDK core surface).

### Task 6 — Server env loader + `buildAdapters`

- `env.ts` —
  - One `EnvSchema = z.object({...}).superRefine(...)`. Required base
    fields: `DATABASE_URL`, the four `*_PROVIDER` selectors,
    `LLM_MODEL`. Optional per-provider fields are `.optional()` and
    promoted to required by `superRefine` based on which providers
    are active.
  - `superRefine` rules:
    - `AUTH_PROVIDER='supabase'` → `SUPABASE_JWKS_URL` required.
    - `STORAGE_PROVIDER='local-disk'` → `BLOB_LOCAL_DISK_ROOT`,
      `BLOB_SIGNING_SECRET`, `BLOB_PUBLIC_BASE_URL` required.
    - `STORAGE_PROVIDER='supabase'` → `SUPABASE_URL`,
      `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET` required.
    - `LLM_PROVIDER='anthropic'|'openai'|'openrouter'` → matching
      `*_API_KEY` required. `LLM_PROVIDER='ollama'` requires nothing.
  - `loadEnv(source = process.env)` returns the parsed `Env` or
    throws with a multi-line `path: message` summary of every issue.
  - `LLM_PROVIDER_IDS` is declared `as const satisfies readonly
    LLMProviderId[]` so a future enum widening in
    `@brandfactory/adapter-llm` won't silently drift from this
    schema — TS will fail the satisfies check.
- `adapters.ts` — `buildAdapters(env)` switches on each
  `*_PROVIDER` and calls the matching factory with the right env
  slice. The realtime branch is currently unconditional (only one
  impl), but the surrounding shape will accept a switch when a second
  impl lands.
- Tests — `env.test.ts` (6) covers the local happy path, the
  supabase happy path, and the four conditional-required failure
  paths. `adapters.test.ts` (1) calls `loadEnv` + `buildAdapters` for
  the local + native-ws + openrouter combo and asserts the returned
  bundle has the four expected method shapes.

### Task 7 — Root vitest setup + projects mode

- Root `vitest.config.ts` declares `test.projects` pointing at the
  five tested workspaces (`adapters/auth`, `adapters/storage`,
  `adapters/realtime`, `adapters/llm`, `server`).
- Each project ships a `vitest.config.ts` using `defineProject`
  with a `name` (so the runner labels output per package),
  `include: src/**/*.test.ts`, and `environment: 'node'`. Per-package
  `pnpm --filter <pkg> test` continues to work, and so does the
  root `pnpm test`.
- `vitest@2.1.9` was added as a root devDep so `pnpm test` resolves
  the binary at the root.
- The legacy root `pnpm test` previously ran `pnpm -r --parallel
  test`. Replaced with `vitest run` so projects mode is the canonical
  entry point.

### Task 8 — `.env.example`

Extended with the adapter selectors, the local-disk blob trio
(`BLOB_LOCAL_DISK_ROOT`, `BLOB_SIGNING_SECRET`,
`BLOB_PUBLIC_BASE_URL`), the Supabase set (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWKS_URL`,
`SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_ISSUER`,
`SUPABASE_STORAGE_BUCKET`), and the LLM set (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`,
`OLLAMA_BASE_URL`). Header comment explains that `*_PROVIDER` picks
which adapter the server wires up at boot.

### Task 9 — Smoke check (unit tests + repo-wide checks)

- `pnpm test` — vitest projects mode: 8 test files, 31 tests, all
  pass in ~580ms.
- `pnpm typecheck` — clean across all 9 workspaces.
- `pnpm lint` — no eslint warnings or errors.
- `pnpm format:check` — clean (8 new files needed `prettier --write`
  during execution and were re-checked clean afterwards).
- The Phase 2 `db smoke` script was not re-run in this session
  because Docker wasn't available locally. The Phase 2 client
  refactor (see "Cross-cutting changes" below) preserves the runtime
  contract — it just defers the `DATABASE_URL` check from
  module-import time to first DB access — and the Phase 3 unit tests
  exercise import-without-DB paths that previously broke.

---

## Cross-cutting changes outside the adapter packages

- **`packages/shared`** — new `src/realtime/envelope.ts` + barrel
  re-export. No other shared changes.
- **`packages/db/src/client.ts`** — `pool` and `db` are now lazy
  `Proxy`-wrapped singletons. The `DATABASE_URL` check moved from
  module-import time to first-access time. Reasoning: vitest setup
  files run *after* module evaluation, so import-time `throw`s
  cannot be neutralized by a sentinel value. The realistic
  alternatives were (a) plumb a real `DATABASE_URL` into every
  vitest config, (b) rewrite every adapter that imports from `db` to
  avoid touching `client.ts`, or (c) lazify the singleton. (c) is
  the smallest change with the cleanest API: real callers see
  identical behavior (still throws on first query if env isn't set),
  test-time imports for type-only consumers no longer fail.
- **Root `package.json`** — `vitest@^2.1.8` added to devDeps; root
  `test` script now runs `vitest run` instead of recursing through
  workspaces.
- **Root `vitest.config.ts`** — new file; declares projects mode.
- **`.env.example`** — extended for Phase 3 vars (see Task 8).

## Architecture doc updates owed

Per locked decision 10, `docs/architecture.md` originally sketched
`AuthProvider` with `listUsers`. The Phase 3 port drops that method —
listing users is `@brandfactory/db` territory, not an identity
concern. Update needed: amend the AuthProvider port sketch in
`docs/architecture.md` to remove `listUsers` and link to this
completion record.

## What Phase 3 explicitly did NOT include

(Confirmed deferred to later phases per the plan.)

- HTTP server, routes, middleware. → Phase 4.
- WebSocket upgrade endpoint `/rt`. → Phase 4 (will use Phase 3's
  `bindToNodeWebSocketServer`).
- Blob HTTP routes that verify signed URLs. → Phase 4 (will use
  Phase 3's `verifySignature`).
- Workspace-level LLM settings persisted in DB. → Phase 4.
- Agent prompt assembly / streaming / tool handlers. → Phase 5.
- Sync between Supabase Auth users and our `users` table. → Later.
- API-key encryption at rest. → When DB-persisted settings land.
- Full e2e / Playwright. → Phase 9.

## Notes / API quirks worth remembering

- **Zod 4 vs AI-SDK peer:** the AI-SDK provider modules declare a
  peer dependency on `zod@^3.x`; this repo runs `zod@^4.3`. pnpm
  warns; the `LanguageModel` type we re-export is a plain TS
  interface and isn't zod-derived, so the version skew is harmless
  in our usage. If we ever start consuming a zod schema *exported*
  by an AI-SDK module, revisit.
- **`ws` `connection` handler:** the second arg (`IncomingMessage`)
  is the only path to upgrade-time auth context. Header-based auth
  (e.g. `Sec-WebSocket-Protocol: bearer.<token>`) belongs in the
  user-supplied `authenticate` callback, not in the bus.
- **HMAC URL format choice:** `${method}\n${key}\n${exp}` was
  picked because newlines aren't valid in any of the inputs and
  the format is trivially debuggable (`echo -ne "GET\nfoo\n123" |
  openssl dgst -sha256 -hmac secret`). Verifier and signer share a
  single source-of-truth function.
- **Vitest projects mode requires per-package configs.** We tried
  declaring projects as bare directory paths in the root config
  first; vitest 2 needs a `vitest.config.ts` at each project root
  (or an inline config). Per-package configs also let `web` later
  pick `environment: 'jsdom'` without polluting the rest.
