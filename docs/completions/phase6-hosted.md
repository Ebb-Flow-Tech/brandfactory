# Hosted deploy — Phase 6 completion (cross-origin wiring / CORS)

**Status:** no code changes required — the CORS gating shipped in v0.8.0 (Phase 8) already covers everything Phase 6 asks for. This phase is entirely operator work: set one secret, redeploy, smoke. The completion below is documentation + a playbook.
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 6](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green (237 passed + 1 skipped, unchanged from Phase 5).

Phase 6 turns on the split-origin allowlist so the Vercel-hosted SPA (Phase 5) can call the Fly-hosted API (Phase 3) with authed requests. The code to do this already exists: `parseCorsAllowedOrigins` + `isOriginAllowed` helpers in `packages/server/src/cors.ts`, plus the conditional `hono/cors` mount in `app.ts` and the WS upgrade-guard in `ws.ts`. All of it was designed to be a runtime-only switch: set `CORS_ALLOWED_ORIGINS` → both transports flip on in lockstep.

So: no repo changes, one fly-secret change, one redeploy.

---

## Why no code change

Phase 8 (version 0.8.0, shipped 2026-04-20) already landed:

- `parseCorsAllowedOrigins(raw)` — folds empty/whitespace/unset to `null` (the "no allowlist" sentinel) and a real list to `string[]`.
- `isOriginAllowed(origin, allowlist)` — exact-match check; `null` allowlist permits all, set allowlist + missing origin denies, set allowlist + origin requires `Array.includes` match.
- `app.ts` — `hono/cors` mounted conditionally (before `onError`), with `origin: req → allowlist.includes(origin) ? origin : null`, `credentials: true`, `allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS']`, `allowHeaders: ['content-type','authorization']`.
- `ws.ts` — the upgrade handler 403s before `handleUpgrade` when the origin isn't allowed, writing `HTTP/1.1 403 Forbidden\r\n\r\n` directly to the socket so the browser reads a permanent denial (not a transport error that would trigger client-side reconnect loops).
- 8 cases in `cors.test.ts` + 1 integration-style WS upgrade-guard case in `ws.test.ts`.

From the server's perspective, Phase 6 = "change the value of one env var". No migration, no shim, no feature flag — the allowlist empty-vs-set state is the switch, and it's been read on every request since v0.8.0.

The only scenario that would need code is **wildcard support** (e.g. `https://*.vercel.app` for preview deploys). The current implementation is exact-match only. The plan's Phase 6 text calls this out:

> Wildcard is not supported by the current `isOriginAllowed` implementation (it's exact-match — see `packages/server/src/cors.ts`). For preview deploys, the cleanest path is **one explicit production origin in v1**; previews that need live-backend access get added on request.

Following that scope discipline: preview-origin support is deferred, not preemptively landed. If preview access becomes routine, the fix is ~10 lines (a suffix-match variant of `isOriginAllowed` behind an opt-in flag) plus one test. Not this phase.

---

## Operator playbook

### Prerequisites

- Phase 3 complete: `https://<fly-app>.fly.dev/health` returns 200.
- Phase 5 complete: Vercel project deployed at `https://<project>.vercel.app`.
- Supabase redirect URLs include the Vercel origin (Phase 5 operator step).

### 1 — Set the allowlist and redeploy

One `fly secrets set` — Fly restarts the Machine automatically, so this acts as the redeploy:

```
fly secrets set CORS_ALLOWED_ORIGINS="https://<project>.vercel.app"
```

Notes:

- **Exact-match only.** Paste the full origin: scheme + host (+ port if non-default). No trailing slash, no wildcard, no path.
- **Custom domain?** Include both — `https://<project>.vercel.app,https://app.brandfactory.com` (comma-separated, no spaces). Both need to match for the transition period.
- **Preview deploys?** If a preview URL needs live-API access, add it temporarily: `...vercel.app,https://<preview-hash>-<team>.vercel.app`. Not scalable across many previews — upgrade to wildcard support (deferred item above) if this becomes routine.
- **Unsetting** (`fly secrets unset CORS_ALLOWED_ORIGINS`) flips back to "no allowlist" — permissive, development-style. Don't do this in prod.

### 2 — Smoke from the browser (DevTools open)

Load the Vercel URL in a fresh private-browsing session and check **DevTools → Network**:

| Request                              | Expected                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `OPTIONS /me` (preflight, auto-fired before the real GET) | 204 with `Access-Control-Allow-Origin: https://<project>.vercel.app`, `Access-Control-Allow-Credentials: true`, and `Access-Control-Allow-Methods`/`-Headers` present. |
| `GET /me` with `Authorization: Bearer <jwt>` | 200, body `{ id, email, ... }`. No CORS error in Console.                 |
| `WS /rt?token=...` (101 upgrade)     | Upgrade succeeds. `Origin` header on the upgrade carries the Vercel URL.     |

If you see **CORS error: Response to preflight request doesn't pass access control check** in the Console — the allowlist isn't matching. Usually:

- Typo in the origin (trailing slash, `http` vs `https`, missing subdomain).
- Secret set but Machine hasn't restarted yet (wait ~10 s, or `fly status` to confirm a new version).
- Browser cached the previous failed preflight (hard-refresh or new private window).

### 3 — WS deny-path smoke (optional, security-adjacent)

Confirm the WS upgrade rejects a wrong origin. Either:

```
# From curl, manually asserting the Origin header:
curl -i \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Origin: https://evil.test" \
  "https://<fly-app>.fly.dev/rt?token=$JWT"
# HTTP/1.1 403 Forbidden
```

Or via `wscat` with a forged origin (`--header "Origin: https://evil.test"`). 403 is the correct response. A successful 101 from a disallowed origin is a bug — check `fly logs` for the "ws: origin-denied" breadcrumb.

### 4 — End-to-end user journey (the plan's full smoke)

Fresh private window on the Vercel URL:

1. **Login** — magic-link flow completes, land on `/workspaces`.
2. **Create a workspace** — PATCH succeeds, workspace appears in the sidebar.
3. **Create a brand** — save succeeds, brand editor loads.
4. **Create a project** — split-screen opens with an empty canvas.
5. **Drop an image** onto the canvas. The flow hits:
   - `POST /blob-urls/:key/write-url` → signed PUT URL back.
   - PUT direct to Supabase Storage → 200.
   - `POST /projects/:id/canvas-ops` with the image-block op → 200 + realtime echo.
   - Image block paints on the canvas.
6. **Verify the signed GET URL works a minute later** — click the image to open the lightbox; the `<img src>` should load (signed URLs default to 15-minute TTL so this is well within).
7. **Ask the agent** "describe what you see" in the chat pane. SSE stream opens, agent reads the canvas context, streams a response back.

No CORS errors in the Console at any step. Zero-knowledge check: Network tab should show requests to `brandfactory-api.fly.dev` with `Origin: https://<project>.vercel.app` in every request's request headers and `Access-Control-Allow-Origin: https://<project>.vercel.app` in every response's CORS headers.

---

## Things that would break Phase 6 (preemptive)

- **Trailing slash in the allowlist.** `https://x.vercel.app/` doesn't equal `https://x.vercel.app` — browser's `Origin` header is always without-slash. The `split/trim/filter` in `parseCorsAllowedOrigins` doesn't normalize this (by design — exact-match keeps the trust boundary crisp). Paste the value carefully.
- **Mixing `http` and `https` in preview links.** Vercel issues HTTPS-only URLs; if a dev copy-pastes a `http://` variant it won't match.
- **Wildcards in the env value** (e.g. `https://*.vercel.app`). `isOriginAllowed` treats this as a literal string, which never matches any real origin. You'll see all requests denied — the fix is either the explicit full origin or the deferred suffix-match extension.
- **Preview deploys using the production API without being in the allowlist.** Acceptable per plan Question 4 — previews-against-prod is an opt-in we haven't opted into. First preview that needs live API access: add its origin to the allowlist for the duration, or implement the suffix-match extension.
- **Custom headers not in the allowlist.** `hono/cors` preflight only advertises `content-type,authorization`. If a route ever starts accepting a custom header (e.g. `X-Request-Id` from the client), preflight will reject it. Add the header in `app.ts`'s `cors()` config + ship a deploy.
- **`credentials: true` with a reflected wildcard origin.** Wouldn't happen today (we reflect only exact-match origins) but worth flagging: browsers reject `Access-Control-Allow-Origin: *` when `credentials: 'include'`. If the cors config is ever relaxed to `origin: '*'`, `credentials` has to drop to `false` too.

---

## Deferred / not in this phase

- **Wildcard / suffix-match origin support.** ~10 lines (a `match` variant that falls through `exact-match → endsWith-match → deny`) + a test. Land when preview-against-prod becomes common and adding each preview URL by hand gets tedious.
- **Per-environment CORS policies.** Single allowlist today; if staging + prod both live under the same server, they share it. Adding environment-scoped lists is a Phase-9-or-later concern.
- **CORS for non-Vercel frontends** (self-host scenarios where someone ships their own SPA). The allowlist already supports this — just list their origin. No code needed.
- **CSRF-style double-submit tokens or origin-locked CSRF cookies.** Out of scope; we're bearer-token-based, `Authorization: Bearer ...` is immune to CSRF by construction, and we use `credentials: true` purely for the occasional Supabase cookie round-trip on the auth path.
