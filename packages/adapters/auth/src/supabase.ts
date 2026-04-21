import type { UserId } from '@brandfactory/shared'
import {
  getUserById as dbGetUserById,
  upsertUserById as dbUpsertUserById,
  type User,
} from '@brandfactory/db'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { type AuthProvider, InvalidTokenError } from './port'

export interface SupabaseAuthConfig {
  jwksUrl: string
  audience?: string
  issuer?: string
}

export interface SupabaseAuthDeps {
  getUserById?: (id: string) => Promise<User | null>
  // Called on first verify per process per `sub`: inserts a `public.users`
  // row for the Supabase-auth user so every downstream FK resolves. See
  // `upsertUserById` in `@brandfactory/db` for the `ON CONFLICT DO NOTHING`
  // semantics. Idempotent; swap in a test double for unit tests.
  ensureUser?: (input: { id: string; email: string }) => Promise<void>
  // Test seam: substitute a JWKS resolver instead of fetching one.
  jwks?: JWTVerifyGetKey
  // Test seam for the provision-once-per-process dedup cache.
  provisionedCache?: Set<string>
}

export function createSupabaseAuthProvider(
  config: SupabaseAuthConfig,
  deps: SupabaseAuthDeps = {},
): AuthProvider {
  const jwks = deps.jwks ?? createRemoteJWKSet(new URL(config.jwksUrl))
  const lookup = deps.getUserById ?? ((id: string) => dbGetUserById(id as UserId))
  const ensureUser = deps.ensureUser ?? dbUpsertUserById
  // Process-level dedup: avoid a DB round-trip on every authed request
  // once we've already provisioned a given `sub`. Grows with unique users,
  // which is bounded in practice. Cleared on process restart — that's fine,
  // the upsert is idempotent so a second provision is a no-op.
  const provisioned = deps.provisionedCache ?? new Set<string>()

  return {
    async verifyToken(token: string) {
      let sub: string
      let emailClaim: string | undefined
      try {
        const { payload } = await jwtVerify(token, jwks, {
          audience: config.audience,
          issuer: config.issuer,
        })
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          throw new InvalidTokenError('jwt missing sub claim')
        }
        sub = payload.sub
        if (typeof payload.email === 'string' && payload.email.length > 0) {
          emailClaim = payload.email
        }
      } catch (err) {
        if (err instanceof InvalidTokenError) throw err
        const msg = err instanceof Error ? err.message : 'jwt verification failed'
        throw new InvalidTokenError(`jwt verification failed: ${msg}`)
      }

      // Auto-provision the `public.users` row on first verify per process.
      // Skipped when no email claim is present — the row requires a NOT NULL
      // email, and the subsequent `getUserById` miss will surface as a 404
      // at the `/me` route, preserving the pre-auto-provision failure mode.
      // Failures here are swallowed-and-logged rather than thrown: a DB
      // hiccup shouldn't turn every authed request into a 401. The next
      // request retries.
      if (emailClaim && !provisioned.has(sub)) {
        try {
          await ensureUser({ id: sub, email: emailClaim })
          provisioned.add(sub)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[supabase-auth] ensureUser failed for sub=${sub}: ${msg}`)
        }
      }

      return { userId: sub }
    },
    async getUserById(id: string) {
      return lookup(id)
    },
  }
}
