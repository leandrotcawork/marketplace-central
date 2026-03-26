'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group } from '@/types'

interface GroupState {
  groups: Group[]
  isLoading: boolean
  error: string | null
  lastSyncedAt: string | null
  fetchFromMetalShopping: (tenantId?: string) => Promise<void>
  clearAll: () => void
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      groups: [],
      isLoading: false,
      error: null,
      lastSyncedAt: null,

      fetchFromMetalShopping: async (tenantId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const url = tenantId
            ? `/api/taxonomy?tenantId=${encodeURIComponent(tenantId)}`
            : '/api/taxonomy'
          const res = await fetch(url)
          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error ?? 'Failed to fetch taxonomy groups')
          }

          set({
            groups: data.data as Group[],
            lastSyncedAt: new Date().toISOString(),
            isLoading: false,
          })
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch taxonomy groups',
            isLoading: false,
          })
        }
      },

      clearAll: () => set({ groups: [], lastSyncedAt: null }),
    }),
    { name: 'mc-taxonomy-groups' }
  )
)
