# Hosted deployment plan — Fly (server) + Vercel (web) + Supabase (db/auth/storage)

Target architecture for our fork:

| Surface        | Host       | Notes                                                        |
| -------------- | ---------- | ------------------------------------------------------------ |
| Postgres       | Supabase   | `DATABASE_URL` points at Supabase pooler; direct for migrate |
| Auth           | Supabase   | `AUTH_PROVIDER=supabase` on server; JWKS-verified JWTs       |
| Blob storage   | Supabase   | `STORAGE_PROVIDER=supabase`; drops `/blobs` route surface    |
| Backend (API)  | Fly.io     | Hono on Node, single-region single-instance (see Phase 7)    |
| Realtime (WS)  | Fly.io     | Same app, `/rt` upgrade. In-memory bus → single instance     |
| Frontend       | Vercel     | Vite SPA static build, `packages/web` as project root        |

The good news: the adapter layer already has `supabase` implementations for all three pluggable ports (`adapter-auth/src/supabase.ts`, `adapter-storage/src/supabase.ts`, and the Supabase web auth provider at `packages/web/src/auth/providers/supabase.tsx`). `env.ts` already validates the Supabase env surface. `CORS_ALLOWED_ORIGINS` already gates HTTP + WS in lockstep. **No domain code needs to change for provider swaps — the work is provisioning, Dockerfile, fly.toml, Vercel config, CORS values, and secret wiring.**

The not-so-good news: the `native-ws` realtime bus is an in-process pub/sub (`NativeWsRealtimeBus` holds subscribers in a `Map` on one Node heap). Fanning out to 2+ Fly Machines silently drops events across instances — v1 ships as a single-Machine deploy with `min_machines_running = 1` and horizontal scale explicitly deferred.

---

## Conventions

- **Done = it boots and I've curled it.** Every phase ends with an explicit smoke check against the real deployed URL, not just a green `pnpm test`.
- **Secrets in `fly secrets` and Vercel env UI, never in repo.** Root `.env.example` stays the template; `.env` stays gitignored.
- **Migrations run from a trusted workstation** against the Supabase *direct* connection (port 5432, not the pooler). No Fly `release_command` in v1 — too easy to brick the app on a bad migration. Revisit in Phase 7 once we have rollback discipline.
- **One Fly region, one Supabase region, matched.** Cross-region app→db round-trips dominate the agent streaming path latency.

---

## Phase 0 — Provisioning (no code)

**Outcome:** three empty accounts with their CLI auth'd locally.

Tasks:

- [ ] Create the Supabase project. Region decision — see Question 1.
- [ ] Create the Fly org + app (`fly apps create brandfactory-api`). Same region.
- [ ] Create the Vercel project, `packages/web` as Root Directory, framework preset **Vite**. Don't hook up env vars yet.
- [ ] `flyctl auth login` + `vercel login` + save Supabase project ref / anon key / service role key / JWT secret to a password manager.
- [ ] Pick initial domain scheme — see Question 5.

**Smoke check:** `flyctl status -a brandfactory-api` returns a deployed=false app; Vercel shows a placeholder "no deployments yet"; Supabase dashboard reachable.

---

## Phase 1 — Supabase: schema, auth, storage

**Outcome:** production DB has our schema, one test user can log in via magic link, one blob can round-trip through the storage bucket.

Tasks:

- [ ] Capture three connection strings from Supabase → **Settings → Database**:
  - Direct: `postgres://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres` — for migrations.
  - Pooler (transaction mode): `postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres` — for the Fly app.
  - Pooler (session mode, port 5432) — standby, not used in v1.
- [ ] Export the direct URL in a local shell: `export DATABASE_URL=...` and run `pnpm -F @brandfactory/db db:migrate`. Verify the eight tables exist in the Supabase SQL editor.
- [ ] **User identity reconciliation** — see Question 2. Shortest v1 path: keep the internal `users` table; on every first login, upsert `(id = supabase_sub, email = jwt.email)` into `users` before the API is called. Today that gap means a freshly-minted Supabase user 401s on `/me` because `getUserById` returns null. Two implementation options:
  1. **Server-side auto-provision on `/me`** (small change in `routes/me.ts` or the `supabase` auth adapter's `getUserById`): if the JWT verified but no row exists, `INSERT ... ON CONFLICT DO NOTHING` using `sub` as id + `email` claim. Pros: no Supabase-side work. Cons: mixes identity into the auth port.
  2. **Supabase DB trigger on `auth.users`** that inserts into `public.users`. Pros: clean separation. Cons: cross-schema trigger, feels like vendor coupling.
  Recommend option 1 for v1, reversible in a single file.
- [ ] Seed one admin user in the Supabase dashboard (**Auth → Users → Add user**) with a real email we control. Confirm magic-link delivery.
- [ ] Create the storage bucket — name it `brandfactory-blobs` (matches the shipped default naming). Access policy: **private**. The service-role key used by the server bypasses RLS; signed URLs carry the read capability to the browser.
- [ ] Note the JWKS URL: `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. Note the JWT issuer: `https://<ref>.supabase.co/auth/v1`. Audience: `authenticated`.

**Smoke check:**
```
DATABASE_URL=<direct> pnpm -F @brandfactory/db db:migrate   # clean
psql <direct> -c 'select count(*) from users;'               # 1 after auto-provision or manual seed
```

---

## Phase 2 — Server Dockerfile + fly.toml

**Outcome:** `fly deploy --local-only` builds an image that boots locally and hits `/health`.

Tasks:

- [ ] Add `packages/server/Dockerfile`. Multi-stage:
  - **Stage 1 (builder):** node:20-alpine, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm -F @brandfactory/server... build` (builds `shared`, `db`, `agent`, adapters, and `server` in dep order). pnpm's `... build` selector is the correct thing here rather than installing the whole world at runtime.
  - **Stage 2 (runtime):** node:20-alpine, copy `packages/server/dist`, `packages/server/node_modules` (or prune via `pnpm deploy`), `packages/*/dist` for every runtime dep. `WORKDIR /app`, `CMD ["node", "packages/server/dist/main.js"]`. `EXPOSE 3001`.
  - Consider `pnpm deploy --filter @brandfactory/server --prod ./deploy` as a cleaner packaging step — produces a single `deploy/` dir with hoisted `node_modules` pruned to prod deps.
- [ ] Add `fly.toml` at repo root:
  - `app = "brandfactory-api"`, `primary_region = "<matched>"`, `kill_signal = "SIGINT"` (matches the server's existing SIGINT/SIGTERM shutdown path).
  - `[build]` — `dockerfile = "packages/server/Dockerfile"`.
  - `[http_service]` — `internal_port = 3001`, `force_https = true`, `auto_stop_machines = false`, `auto_start_machines = true`, `min_machines_running = 1`. Fly's HTTP handler transparently proxies WebSocket upgrades; no separate `[[services]]` block needed.
  - `[[http_service.checks]]` — `method = "GET"`, `path = "/health"`, `interval = "15s"`, `grace_period = "10s"`.
  - `[deploy]` — leave `release_command` off in v1.
  - `[env]` — non-secret defaults only: `HOST = "0.0.0.0"`, `PORT = "3001"`, `LOG_LEVEL = "info"`, `AUTH_PROVIDER = "supabase"`, `STORAGE_PROVIDER = "supabase"`, `REALTIME_PROVIDER = "native-ws"`, `LLM_PROVIDER = "openrouter"`, `LLM_MODEL = "anthropic/claude-sonnet-4.6"`. Everything else is a secret.
- [ ] Add `packages/server/.dockerignore` — ignores `node_modules`, `dist`, `.env*`, `*.test.*`, `packages/web`, `docs`.

**Smoke check:**
```
fly deploy --local-only --build-only       # docker builds clean, tag printed
docker run --rm -p 3001:3001 \
  -e DATABASE_URL=... -e SUPABASE_* ... <tag>
curl localhost:3001/health                 # 200
```

---

## Phase 3 — Deploy server to Fly

**Outcome:** `https://brandfactory-api.fly.dev/health` returns 200 against the production Supabase DB.

Tasks:

- [ ] Load secrets via `fly secrets set` (single command, single deploy):
  - `DATABASE_URL=<pooler URL, port 6543>`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET=brandfactory-blobs`
  - `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER=https://<ref>.supabase.co/auth/v1`, `SUPABASE_JWT_AUDIENCE=authenticated`
  - `OPENROUTER_API_KEY=<key>`
  - `CORS_ALLOWED_ORIGINS=<leave unset until Phase 5>` — omit for now; single-origin smoke is fine.
- [ ] **Pooler-safety audit of `packages/db/src/client.ts`.** The current `new Pool({ connectionString })` is pg-bouncer-friendly by default (no prepared-statement caching in node-postgres unless you opt in). If we later introduce prepared statements or `pg-native`, transaction-mode pooling will break silently. Leave a one-line comment in `client.ts` pinning the invariant. No code change needed today.
- [ ] `fly deploy`. First deploy is the longest; subsequent are ~60s.
- [ ] Smoke the full HTTP surface:
  ```
  curl https://brandfactory-api.fly.dev/health              # 200
  curl https://brandfactory-api.fly.dev/me                  # 401 (no auth)
  # with a real Supabase access token (grab from a Supabase client login):
  curl -H "Authorization: Bearer <jwt>" .../me              # 200 { id, email }
  ```

**Smoke check:** `fly logs -a brandfactory-api` shows `listening port=3001 host=0.0.0.0` and a `200` for every curl above.

---

## Phase 4 — Realtime / WS on Fly

**Outcome:** `wss://brandfactory-api.fly.dev/rt?token=<jwt>` upgrades, subscribes to a project channel, receives a canvas-op broadcast.

Tasks:

- [ ] No Fly config change needed — the HTTP service proxies `Upgrade: websocket` transparently. Verify against a real browser session, not just `wscat`: connection + subscribe + a canvas-op round-trip (one tab sends, another receives).
- [ ] Confirm the heartbeat (shipped in 0.6.1) is keeping the connection alive through Fly's idle timeout. Fly's edge idle timeout on HTTP(S) is 60s; native-ws already sends ping frames inside that window. If we see idle drops, the knob lives in `packages/adapters/realtime/src/native-ws.ts`.
- [ ] **Fly's single-instance commitment, documented in code.** The realtime bus is in-process. Running `fly scale count 2` silently breaks realtime fan-out across instances (user A on Machine 1 never sees user B's canvas-op on Machine 2). Add a comment in `packages/server/src/adapters.ts` next to the `native-ws` branch calling this out, and a README line under "Scaling" linking to Question 3.

**Smoke check:** open two browser tabs (once Phase 5 is live), edit on one, see the block appear on the other within one RTT.

---

## Phase 5 — Frontend on Vercel

**Outcome:** `https://brandfactory.vercel.app` loads the SPA, a magic-link login completes, the project workspace renders live data from the Fly-hosted API.

Tasks:

- [ ] **Vercel project config.** Already set in Phase 0: Root Directory = `packages/web`. Build command = `pnpm -F @brandfactory/web... build` (the `...` pulls in the shared + adapter deps the web bundle transitively needs). Install command = `pnpm install --frozen-lockfile` at repo root. Output directory = `packages/web/dist`.
- [ ] **SPA fallback.** Add `packages/web/vercel.json` with a single rewrite so TanStack Router's client routes don't 404 on deep-link:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- [ ] **Vercel env vars** (UI, all environments unless noted):
  - `VITE_API_BASE_URL=https://brandfactory-api.fly.dev`
  - `VITE_RT_URL=wss://brandfactory-api.fly.dev/rt`
  - `VITE_AUTH_PROVIDER=supabase`
  - `VITE_SUPABASE_URL=https://<ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=<anon key>`
- [ ] **Deploy.** Push to `main`; Vercel auto-builds and publishes. Preview deploys on PRs use the same env vars (point at prod backend in v1 — see Question 4 if we want a staging backend).
- [ ] **Set Supabase redirect URLs.** In the Supabase dashboard → Auth → URL Configuration, add `https://brandfactory.vercel.app`, `https://*-<team>.vercel.app` (for preview deploys), and `http://localhost:5173` for local dev.

**Smoke check:** load the Vercel URL, enter a real email, click the magic link, land on `/workspaces`. Network tab shows requests going to `brandfactory-api.fly.dev` with a 200 on `/me` and a 101 on `/rt`.

---

## Phase 6 — Cross-origin wiring (CORS)

**Outcome:** the split-origin setup (app on vercel.app, API on fly.dev) runs with CORS + WS origin enforcement, not with it disabled.

Tasks:

- [ ] `fly secrets set CORS_ALLOWED_ORIGINS="https://brandfactory.vercel.app,https://<preview-wildcard>.vercel.app"`. Wildcard is not supported by the current `isOriginAllowed` implementation (it's exact-match — see `packages/server/src/cors.ts`). For preview deploys, the cleanest path is **one explicit production origin in v1**; previews that need live-backend access get added on request. If preview access becomes routine, widen `isOriginAllowed` to support suffix match (`endsWith('.vercel.app')`) behind an opt-in flag — that's a 10-line change and one additional test.
- [ ] Redeploy Fly. Verify in the browser that:
  - `OPTIONS /me` preflight returns `Access-Control-Allow-Origin: https://brandfactory.vercel.app`.
  - The WS upgrade from the Vercel origin succeeds (101), from a random origin 403s.
- [ ] Canvas end-to-end: upload an image via drag-drop. The flow is `POST /blob-urls/:key/write` → Supabase signed PUT → `POST /projects/:id/canvas-ops` → realtime echo → image block appears. Verify the image is readable from the signed GET URL a minute later (TTL 15m default, well inside).

**Smoke check:** a fresh private-browsing login → create a workspace → create a brand → create a project → drop an image → ask the agent "describe what you see". End-to-end pass, no CORS errors in the console.

---

## Phase 7 — Ops, observability, and scale caveats (codify what we're NOT doing)

**Outcome:** the gaps we're deliberately carrying are written down so we don't trip on them.

Tasks:

- [ ] **Scaling policy, documented.** Add a short `docs/operations.md` (or an "Operations" section in the root README):
  - Fly app stays at `count=1`; horizontal scale-out breaks realtime. Revisit via Question 3.
  - DB connection budget: Supabase free-tier pooler allows ~60 concurrent connections; our single Fly Machine's `pg.Pool` defaults to 10 max. Safe margin. Bumping Fly to bigger Machines or raising pool `max` needs to land before we outgrow this.
  - LLM streaming holds a long-lived SSE connection. Fly's default HTTP idle timeout won't kill it (chunks keep arriving), but an entire agent turn is typically <60s so this is not a practical concern yet.
- [ ] **Logs + errors.** Fly's log tail (`fly logs`) is v1 observability. Sentry / Logtail / Better Stack are deferred — see Question 6.
- [ ] **Backups.** Supabase handles daily backups on paid tiers; free tier does not. See Question 1.
- [ ] **Migration drift.** Ship migrations manually: developer exports direct `DATABASE_URL`, runs `pnpm -F @brandfactory/db db:migrate`, then triggers a Fly deploy if app code changed. No automated release_command in v1; revisit once we have a rollback story.
- [ ] **Secret rotation.** Document the flow: `fly secrets set KEY=newvalue` → Fly rolls the Machine automatically. Supabase service-role key rotation requires updating Fly + any tooling holding it.

**Smoke check:** `docs/operations.md` exists and covers each bullet above in one paragraph each.

---

## Phase 8 — CI/CD wiring

**Outcome:** merging to `main` deploys the API to Fly and the web to Vercel without any local `flyctl` calls.

Tasks:

- [ ] **Vercel:** already automatic via Git integration — preview on PR, prod on `main`. Nothing to add beyond Phase 5.
- [ ] **Fly:** add `.github/workflows/deploy.yml`, `on: push: branches: [main]`, single job:
  ```
  - uses: actions/checkout@v4
  - uses: superfly/flyctl-actions/setup-flyctl@v1
  - run: flyctl deploy --remote-only
    env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
  ```
  `concurrency: { group: fly-deploy-main, cancel-in-progress: true }` so rapid merges don't pile up Machine rollouts.
- [ ] Add `FLY_API_TOKEN` (`fly tokens create deploy`) to GitHub repo secrets.
- [ ] Keep the existing `ci.yml` (typecheck / lint / format / test) gating the merge — deploy only runs after the verify job is green on `main`. Simplest wiring: the deploy job `needs: verify` if we promote `ci.yml` into an orchestrated multi-job workflow, or keep them separate and rely on branch protection to require `ci.yml` green before merge.

**Smoke check:** push a no-op commit to `main`. Vercel preview + prod rebuild; Fly deploy logs show a new Machine version. `/health` returns the new release's uptime.

---

## Explicitly out of scope (v1 deploy)

- Multi-region Fly or Supabase replicas.
- Horizontal Fly scale (locked at 1 Machine for realtime correctness).
- Supabase Realtime adapter — revisit in the multi-instance scale-out phase.
- Custom domain + TLS (Fly + Vercel both hand out `*.fly.dev` / `*.vercel.app` defaults; swap later via CNAME + Fly certificates + Vercel domains).
- Preview environments on Fly (per-PR API deploys). Vercel previews hit prod backend in v1.
- Sentry / Datadog / structured error tracking beyond the existing pino-style logger.
- Automated migrations via `release_command`.
- Load testing / SLO definition.
- CodeQL / Dependabot / Renovate (separate dependency-hygiene pass).

---

## Questions for review

1. **Region + Supabase tier.** Which region do we deploy to? (User location drives this — EU vs US.) Free tier or Pro? Free has no daily backups, 500 MB DB limit, and project auto-pauses after a week of inactivity — probably a non-starter past a demo. If we go Pro ($25/mo), we also get PITR and better pooler capacity.

2. **User identity reconciliation.** Supabase `auth.users.id` is our source of truth, but `public.users` is a separate table we maintain. I'm recommending the auto-provision-on-first-call path (insert into `public.users` from the Supabase JWT `sub` + `email` on the first authed request) because it's reversible and stays out of Supabase-specific triggers. Are you OK with that, or would you rather wire a DB trigger from `auth.users` to `public.users`? There's also a schema decision buried here: do we eventually drop `public.users` entirely and pivot every FK to `auth.users(id)`, or keep the local table as an app-owned profile layer? For v1 I'd keep both.

3. **Horizontal scale / realtime.** Fly single-instance is fine until we have a few dozen concurrent editors. Beyond that, we need a cross-instance pub/sub — cleanest path is implementing a `SupabaseRealtimeBus` adapter (the port is already defined and the `RealtimeAdapter` discriminated union in `packages/server/src/adapters.ts` is set up for a second branch). Alternative is Redis + a second adapter. Is this a v1 concern or explicitly deferred until we have a scaling trigger?

4. **Preview environments.** Vercel previews against the prod Fly backend means every PR UI is wired to prod data. Acceptable for us (small team, infrequent previews), or do we need a separate `brandfactory-api-staging` Fly app + a separate Supabase project mirroring prod's schema?

5. **Custom domains.** Default `*.fly.dev` / `*.vercel.app` hostnames are fine for dogfooding. Do we want custom hostnames (e.g. `api.brandfactory.ebbflowgroup.com` + `app.brandfactory.ebbflowgroup.com`) from day one, or add them once we share externally?

6. **Error tracking / observability.** Fly logs + Supabase dashboard is v1. Do we want Sentry (or equivalent) wired in this same deployment pass, or follow-up? If yes, it affects both the server (`@sentry/node` in the error middleware) and the web (`@sentry/react` + source maps upload in the Vercel build).

7. **LLM provider in prod.** The default is `LLM_PROVIDER=openrouter` with `anthropic/claude-sonnet-4.6` via OpenRouter. That's one vendor, one bill, breadth of model choice. Alternative: go direct to Anthropic (`LLM_PROVIDER=anthropic`) for lower per-token cost and first-party SLA, at the price of re-adding OpenRouter later if we want to swap models. Which do we want live?
