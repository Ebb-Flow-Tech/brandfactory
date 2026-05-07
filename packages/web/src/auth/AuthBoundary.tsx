import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from './store'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  // Lazy initializer reads store once at mount — no token means nothing to validate.
  const [ready, setReady] = useState(() => !useAuthStore.getState().token)

  useEffect(() => {
    const token = useAuthStore.getState().token
    if (!token) return

    const controller = new AbortController()
    void fetch(`${API_BASE}/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          logout()
          await navigate({ to: '/login' })
          return
        }
        const data = (await res.json()) as MeResponse
        setAuth(token, data.id)
        setReady(true)
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name !== 'AbortError') {
          // Network error — proceed; the API client handles subsequent 401s.
          setReady(true)
        }
      })

    return () => controller.abort()
  }, [logout, navigate, setAuth])

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
