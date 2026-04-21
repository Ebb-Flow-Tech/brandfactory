# Hosted deploy — Phase 3 completion (deploy server to Fly)

**Status:** code landed (one-line invariant comment). The actual deploy — `fly secrets set` + `fly deploy` + curl smoke — is operator work that requires a Fly account, a provisioned Supabase project (Phase 1), and a pushed Docker image. None of that runs from here; the full operator playbook is at the bottom of this doc.
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 3](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green (237 passed + 1 skipped, unchanged from Phases 1–2). `pnpm deploy --prod --legacy` packaging still works end-to-end (re-checked against Phase 2's smoke).

Phase 3 is a provisioning + deploy phase, not a feature phase. Essentially: take the Dockerfile and fly.toml that Phase 2 produced, feed them secrets, push to Fly, and prove `/health` returns 200 over HTTPS against the production Supabase DB.

---

## What code changed

One file: `packages/db/src/client.ts`. Added a four-line comment next to the `new Pool({ connectionString })` call pinning the pooler-safety invariants:

- **Do not enable server-side prepared statements** on this Pool.
- **Do not introduce `pg-native`.**

Both assumptions hold in v1 because node-postgres' default code path does neither — the JavaScript client uses the simple-query protocol by default, and `pg-native` is an explicit opt-in via `require('pg-native')`. The comment exists so a future contributor who adds prepared-statement caching (reasonable Postgres optimisation under a session-mode pooler or a direct connection) knows why it would silently break the production deploy where `DATABASE_URL` points at Supabase's PgBouncer on port 6543 (transaction mode).

Background on why this matters: PgBouncer in transaction mode multiplexes many clients over a small number of Postgres backends; any state that expects to outlive a single transaction (prepared statements cached in a session, `SET` that persists, temporary tables, `LISTEN` subscriptions) gets silently lost when PgBouncer hands the next transaction to a different backend. The failure mode is devious — works fine under low concurrency (one backend always handy), breaks under load when PgBouncer starts multiplexing. The comment is a defensive note, not a code change.

The plan explicitly asked for "a one-line comment in `client.ts` pinning the invariant. No code change needed today." That's exactly what landed.

---

## What stayed operator-side

Everything except the comment. Phase 3 executes three provisioning + deploy actions that require credentials this environment doesn't have:

1. **Load secrets into Fly** via `fly secrets set DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... SUPABASE_STORAGE_BUCKET=brandfactory-blobs SUPABASE_JWKS_URL=... SUPABASE_JWT_ISSUER=... SUPABASE_JWT_AUDIENCE=authenticated OPENROUTER_API_KEY=...`. One command → one deploy. `CORS_ALLOWED_ORIGINS` stays unset until Phase 6 (single-origin smoke is fine per the plan).
2. **`fly deploy`** — first build takes several minutes (Docker layer cache cold); subsequent deploys cache the pnpm install and land in ~60 s.
3. **Smoke the HTTP surface** — `/health` returns 200, `/me` returns 401 without a token, `/me` with a valid Supabase access token returns `{ id, email }` and auto-provisions the `public.users` row (Phase 1's code paying off).

None of this code- or config-changes the repo. If anything goes wrong during the deploy, the fallback action is to patch `fly.toml` or the `Dockerfile` and re-deploy — both in the repo, both covered by Phase 2.

---

## Files touched

- `packages/db/src/client.ts` — one comment added next to `new Pool(...)`. No behaviour change.

Everything else — `fly.toml`, `packages/server/Dockerfile`, `.dockerignore`, the Phase 1 `ensureUser` hook — already shipped; this phase doesn't modify any of it.

---

## Verification

```
pnpm typecheck      ✔ 9/9 workspaces clean
pnpm lint           ✔ clean
pnpm format:check   ✔ clean
pnpm test           ✔ 237 passed + 1 skipped (unchanged)
```

The comment is documentation-only, so no new test coverage. The invariant it protects is a deployment-layer concern that vitest can't express.

---

## Operator playbook — what a human runs to close out Phase 3

### Prerequisites

- Phase 1 completion: Supabase project exists, migrations are up to date against the direct URL, storage bucket `brandfactory-blobs` exists, admin user seeded in the dashboard.
- Phase 2 completion: `fly.toml` + `packages/server/Dockerfile` at head of main, `flyctl auth login` done, `fly apps create brandfactory-api` (or updated app name) done.

### 1 — Gather the secret values

Pull these out of the Supabase dashboard (**Settings → API** and **Settings → Database**) and OpenRouter dashboard:

| Env var                      | Source                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`               | Supabase → Database → Connection string → **Transaction pooler** (port 6543) — **not** the direct URL. |
| `SUPABASE_URL`               | Supabase → API → Project URL                                  |
| `SUPABASE_ANON_KEY`          | Supabase → API → anon public key                              |
| `SUPABASE_SERVICE_KEY`       | Supabase → API → service_role secret                          |
| `SUPABASE_STORAGE_BUCKET`    | `brandfactory-blobs` (hard-coded default)                     |
| `SUPABASE_JWKS_URL`          | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER`        | `https://<project-ref>.supabase.co/auth/v1`                   |
| `SUPABASE_JWT_AUDIENCE`      | `authenticated`                                               |
| `OPENROUTER_API_KEY`         | OpenRouter dashboard → API Keys                               |

### 2 — Set secrets in one command

```
fly secrets set \
  DATABASE_URL="postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_ANON_KEY="<anon>" \
  SUPABASE_SERVICE_KEY="<service_role>" \
  SUPABASE_STORAGE_BUCKET="brandfactory-blobs" \
  SUPABASE_JWKS_URL="https://<ref>.supabase.co/auth/v1/.well-known/jwks.json" \
  SUPABASE_JWT_ISSUER="https://<ref>.supabase.co/auth/v1" \
  SUPABASE_JWT_AUDIENCE="authenticated" \
  OPENROUTER_API_KEY="sk-or-v1-..."
```

Fly restarts the Machine automatically on secret change. No separate deploy needed after this — the next step bundles both.

### 3 — Deploy

```
fly deploy
```

First deploy: ~3–6 min (Docker builds from scratch). Subsequent: ~60 s (pnpm install layer cached). Logs stream by default; watch for:

```
listening port=3001 host=0.0.0.0
```

That's main.ts' post-bind log line. If it doesn't appear, the env validator is the usual culprit — `fly logs` will show the zod error.

### 4 — Smoke

```
curl -i https://brandfactory-api.fly.dev/health
# HTTP/2 200
# { "ok": true, ... }

curl -i https://brandfactory-api.fly.dev/me
# HTTP/2 401  (no bearer token)

# Grab a real access token: log in via the Supabase magic-link flow against
# a Supabase client (the simplest path is the supabase-js REPL:
#   supabase.auth.signInWithOtp({ email }); then .getSession().access_token).
curl -i -H "Authorization: Bearer <jwt>" https://brandfactory-api.fly.dev/me
# HTTP/2 200
# { "id": "<supabase-sub-uuid>", "email": "<your-email>", ... }
```

The 200 on authed `/me` is the Phase 1 `ensureUser` hook earning its keep — first authed request per `sub` auto-provisions the `public.users` row, so the `/me` route (which reads from that table) finds the user.

Confirm the row now exists in Postgres:

```
psql "<direct-url>" -c 'select id, email from users;'
# id | email
# <sub-uuid> | <your-email>
```

### 5 — Document the production URL

Once the app responds, note the production origin — it's needed by:

- **Phase 5** (Vercel env vars): `VITE_API_BASE_URL=https://brandfactory-api.fly.dev`, `VITE_RT_URL=wss://brandfactory-api.fly.dev/rt`.
- **Phase 6** (CORS allowlist): `fly secrets set CORS_ALLOWED_ORIGINS=https://<vercel-url>`.

---

## Things that would block the deploy (preemptive)

- **`DATABASE_URL` points at the direct URL (port 5432), not the pooler (6543).** Works initially; becomes connection-exhaustion time-bomb under load. Symptoms: `remaining connection slots are reserved` in logs. Fix: re-set the secret with the pooler URL.
- **Supabase JWT issuer/audience typo.** `verifyToken` fails with `jwt verification failed: unexpected "iss" claim value` or similar. The values are strict-match against what Supabase issues — double-check them against a token decoded at [jwt.io](https://jwt.io).
- **Region mismatch between Fly and Supabase.** Not a correctness bug, but app ↔ DB round-trips dominate the agent streaming latency. If `/me` takes >500 ms at idle, check that `primary_region` in fly.toml and the Supabase project region are geographically close.
- **Fly Machine OOMs during cold start.** Unlikely at 512 MiB (Phase 2 already bumped this from the 256 MiB default), but if `fly logs` shows `exit status 137` on boot, bump `[[vm]] memory` to `"1gb"` in `fly.toml` and redeploy.
- **Supabase pooler hands out a new session for each query.** Don't add `pg-native`, don't enable prepared-statement caching — the `client.ts` comment exists for exactly this reason.

---

## Deferred / not in this phase

- WS connectivity smoke (`wss://.../rt`) — that's Phase 4's job. The HTTP service config already supports WebSocket upgrades via Fly's transparent proxy; Phase 4 is just "verify two browser tabs stay in sync".
- `CORS_ALLOWED_ORIGINS` — stays unset. Split-origin (Vercel ↔ Fly) kicks in at Phase 6.
- Any `fly scale count 2` — deferred indefinitely (would silently break realtime fan-out; see plan Question 3).
- `fly certs` / custom domain — plan defers (`*.fly.dev` is fine for dogfooding).
- Sentry / structured error tracking — plan Question 6, v1 uses `fly logs`.
- Release-command automated migrations — plan explicitly keeps manual (migrate from trusted workstation against the direct URL, port 5432, not the pooler).
