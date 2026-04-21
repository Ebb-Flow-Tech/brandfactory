import type { UserId } from '@brandfactory/shared'
import { eq } from 'drizzle-orm'
import { db } from '../client'
import { users } from '../schema'

// Users aren't exposed via shared yet (Phase 3 adapters own the auth shape).
// V1 returns the row verbatim for internal callers.
export type User = typeof users.$inferSelect

export async function getUserById(id: UserId): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email))
  return row ?? null
}

export async function createUser(input: {
  email: string
  displayName?: string | null
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName ?? null,
    })
    .returning()
  if (!row) throw new Error('createUser returned no row')
  return row
}

// Auto-provision helper for the Supabase auth flow: insert a `users` row
// keyed by the JWT `sub`, or no-op if a row with that id already exists.
// `onConflictDoNothing` on the primary key keeps this idempotent and safe to
// run on every verified request. Does NOT update email on conflict — we
// treat the first seen email as canonical; operator-driven changes go
// through a separate flow.
export async function upsertUserById(input: {
  id: string
  email: string
  displayName?: string | null
}): Promise<void> {
  await db
    .insert(users)
    .values({
      id: input.id as UserId,
      email: input.email,
      displayName: input.displayName ?? null,
    })
    .onConflictDoNothing({ target: users.id })
}
