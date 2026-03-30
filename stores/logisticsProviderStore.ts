'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'
import type { LogisticsProvider } from '@/types'

interface LogisticsProviderState {
  providers: LogisticsProvider[]
  setProviders: (providers: LogisticsProvider[]) => void
  clearAll: () => void
}

export const useLogisticsProviderStore = create<LogisticsProviderState>()(
  persist(
    (set) => ({
      providers: [],

      setProviders: (providers) => set({ providers }),

      clearAll: () => set({ providers: [] }),
    }),
    { name: 'mc-logistics-providers', storage: createJSONStorage(() => sqliteStorage) }
  )
)