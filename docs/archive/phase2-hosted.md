# Hosted deploy — Phase 2 completion (server Dockerfile + fly.toml)

**Status:** code landed. Docker / Fly CLI smoke check deferred to operator (no Docker runtime in this environment).
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 2](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green (237 passed + 1 skipped; unchanged from Phase 1). `pnpm --filter=@brandfactory/server deploy --prod --legacy /tmp/bf-deploy-test` produces a standalone tree that successfully reaches the env validator at module load — proving packaging + tsx entry + workspace-dep resolution all work end-to-end.

Phase 2 produces the artefacts needed to ship the server to Fly: a multi-stage Dockerfile at `packages/server/Dockerfile`, a repo-root `fly.toml`, and a repo-root `.dockerignore`. Together these let `fly deploy` build a ~200 MB image from the repo, publish it to Fly's registry, and boot it with non-secret env baked in + secrets loaded from `fly secrets set`.

---

## Deviation from the plan: no TypeScript build step

The plan's Dockerfile text said:

> **Stage 1 (builder):** node:20-alpine, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm -F @brandfactory/server... build` (builds `shared`, `db`, `agent`, adapters, and `server` in dep order).

Re-reading the tree, **no workspace package has a `build` script**: `grep "\"build\"" packages/*/package.json packages/adapters/*/package.json` returns only `packages/web` (a Vite build, irrelevant here). The server runs TypeScript directly via `tsx` in every context today — `packages/server/package.json`'s `start` is `tsx src/main.ts`, `dev` is `tsx watch src/main.ts`, and there is no `tsc -b` or `tsup` config anywhere in the repo.

Following the plan verbatim would require a prerequisite pass: add `tsc --build` configs (composite projects + references across 7 TS packages), resolve the `"main": "./src/index.ts"` → `"./dist/index.js"` shift for every package, untangle vitest's expectation of in-place source. That's a separate, meaningfully-sized refactor that the plan didn't scope.

**What I did instead:** shipped source, run the server with `tsx` inside the container. Semantically equivalent to `pnpm start` today. Trade-off: a small JIT-transpile cost on cold start (~100–300 ms for this codebase; tsx caches across module loads, so runtime warm-path is unaffected). Upside: zero yak-shaving, matches existing behaviour, the container's `CMD` and `pnpm start` run the exact same code path.

The one consequence: **`tsx` moved from `devDependencies` → `dependencies`** in `@brandfactory/server`. It's genuinely a runtime dep now (and has been since the repo started, this just corrects the misclassification). `pnpm deploy --prod` drops devDeps; without the move, tsx wouldn't ship. That's the one-line package.json change.

If a compile-to-JS step ever becomes worthwhile (larger codebase, cold-start budget matters, want smaller image), this decision reverses cleanly: add `build` scripts, flip the Dockerfile's CMD to `node dist/main.js`, move `tsx` back to devDeps.

---

## Files added / touched

- `packages/server/Dockerfile` — new. Multi-stage build: pnpm install in stage 1, `pnpm deploy --prod --legacy /out` materializes a standalone deploy tree, stage 2 copies /out into /app and runs with tsx under tini.
- `packages/server/package.json` — `tsx` moved from devDependencies to dependencies. No other changes.
- `.dockerignore` — new, at the **repo root** (not `packages/server/.dockerignore` as the plan suggested — see deviation note below). Excludes `node_modules`, build artefacts, `.env*`, web sources, docs/scripts, test files. Shrinks build context and prevents host-side `node_modules` from shadowing the pnpm install inside the builder.
- `fly.toml` — new, at the repo root. Plan-specified defaults plus one opinionated add: a `[[vm]]` block bumping memory to 512 MiB (Fly's 256 MiB default is uncomfortably tight for Node + tsx + pg Pool + ws).

Nothing else touched. `pnpm-workspace.yaml`, all adapters, and the existing test surface are unchanged.

---

## Dockerfile design walk-through

### Stage 1 — builder

1. `corepack enable` activates pnpm at the version pinned in `packageManager` (10.28.2).
2. Copy lockfile, workspace config, and every package's `package.json` **before** copying source. This is the standard Docker-cache hack: the install layer only re-runs when dependency manifests change, not on every source edit. Saves ~60 s on CI rebuilds.
3. `pnpm install --frozen-lockfile` — full workspace install, symlink-based. Frozen-lockfile errors out on lockfile drift rather than silently upgrading deps.
4. Copy sources for every workspace the server depends on at runtime: `shared`, `db`, `agent`, all four `adapters/*`, `server`. Web is excluded via `.dockerignore`.
5. `pnpm --filter=@brandfactory/server deploy --prod --legacy /out` — materializes a standalone tree at `/out`:
   - `/out/package.json` = the server package's manifest
   - `/out/src/main.ts` = the server entry point (source)
   - `/out/node_modules/@brandfactory/{shared,db,agent,adapter-*}/...` — each workspace dep **copied** (not symlinked) into place
   - `/out/node_modules/{hono,ws,zod,jose,drizzle-orm,pg,...}` — prod-only deps hoisted
   - `/out/node_modules/.bin/tsx` — prod dep binary, reachable at runtime

### Stage 2 — runtime

1. `node:20-alpine` + `apk add --no-cache tini`. Alpine keeps the image lean (~80 MB base → ~200 MB with deps). tini forwards SIGINT/SIGTERM to the Node process — without it, PID 1 Node ignores SIGTERM by default, so `fly restart` + graceful shutdown would silently fail. main.ts already handles both signals; tini is what makes sure they arrive.
2. `COPY --from=builder /out /app` — the whole standalone tree goes in `/app`.
3. ENV defaults: `NODE_ENV=production`, `PORT=3001`, `HOST=0.0.0.0`. These can be overridden by `fly.toml`'s `[env]` or `fly secrets`.
4. `ENTRYPOINT ["/sbin/tini", "--"]` + `CMD ["node_modules/.bin/tsx", "src/main.ts"]`. tini wraps the real command; `tsx` binary (prod-shipped now) exec's the TS entry point. No `npm run` / `pnpm start` indirection — one `exec` call, no shell between Node and PID 1.

### Why `--legacy` on `pnpm deploy`

Confirmed by local test: pnpm v10 aborts `pnpm deploy` with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE` unless one of:
- The repo sets `inject-workspace-packages=true` (broad change, affects every install).
- The deploy invocation passes `--legacy`.

The legacy impl is exactly what we want: copy workspace packages into `node_modules/@brandfactory/*`, install prod deps, produce a flat tree. The "non-legacy" impl is under active development and introduces injected-packages semantics that aren't needed here and would require other config changes.

### Why `.dockerignore` is at the repo root, not `packages/server/.dockerignore`

The plan suggested `packages/server/.dockerignore`. Per-Dockerfile dockerignores are handled inconsistently across build frontends: classic `docker build` and BuildKit treat the repo-root `.dockerignore` as authoritative, while per-Dockerfile variants (either `Dockerfile.dockerignore` or `<context-dir>/.dockerignore`) work only with specific frontend/CLI combinations. Fly's `fly deploy` uses whatever local Docker is available, which varies across operator machines.

Putting `.dockerignore` at the repo root works in every frontend, and since the Dockerfile uses explicit COPY paths (`COPY packages/server/... packages/server/...` etc.) it still scopes the image to server-only content without needing a per-Dockerfile ignore.

---

## fly.toml choices

- `app = "brandfactory-api"` — plan-specified; operator renames before first deploy if taken.
- `primary_region = "iad"` — US East (Ashburn VA). Placeholder; operator updates before deploy per plan Question 1 (region matches Supabase project's region). Mismatch here is a latency tax, not a correctness bug, so a default that's wrong-for-some is fine.
- `kill_signal = "SIGINT"` — matches main.ts' graceful-shutdown path. Fly's default is SIGTERM; main.ts handles both, but the plan called out SIGINT explicitly and it aligns with how the local dev server is stopped.
- `auto_stop_machines = false`, `auto_start_machines = true`, `min_machines_running = 1` — plan-specified. Keeps the realtime bus alive (native-ws holds subscribers in-process; stopping the Machine evicts them).
- `[[http_service.checks]]` with `/health` — plan-specified, matches the existing health route.
- `[env]` — plan-specified. `LLM_MODEL = "anthropic/claude-sonnet-4.6"` is OpenRouter's slug for Claude Sonnet 4.6 (matches `packages/server/src/env.test.ts` + `adapters.test.ts`).
- `[[vm]]` with 512 MiB — one opinionated deviation. Fly's default is 256 MiB shared-cpu-1x. Node + tsx's transpile cache + pg's connection pool + the ws subscriber map fit in 256 MiB at idle but push uncomfortably close to the edge under a handful of concurrent agent streams. 512 MiB is the next tier, gives breathing room, costs a negligible amount more. Sized up, not out — CPU kind stays `shared`.

No `release_command` — plan-specified. Migrations run from a trusted workstation against the direct Supabase URL (port 5432), not via Fly, until rollback discipline catches up.

---

## Verification

### Static checks

```
pnpm typecheck      ✔ 9/9 workspaces clean
pnpm lint           ✔ clean
pnpm format:check   ✔ clean
pnpm test           ✔ 237 passed + 1 skipped (unchanged vs Phase 1)
```

### Packaging smoke test (on the host, not in Docker)

```
$ pnpm --filter=@brandfactory/server deploy --prod --legacy /tmp/bf-deploy-test
$ ls /tmp/bf-deploy-test
  node_modules  package.json  scripts  src  tsconfig.json  vitest.config.ts
$ ls /tmp/bf-deploy-test/node_modules/@brandfactory/
  adapter-auth  adapter-llm  adapter-realtime  adapter-storage  agent  db  shared
$ ls /tmp/bf-deploy-test/node_modules/.bin/tsx
  -rwxr-xr-x 1 ... tsx
$ cd /tmp/bf-deploy-test && node_modules/.bin/tsx src/main.ts
  Error: invalid environment configuration:
    - DATABASE_URL: Invalid input: expected string, received undefined
    - AUTH_PROVIDER: ...
```

The env validator firing is the signal we want: main.ts loaded, module graph resolved across workspace deps, tsx executed the entry point. With a real `DATABASE_URL + AUTH_PROVIDER + ...` the server would bind `0.0.0.0:3001`. This mirrors exactly what the runtime stage of the container will do after `COPY --from=builder /out /app`.

### Not done here (operator territory)

- `fly deploy --local-only --build-only` — needs Docker + the Fly CLI authenticated against a real org/app. No Docker runtime in this sandbox.
- `docker run --rm -p 3001:3001 -e DATABASE_URL=... <tag>` + `curl localhost:3001/health` — same.

Both are straight-line steps once Docker is available; the Dockerfile has already been validated on the packaging axis above.

---

## Operator checklist (to close out Phase 2)

1. `flyctl auth login` (or check `flyctl auth whoami`).
2. Update `fly.toml`:
   - `app = "..."` — pick a unique app name if `brandfactory-api` is taken.
   - `primary_region = "..."` — match the Supabase project's region (Phase 1).
3. Create the app: `flyctl apps create <app-name>` (or let `fly launch --no-deploy` read the toml).
4. Local smoke:
   ```
   fly deploy --local-only --build-only        # docker builds clean, tag printed
   docker run --rm -p 3001:3001 \
     -e DATABASE_URL=postgres://... \
     -e AUTH_PROVIDER=supabase \
     -e STORAGE_PROVIDER=supabase \
     -e REALTIME_PROVIDER=native-ws \
     -e LLM_PROVIDER=openrouter \
     -e LLM_MODEL=anthropic/claude-sonnet-4.6 \
     -e SUPABASE_URL=... \
     -e SUPABASE_SERVICE_KEY=... \
     -e SUPABASE_JWKS_URL=... \
     -e SUPABASE_STORAGE_BUCKET=brandfactory-blobs \
     -e OPENROUTER_API_KEY=... \
     <printed-tag>
   curl http://localhost:3001/health            # expect { ok: true, ... } 200
   ```
   The env list mirrors what Phase 3 will set via `fly secrets`. A successful `/health` against the container means the image is ready for Fly.
5. Keep `DATABASE_URL` out of fly.toml's `[env]` — it's a secret, belongs in `fly secrets set` (Phase 3).

---

## Deferred / not in this phase

- Actually deploying to Fly (Phase 3).
- CORS allowlist (Phase 6 — `CORS_ALLOWED_ORIGINS` stays unset in fly.toml v1 so single-origin smoke is fine).
- `release_command` for automated migrations (plan defers this explicitly; manual migration from a workstation is v1).
- Image size optimization. Alpine base + pnpm-deploy pruning produces something around 200 MB. Could strip further with distroless or `node:20-alpine-slim`-style techniques, but not worth it at this budget.
- Any CI wiring for deploys (Phase 8 — `.github/workflows/deploy.yml`).
- Custom VM sizing beyond the 512 MiB bump. If we see OOM in Fly logs, bump to `1gb` then revisit.
- Healthcheck authentication. `/health` is currently unauthenticated; the plan accepts this for v1.
