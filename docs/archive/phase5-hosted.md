# Hosted deploy — Phase 5 completion (frontend on Vercel)

**Status:** code landed (one config file). Vercel project creation, env var wiring, git push, and the magic-link smoke are operator work — they live inside the Vercel dashboard and Supabase dashboard, not in this repo.
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 5](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm format:check` clean. `pnpm -F @brandfactory/web build` produces `packages/web/dist/` in ~500 ms (identical output to the pre-Phase-5 build; the vercel.json doesn't affect the build pipeline).

Phase 5 stands up the web app on Vercel so it can talk to the Fly-hosted API. The only repo-side delivery is the SPA-fallback `vercel.json` — without it, any deep-link into a TanStack Router client route (e.g. `/workspaces/abc/projects/xyz`) 404s on refresh because Vercel looks for a literal static file at that path.

Everything else — creating the Vercel project, setting env vars, configuring Supabase auth redirect URLs, pushing to main to trigger the first build — requires dashboard access and lives in the operator playbook below.

---

## What code changed

One file added:

### `packages/web/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Single rewrite: every incoming path that isn't a static asset maps back to `index.html`, so the SPA router owns all routing. This is the standard Vite+SPA pattern on Vercel. Static assets (JS, CSS, fonts, images under `/assets/*`) keep their direct file-match behaviour because Vercel's rewrite engine checks the filesystem first and only falls back to the rewrite on a miss.

The `$schema` line is Vercel's JSON schema URL — enables autocomplete + validation in editors that speak LSP, zero runtime effect.

**Root Directory placement matters.** `vercel.json` must sit at the Vercel "Project Root Directory", which per the plan is `packages/web` (not the repo root). If it lived at the repo root Vercel would never see it because the Vite build is scoped to `packages/web`. This also means the `rewrites` only affect the web app — the monorepo's other packages are invisible to Vercel.

---

## What didn't change

- **Build command stayed at `pnpm -F @brandfactory/web build`** (or the plan's `pnpm -F "@brandfactory/web..." build` — the `...` transitive selector works too; confirmed locally, pnpm v10 silently skips workspaces without a `build` script). Both produce the same `packages/web/dist/` output.
- **Vite resolves cross-package TS via workspace symlinks at build time.** The Phase 2 decision (ship source, skip `tsc -b`) applies here too: `@brandfactory/shared`'s `main: ./src/index.ts` is what Vite's module graph walks, bundling TS directly into the final JS.
- **The 1.1 MB main-chunk warning persists.** Phase 7 Step 15 already flagged this — TipTap + Radix dominate. Fixing it is a code-splitting / lazy-import pass, out of scope here.
- **No SSR, no edge functions, no build-time env resolution.** Pure static Vite build. Vercel's zero-config Vite preset does the right thing.

---

## Verification

```
pnpm format:check                          ✔ clean
pnpm -F @brandfactory/web build            ✔ dist/ produced, 1.1 MB main chunk (pre-existing warning)
```

Static checks don't catch Vercel's rewrite semantics — a broken `vercel.json` would only surface on first deploy (Vercel logs `Invalid rewrite source/destination` or similar) or on a 404 for a deep-linked route. The operator smoke below covers this.

---

## Operator playbook — setting up the Vercel project

### Prerequisites

- Phase 3 complete: `https://<fly-app>.fly.dev/health` returns 200.
- Supabase project exists (Phase 1), admin user seeded.
- GitHub push access to the repo.
- A Vercel account linked to the GitHub org/repo.

### 1 — Create the Vercel project

In the Vercel dashboard → **Add New → Project** → pick the `brandfactory` repo (or whatever the fork is named).

Configure:

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Framework Preset   | **Vite**                                                           |
| Root Directory     | `packages/web`                                                     |
| Build Command      | `pnpm -F @brandfactory/web build` (or the plan's `...` variant)    |
| Install Command    | `pnpm install --frozen-lockfile` (at repo root — Vercel handles the cwd flip) |
| Output Directory   | `dist` (relative to Root Directory → effectively `packages/web/dist`) |
| Node.js Version    | 20.x (matches `.nvmrc` + Dockerfile)                               |

Don't click Deploy yet — env vars first.

### 2 — Env vars (Vercel → Project Settings → Environment Variables)

All five go to **Production + Preview + Development** (unless you want a staging API; see plan Question 4).

| Name                   | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL`    | `https://<fly-app>.fly.dev`                                  |
| `VITE_RT_URL`          | `wss://<fly-app>.fly.dev/rt`                                 |
| `VITE_AUTH_PROVIDER`   | `supabase`                                                   |
| `VITE_SUPABASE_URL`    | `https://<supabase-ref>.supabase.co`                         |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon public` key (this inlines into the client bundle; public-safe by design) |

Service-role key stays server-side — it's in Fly's secrets, not here. Phase 2's `packages/web/.env.example` documents the same five vars for local dev.

### 3 — Configure Supabase auth redirect URLs

Supabase dashboard → Auth → URL Configuration:

- **Site URL**: `https://<vercel-app>.vercel.app`
- **Redirect URLs**: add
  - `https://<vercel-app>.vercel.app/**`
  - `https://*-<vercel-team-or-user>.vercel.app/**` (for preview deploys)
  - `http://localhost:5173/**` (local dev)

Trailing `/**` is important — Supabase's magic-link callbacks include a hash fragment and the redirect allowlist pattern-matches on prefix.

### 4 — Deploy

Push to `main`. Vercel's Git integration auto-triggers the build; first deploy takes ~2–3 min. The production URL lands under `https://<project-name>.vercel.app`.

### 5 — Smoke

Open `https://<project-name>.vercel.app` in a fresh private window. Expected flow:

1. Landing / login page renders (auth check runs, no session → redirect to `/login`).
2. Enter a real email (the one seeded in Supabase Auth).
3. Click the magic-link from the email inbox.
4. Land back on the SPA at `/workspaces` (or wherever the post-auth route sends you).
5. **DevTools → Network:**
   - `GET /me` against `brandfactory-api.fly.dev` → 200, response body `{ id, email, ... }`.
   - `WS /rt?token=...` against `brandfactory-api.fly.dev` → 101 Switching Protocols.
   - First `/me` also triggers Phase 1's `ensureUser` upsert server-side (idempotent).

If `/me` returns 401: the Supabase JWT isn't reaching the server — check `VITE_API_BASE_URL` (exact match, no trailing slash), the `Authorization: Bearer ...` header is attached client-side, and `fly logs` for the adapter's `jwt verification failed: ...` breadcrumb.

If the WS upgrade fails: confirm `VITE_RT_URL` uses `wss://` not `ws://`, and that the Fly app's HTTPS cert is valid (`fly status`).

If a deep-linked URL like `/workspaces/abc/projects/xyz` 404s on browser refresh: the `vercel.json` rewrite isn't in effect. Confirm it's at `packages/web/vercel.json`, not the repo root, and that it deployed (Vercel build logs will show "Detected vercel.json").

---

## Things that would block Phase 5 (preemptive)

- **CORS not configured yet.** Split-origin (vercel.app ↔ fly.dev) will fail CORS preflight on every POST/PATCH/DELETE until Phase 6 lands. `/health` and simple GETs without custom headers may work in some browsers due to CORS relaxations for simple requests, but any authed request with `Authorization: Bearer ...` triggers preflight — so `/me` will fail in the browser even though curl works. This is **expected** between Phase 5 and Phase 6; the plan sequences them intentionally.
- **Env vars set but not redeployed.** Vercel env var changes don't retroactively update existing deployments — need to trigger a new build (empty commit + push, or the "Redeploy" button with "Clear build cache" unchecked).
- **Vercel's Ignored Build Step / monorepo turborepo preset kicking in.** If someone enables "Only build when files in packages/web change", commits that touch `packages/shared` won't trigger a rebuild. Leave Ignored Build Step unset for v1 (the build is fast).
- **Preview deploys hitting prod API.** Per plan Question 4, Vercel previews use the production `VITE_API_BASE_URL`. Acceptable for small-team preview flow, but any preview that mutates state writes to prod. If that becomes a problem, land a staging Fly app + a `VITE_API_BASE_URL` scoped to the Preview environment.

---

## Deferred / not in this phase

- CORS allowlist (Phase 6) — until it ships, browser-based smoke of `/me`, canvas mutations, and any POST will fail preflight. `wss://.../rt` is OK because CORS doesn't apply to WS (the upgrade-time `Origin` check is a separate guard, currently permissive when `CORS_ALLOWED_ORIGINS` is unset).
- Custom domain on Vercel (plan Question 5) — `*.vercel.app` default hostname is fine for dogfooding. Adds later via Vercel Domains + a CNAME.
- Preview-env-scoped backend (plan Question 4) — would need a separate Fly app + Supabase project. v1 skips.
- Edge Functions / image optimization / ISR — none of this applies to the SPA.
- `scripts/vercel-setup.sh` or other turnkey bootstrapping — Vercel's UI is the one-time operation; scripting it saves no time.
