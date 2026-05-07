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
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

export function SupabaseAuthProvider() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires on subscribe — covers the case where the URL
      // exchange completed before this listener attached.
      const isAuthEvent = event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
      if (isAuthEvent && session?.access_token) {
        const token = session.access_token
        void fetch(`${API_BASE}/me`, { headers: { authorization: `Bearer ${token}` } })
          .then(async (res) => {
            if (!res.ok) return
            const data = (await res.json()) as MeResponse
            setAuth(token, data.id)
            await navigate({ to: '/workspaces' })
          })
          .catch(() => undefined)
      }
    })
    return () => subscription.unsubscribe()
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
