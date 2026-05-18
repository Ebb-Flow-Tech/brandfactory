import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as TanStackRouter from '@tanstack/react-router'
import type { Project } from '@brandfactory/shared'
import { brandKeys } from '@/api/queries/brands'
import { ProjectsSection } from './brands.$brandId'

// `ProjectCard` calls `useNavigate` and `NewProjectDialog` (rendered as the
// section's trigger) does too. Neither is exercised here — we only assert on
// what paints. Returning a no-op function keeps the hook satisfied without
// standing up a real Router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>()
  return {
    ...actual,
    useNavigate: () => () => undefined,
  }
})

const BRAND_ID = '11111111-1111-4111-8111-111111111111'

function project(id: string, name: string): Project {
  return {
    kind: 'freeform',
    id: id as Project['id'],
    brandId: BRAND_ID as Project['brandId'],
    name,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  }
}

function wrapper(qc: QueryClient) {
  function TestWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return TestWrapper
}

// `staleTime: Infinity` keeps the seeded cache fresh so `useBrandProjects`
// returns it synchronously without firing a background refetch (which would
// hit a missing global fetch mock under jsdom).
function renderWithCache(projects: Project[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  qc.setQueryData(brandKeys.projects(BRAND_ID), projects)
  return render(<ProjectsSection brandId={BRAND_ID} />, { wrapper: wrapper(qc) })
}

describe('ProjectsSection', () => {
  it('renders a card per project when the cache has entries', () => {
    renderWithCache([
      project('22222222-2222-4222-8222-222222222222', 'Launch campaign'),
      project('33333333-3333-4333-8333-333333333333', 'Holiday promo'),
    ])
    expect(screen.getByText('Launch campaign')).toBeTruthy()
    expect(screen.getByText('Holiday promo')).toBeTruthy()
    expect(screen.queryByText(/No projects yet/i)).toBeNull()
  })

  it('shows the empty state and the New project trigger when the cache is empty', () => {
    renderWithCache([])
    expect(screen.getByText(/No projects yet/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy()
  })
})
