# Hosted deploy — Phase 1 completion (Supabase: schema, auth, storage)

**Status:** code landed for the one implementable item (user auto-provisioning); operator-side provisioning still pending (see **Operator checklist** at the bottom).
**Plan source:** [docs/executing/hosted-deployment-plan.md §Phase 1](../executing/hosted-deployment-plan.md).
**Verification:** `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` — all green. Tests 234 → **238 (+4)** across 9 workspaces.

Phase 1 of the hosted-deploy plan covers three Supabase surfaces — database schema, Auth, Storage — plus one gap-closing code change: **user identity reconciliation** between Supabase Auth's `auth.users` and our app-owned `public.users` table.

Most of Phase 1 is provisioning (creating a Supabase project, running migrations against the production DB, minting a bucket, seeding an admin user). None of that is automatable from here — those steps require Supabase dashboard access and a project that doesn't exist yet. What **is** automatable is the code path that auto-provisions the `public.users` row on a Supabase-authed user's first request, so a freshly-minted Supabase account stops 404'ing on `/me`. That's the single code delivery in this pass.

---

## Scope: what code changed, what stayed operator-side

| Phase-1 task                                             | Status              | Notes                                                       |
| -------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| Capture direct + pooler connection strings from Supabase | Operator            | Needs live project; no code delta                           |
| `db:migrate` against prod                                | Operator            | Runs against direct URL from a trusted workstation          |
| **User identity reconciliation (option 1)**              | **Done (this PR)**  | Auto-provision on first verify in the `supabase` adapter    |
| Seed admin user in Supabase dashboard                    | Operator            | Auth → Users → Add user                                     |
| Create `brandfactory-blobs` bucket, private              | Operator            | Name matches `SUPABASE_STORAGE_BUCKET` default              |
| Note JWKS URL + JWT issuer + audience                    | Operator            | Captured as `fly secrets` in Phase 3                        |

The plan asked the user-identity decision between (1) auto-provision on first authed call vs (2) a Supabase `auth.users` trigger. The plan recommended option 1 (reversible, no Supabase-side coupling), and that's what landed.

---

## What changed — user identity auto-provision

### Why it was needed

Supabase Auth owns `auth.users`, keyed by a UUID `sub`. Our domain tables FK against `public.users(id)`. After a fresh Supabase signup (magic link or OAuth), the JWT verifies cleanly (JWKS-signed, valid issuer + audience), but `getUserById(sub)` returns `null` because no `public.users` row exists — so `/me` 404s and every authed route that depends on the row fails similarly. The plan called this out as the "freshly-minted Supabase user 401s on `/me`" gap.

### Where the provisioning hook lives

Inside the Supabase auth adapter — `packages/adapters/auth/src/supabase.ts` — folded into `verifyToken`. Options considered:

1. **In the `/me` route.** Simple, but every authed surface (not just `/me`) needs a provisioned row; shipping on `/me` alone leaves the rest of the API vulnerable to the same NULL user FK when called before `/me`.
2. **In the auth adapter's `verifyToken`.** ✅ Every authed request runs through `verifyToken`, so the row is guaranteed to exist by the time any route handler runs. Slight mixing of identity provisioning into the auth port — the plan explicitly accepts this trade-off.
3. **Supabase DB trigger on `auth.users`.** Cleanest separation, but cross-schema trigger, vendor-coupled, harder to diff in code review. Deferred per plan Question 2.

Went with option 2. The provisioning step is a new injected `ensureUser` dep on `SupabaseAuthDeps`, defaulting to `upsertUserById` from `@brandfactory/db`. Test seams preserved.

### How the upsert works

New helper — `upsertUserById` in `packages/db/src/queries/users.ts`:

```ts
await db
  .insert(users)
  .values({ id, email, displayName })
  .onConflictDoNothing({ target: users.id })
```

Idempotent by construction. `id` is the Supabase JWT `sub` (a UUID Supabase mints on signup, which is type-compatible with our `users.id` `uuid` column). On conflict we **do not** update email — first-seen email is canonical; operator-driven email changes need a dedicated path. Keeps the upsert boring and free of surprising overwrites.

### Dedup: one upsert per `sub` per process

A naive "upsert on every request" design adds one DB write to every authed API call — at ~10–30 ms per round-trip against the Supabase pooler, that's a real cost. The adapter keeps a process-level `Set<string>` of `sub`s it's already provisioned; after first verify, subsequent calls skip the DB write. Memory cost scales with unique-users-in-flight (bounded, small).

Cache-reset semantics: cleared on process restart, which is fine — the upsert is idempotent, so a post-restart re-provision is a no-op. Test seam `provisionedCache?: Set<string>` lets unit tests swap in an empty set or inspect the stored subs.

### Failure handling

If `ensureUser` throws (DB outage, pooler saturation, transient disconnect), `verifyToken` logs a warning to `console.warn` and **continues** — it returns `{ userId: sub }` as if the upsert had succeeded. The reasoning: a DB hiccup shouldn't turn every authed request into a 401 on an otherwise-valid token. The dedup set is **not** populated on failure, so the next request retries the upsert.

The downstream cost is: routes that need a real `users` row (`/me`, anything that joins against the user) will 404/fail as they did pre-provisioning, but the failure is isolated to those routes rather than cascading into blanket 401s. The test case `'does not fail verifyToken when ensureUser throws'` pins this invariant.

### Missing email claim

Supabase JWTs carry an `email` claim for password + magic-link + OAuth flows. The rare absent-email case (custom JWT, anon auth) skips the upsert — inserting with `email = null` would violate the `NOT NULL` constraint on `users.email`. Skip-and-404 preserves the pre-provisioning failure mode for that edge case. Covered by test `'skips auto-provisioning when the email claim is missing'`.

---

## Files touched

- `packages/db/src/queries/users.ts` — new `upsertUserById({ id, email, displayName? })` helper.
- `packages/adapters/auth/src/supabase.ts` — `verifyToken` now calls `ensureUser` on first verify per `sub` with a process-level dedup cache; `SupabaseAuthDeps` gains `ensureUser?` and `provisionedCache?` test seams.
- `packages/adapters/auth/src/supabase.test.ts` — +4 cases:
  - auto-provisions on first verify when email claim is present,
  - dedupes the second verify of the same `sub`,
  - skips when email claim is missing,
  - tolerates `ensureUser` throwing (warns, retries next call).

Nothing else changed. The `AuthProvider` port and `/me` route stayed put; `buildAdapters` in `packages/server/src/adapters.ts` wires the `supabase` branch without modification (the default `ensureUser` is picked up from `@brandfactory/db`).

---

## Verification

```
pnpm typecheck      ✔ 9/9 workspaces clean
pnpm lint           ✔ clean
pnpm format:check   ✔ clean
pnpm test           ✔ 237 passed + 1 skipped (+4 vs 0.8.0)
```

The one skipped case remains `seed.test.ts` (runs only with `DATABASE_URL` set, exercised in CI).

Manual smoke against a real Supabase project is deferred to the operator checklist below — we can't assert against a project that doesn't exist yet.

---

## Operator checklist — what a human still needs to do

Phase 1 is not "done" until a live Supabase project is wired up. The following steps are sequenced and require Supabase dashboard + a trusted workstation.

1. **Create the Supabase project** in the desired region (Question 1 in the plan — not yet decided; flag this before creating, so the region matches the eventual Fly region).
2. **Capture connection strings** from **Settings → Database**:
   - Direct: `postgres://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres` — used for migrations.
   - Pooler (transaction, port 6543) — used by the Fly app.
3. **Run migrations** locally against the direct URL:
   ```
   export DATABASE_URL="postgres://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres"
   pnpm -F @brandfactory/db db:migrate
   ```
   Verify in the Supabase SQL editor that the eight tables exist (`users`, `workspaces`, `workspace_settings`, `brands`, `guideline_sections`, `projects`, `canvases`, `canvas_blocks`, `canvas_events`, `agent_messages`). **Do not** run `db:seed` against a production Supabase DB — the dev seed inserts a fixed-UUID demo user and is intended for local only.
4. **Seed one admin user** in the Supabase dashboard (**Auth → Users → Add user**) with a real email. Confirm the magic-link email arrives. On the admin's first authed request to the deployed API (post-Phase-3), the new `ensureUser` hook will auto-insert a matching `public.users` row — no manual `INSERT` needed.
5. **Create the storage bucket** — name `brandfactory-blobs`, access **private**. The server uses the service-role key (bypasses RLS); browsers get short-lived signed URLs.
6. **Capture JWT metadata** for later phases:
   - `SUPABASE_JWKS_URL = https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`
   - `SUPABASE_JWT_ISSUER = https://<ref>.supabase.co/auth/v1`
   - `SUPABASE_JWT_AUDIENCE = authenticated`

**Smoke check** (once the server is deployed to Fly in Phase 3):
```
psql <direct> -c 'select count(*) from users;'         # 0 before first login, 1 after
# from the browser: sign in → issue a GET /me with the Supabase access token
# Expect 200 { id, email } on first call; check psql again — row now exists.
```

---

## Deferred / not attempted

- The Supabase `auth.users` → `public.users` DB trigger (plan Question 2, option 2). Recommend revisiting only if the auto-provision-in-adapter path becomes a source of bugs. Pivoting `public.users` away entirely (dropping our table in favour of `auth.users(id)` as every FK's target) is a larger migration and explicitly out of scope for v1 deploy.
- A dedup cache invalidation strategy more sophisticated than "process lifetime". If users are deleted out-of-band (e.g. GDPR erasure run against `public.users` while the server process stays up), the cache would skip the re-provision needed on their next sign-in. Not a v1 concern; document-only.
- Any handling of Supabase anonymous sign-ins (no email claim) beyond the skip-and-404 fallback. Anon flow isn't part of the roadmap.
- `displayName` capture from JWT `user_metadata.full_name` or similar. Left `null` on first provision — user can edit later.
