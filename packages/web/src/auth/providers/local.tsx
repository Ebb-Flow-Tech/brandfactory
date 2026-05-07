import { type FormEvent, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

export function LocalAuthProvider() {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { authorization: `Bearer ${token.trim()}` },
      })
      if (!res.ok) {
        setError('Invalid token — check the server logs.')
        return
      }
      const data = (await res.json()) as MeResponse
      setAuth(token.trim(), data.id)
      await navigate({ to: '/workspaces' })
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-4">
      <div className="space-y-2">
        <Label htmlFor="token">Dev token</Label>
        <Input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the token printed by the server on boot"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
