'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'

export interface MagaluCategoryMapping {
  categoryId: string
  categoryName: string
  categoryPath?: string
  confidence?: number
  reason?: string
  source: 'llm' | 'manual' | 'heuristic'
  mappedAt: string
}

interface MagaluCategoryState {
  categories: Record<string, MagaluCategoryMapping>
  setCategory: (productId: string, mapping: MagaluCategoryMapping) => void
  getCategory: (productId: string) => MagaluCategoryMapping | undefined
  setMany: (mappings: Record<string, MagaluCategoryMapping>) => void
  clearAll: () => void
}

export const useMagaluCategoryStore = create<MagaluCategoryState>()(
  persist(
    (set, get) => ({
      categories: {},

      setCategory: (productId, mapping) =>
        set((state) => ({
          categories: { ...state.categories, [productId]: mapping },
        })),

      getCategory: (productId) => get().categories[productId],

      setMany: (mappings) =>
        set((state) => ({
          categories: { ...state.categories, ...mappings },
        })),

      clearAll: () => set({ categories: {} }),
    }),
    { name: 'mc-product-categories-magalu', storage: createJSONStorage(() => sqliteStorage) }
  )
)
