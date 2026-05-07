import { type FormEvent, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Module-level client — null when env vars are absent (dev without Supabase).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
// `detectSessionInUrl: false` — we exchange the magic-link code ourselves in
// the effect below so we can surface exchange errors instead of letting
// supabase-js log silently and leave the user staring at the form.
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { detectSessionInUrl: false, flowType: 'pkce' },
      })
    : null
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

function readInitialUrlError(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const queryErr = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  const hash = new URLSearchParams(url.hash.slice(1))
  const hashErr = hash.get('error_description') ?? hash.get('error')
  const raw = queryErr ?? hashErr
  return raw ? decodeURIComponent(raw.replace(/\+/g, ' ')) : null
}

export function SupabaseAuthProvider() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(() => readInitialUrlError())
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) return

    const finishSignIn = async (token: string) => {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          setError(`Sign-in failed (${res.status}): ${body || res.statusText}`)
          return
        }
        const data = (await res.json()) as MeResponse
        setAuth(token, data.id)
        await navigate({ to: '/workspaces' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Sign-in network error: ${msg}`)
      }
    }

    const code = new URL(window.location.href).searchParams.get('code')

    if (code) {
      // Manual exchange so we can show the actual error instead of letting
      // supabase-js log silently. Strip `?code=` from the URL on success so
      // a refresh doesn't try to re-exchange.
      void supabase.auth.exchangeCodeForSession(code).then(({ data, error: exErr }) => {
        if (exErr) {
          setError(`Magic-link exchange failed: ${exErr.message}`)
          return
        }
        window.history.replaceState({}, '', window.location.pathname)
        if (data.session?.access_token) {
          void finishSignIn(data.session.access_token)
        }
      })
    } else {
      // No code in URL — check if a session is already present (e.g. user
      // refreshed after a successful exchange in another tab).
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) void finishSignIn(data.session.access_token)
      })
    }
  }, [setAuth, navigate])

  if (!supabase) {
    return (
      <p className="text-sm text-destructive">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for Supabase auth.
      </p>
    )
  }

  if (sent) {
    return (
      <div className="w-full space-y-1 text-center">
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a magic link to <strong>{email}</strong>.
        </p>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // Land on /login so SupabaseAuthProvider mounts and processes the
        // ?code= query. Returning to `/` lets indexRoute.beforeLoad redirect
        // before the auth code is exchanged, stripping the query.
        options: { emailRedirectTo: `${window.location.origin}/login` },
      })
      if (signInError) {
        setError(signInError.message)
      } else {
        setSent(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
        {loading ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  )
}
