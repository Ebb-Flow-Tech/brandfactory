# Hosted deploy — Phase 4 completion (Realtime / WS on Fly)

**Status:** code + docs landed. Two-tab browser smoke check is operator work and depends on Phase 5 (frontend on Vercel) being live first — deferred per the plan's own sequencing note.
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 4](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green (237 passed + 1 skipped, unchanged).

Phase 4 is "does WS work on Fly, and is the scale constraint documented where a future contributor will see it?". The answer to both is yes — no Fly config changes (the HTTP service proxies `Upgrade: websocket` transparently), and the single-instance constraint is now pinned in the one place in code that determines the realtime topology: `packages/server/src/adapters.ts`, next to the `native-ws` branch.

---

## What code changed

Two surfaces, both documentation-only:

### 1. `packages/server/src/adapters.ts`

Expanded the existing 2-line note above the `native-ws` branch into a paragraph calling out the single-instance commitment:

- Subscribers live in a `Map` on one Node heap (in-process pub/sub).
- `fly scale count 2` / `replicas > 1` silently drops cross-instance fan-out.
- Horizontal scale requires a second `RealtimeAdapter` branch first (Supabase Realtime or Redis pub-sub).
- Points the reader at `docs/executing/hosted-deployment-plan.md` Question 3 for the scaling-trigger conversation.

This sits exactly where a contributor would edit — `buildAdapters` is the only place the realtime adapter is constructed. Adding a second instance means either widening this branch or landing a new branch; either way, the comment is right under their cursor.

### 2. `README.md`

Added one bullet to the "Deploying it yourself" list: a **Scaling** line that says "stay at one server instance", explains the why (in-process bus, cross-instance fan-out broken), notes vertical scale is fine, and links to hosted-deployment-plan.md Question 3.

---

## What stayed the same

No Fly config changes. The `fly.toml` shipped in Phase 2 already:

- Accepts HTTPS on 443 and forwards to `internal_port = 3001` — Fly's HTTP service transparently upgrades `Upgrade: websocket` requests, so `wss://<app>.fly.dev/rt` works without a separate `[[services]]` block or a TCP handler.
- `min_machines_running = 1` + `auto_stop_machines = false` — the realtime bus can't survive a Machine stop (subscribers evict, reconnect storm on wake), so we pin one Machine always-on.

No heartbeat knob change. The native-ws bus sends pings every 30 s (`DEFAULT_HEARTBEAT_MS = 30_000` in `packages/adapters/realtime/src/native-ws.ts:21`). Fly's HTTP(S) edge idle timeout is 60 s — one ping per 30 s gives 2× headroom, so idle drops aren't a concern. If a future production trace shows drops anyway, the knob is `heartbeatIntervalMs` on `createNativeWsRealtimeBus` (already a config option, already covered by `native-ws.test.ts`).

---

## Verification

### Static checks

```
pnpm typecheck      ✔ 9/9 workspaces clean
pnpm lint           ✔ clean
pnpm format:check   ✔ clean
pnpm test           ✔ 237 passed + 1 skipped (unchanged)
```

Comment-only changes, so no new test coverage. The behaviour under test:

- `packages/adapters/realtime/src/native-ws.test.ts` already covers pings + pong-tracking + zombie-socket termination (9+ cases), pinning the heartbeat semantics Phase 4 relies on.
- `packages/server/src/ws.test.ts` covers the upgrade path, origin guard (Phase 8), and auth rejection — the WS surface Fly proxies into is tested end-to-end.

### Not done here (operator + depends on Phase 5)

The plan's smoke check is:

> open two browser tabs (once Phase 5 is live), edit on one, see the block appear on the other within one RTT.

Can't run that here:

- Needs a real Fly deploy (Phase 3 operator checklist output).
- Needs Phase 5 — the Vercel-hosted SPA that opens `wss://<app>.fly.dev/rt` with a Supabase JWT and renders canvas blocks.
- Needs a real Supabase auth session per browser tab.

An interim command-line smoke (single tab, no visual fan-out) is feasible with `wscat` + a Supabase JWT — see the operator checklist below — but the plan explicitly asks for the two-tab browser version because it's the only check that proves the full edit → broadcast → render loop end-to-end. Deferred to post-Phase-5.

---

## Operator checklist — what to run after Phase 3 + 5 are live

### Single-tab CLI smoke (fast, doesn't need the SPA)

```
# Grab a Supabase access token for a seeded user (any supabase-js client).
export JWT="<access_token>"

# Confirm the WS upgrade succeeds over TLS.
wscat -c "wss://brandfactory-api.fly.dev/rt?token=$JWT"
# > connected
# > {"kind":"subscribe","channel":"project:<some-project-id>"}
# < {"kind":"subscribed","channel":"project:<some-project-id>"}
```

A successful upgrade + subscribe confirms: TLS + Fly upgrade proxy + auth middleware + realtime bus all alive. 101 status in the logs is the sign.

### Two-tab browser smoke (per the plan — needs Phase 5)

1. Two browser tabs, both logged in as the same user against the Vercel-hosted SPA.
2. Open the same project in both.
3. Drop an image block in Tab A.
4. Tab B should paint the block within one RTT (~50–150 ms depending on region).

If Tab B lags or misses the event:

- **DevTools → Network → WS** in Tab B: the `/rt` frame list should include a `canvas-op` message with the new block's id. No frame → WS dead or unsubscribed.
- **`fly logs`**: look for `rt.subscribed` + `rt.publish` lines. If publish fires but no matching subscription, the channel id mismatches — client ↔ server drift, unrelated to Fly.
- **Heartbeat check**: if connections drop after ~60 s idle, the heartbeat isn't firing. `heartbeatIntervalMs` override in `packages/adapters/realtime/src/native-ws.ts` surfaces this, but with the 30 s default this shouldn't happen on Fly.

---

## Things that would break Phase 4 (preemptive)

- **`fly scale count 2`**, `replicas > 1` in any future orchestrator — silently breaks cross-instance fan-out. The adapters.ts comment + README note exist specifically to prevent someone reading the fly.toml and thinking "why not two?".
- **HTTP-only origin (no TLS).** Fly always terminates TLS at the edge and proxies HTTP internally — the internal_port is HTTP on 3001, and that's what the container sees. Clients must use `wss://`, not `ws://` (redirects to HTTPS won't survive a WS upgrade request).
- **Custom domain added without updating `SUPABASE_JWT_ISSUER`/CORS.** If a custom domain lands later and tokens are still issued against `*.supabase.co`, no change needed — the JWT issuer is Supabase, not us. But CORS (`CORS_ALLOWED_ORIGINS`, Phase 6) must list the **web** origin, not the API origin; the WS upgrade guard cross-checks the `Origin` header.
- **Increasing Fly's edge idle timeout** or assuming it's higher than 60 s. It isn't, and you don't control it. The heartbeat is the only defence; keep it under 60 s.

---

## Deferred / not in this phase

- Picking a second `RealtimeAdapter` implementation (plan Question 3). Two serious candidates: Supabase Realtime (no new infra — we're already on Supabase) and Redis pub-sub (cheaper, broader tooling). Decision happens when concurrency demands it, not preemptively.
- WS-specific observability — message-rate metrics, per-channel subscriber counts, reconnect storm detection. `fly logs` + the existing `rt.*` log lines are v1 observability.
- Resumable subscriptions / replay after reconnect. Client-side `onResynced` fires on reconnect (`packages/web/src/realtime/client.ts`) and the canvas re-queries, so state eventually converges. Push-based replay would be an incremental nice-to-have.
- Graceful-drain on deploy. Today a `fly deploy` restarts the Machine, killing all WS connections; clients reconnect within seconds via the realtime client's exponential backoff. Zero-downtime WS drain would need Fly's [drain target](https://fly.io/docs/blueprints/healthcheck-blue-green/) + a server-side "new connections rejected" flip before shutdown — deferred as v1 isn't user-visible-critical.
