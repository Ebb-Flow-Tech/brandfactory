import { describe, it, expect, vi } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, type JWK, type KeyLike } from 'jose'
import { createSupabaseAuthProvider } from './supabase'
import { InvalidTokenError } from './port'

const ISSUER = 'https://issuer.test'
const AUDIENCE = 'authenticated'

async function makeKeySet() {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = (await exportJWK(publicKey)) as JWK
  jwk.kid = 'test-kid'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  return { privateKey, jwks: async () => publicKey }
}

async function signToken(privateKey: KeyLike, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(typeof claims.sub === 'string' ? claims.sub : 'user-1')
    .setIssuedAt()
    .setExpirationTime(typeof claims.exp === 'number' ? claims.exp : '5m')
    .sign(privateKey)
}

describe('createSupabaseAuthProvider', () => {
  it('verifies a valid token and returns the sub as userId', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const token = await signToken(privateKey, { sub: 'abc-123' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
  })

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const expiredEpoch = Math.floor(Date.now() / 1000) - 60
    const token = await signToken(privateKey, { sub: 'abc-123', exp: expiredEpoch })
    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects a token with no sub claim', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('auto-provisions a user row on first verify when email claim is present', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(1)
    expect(ensureUser).toHaveBeenCalledWith({ id: 'abc-123', email: 'a@b.test' })
  })

  it('dedupes auto-provisioning: second verify of the same sub skips ensureUser', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    await auth.verifyToken(token)
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(1)
  })

  it('skips auto-provisioning when the email claim is missing', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    // No `email` claim on the token.
    const token = await signToken(privateKey, { sub: 'abc-123' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
    expect(ensureUser).not.toHaveBeenCalled()
  })

  it('does not fail verifyToken when ensureUser throws (DB outage tolerance)', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
    expect(warn).toHaveBeenCalledOnce()
    // Dedup set is NOT populated on failure → next call retries.
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
