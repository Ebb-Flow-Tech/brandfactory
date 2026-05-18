import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BrandGuidelineSection,
  BrandWithSections,
  CreateProjectInput,
  Project,
  UpdateBrandGuidelinesInput,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'

export const brandKeys = {
  detail: (id: string) => ['brands', id] as const,
  projects: (brandId: string) => ['brands', brandId, 'projects'] as const,
}

export function useBrand(id: string) {
  return useQuery({
    queryKey: brandKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.brands[':id'].$get({ param: { id } })
      return callJson<BrandWithSections>(res)
    },
  })
}

export function useUpdateBrandGuidelines(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateBrandGuidelinesInput) => {
      const res = await api.brands[':id'].guidelines.$patch({
        param: { id: brandId },
        json: input,
      })
      return callJson<BrandGuidelineSection[]>(res)
    },
    onSuccess: (sections) => {
      queryClient.setQueryData<BrandWithSections>(brandKeys.detail(brandId), (old) =>
        old ? { ...old, sections } : old,
      )
    },
  })
}

export function useBrandProjects(brandId: string) {
  return useQuery({
    queryKey: brandKeys.projects(brandId),
    enabled: !!brandId,
    queryFn: async () => {
      const res = await api.brands[':brandId'].projects.$get({ param: { brandId } })
      return callJson<Project[]>(res)
    },
  })
}

export function useCreateProject(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await api.brands[':brandId'].projects.$post({
        param: { brandId },
        json: input,
      })
      return callJson<Project>(res)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
    },
  })
}
