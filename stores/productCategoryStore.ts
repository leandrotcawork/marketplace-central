'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'

export interface ProductCategoryMapping {
  categoryId: string
  categoryName?: string
}

interface ProductCategoryState {
  categories: Record<string, ProductCategoryMapping>
  setCategory: (productId: string, mapping: ProductCategoryMapping) => void
  getCategory: (productId: string) => ProductCategoryMapping | undefined
  setMany: (mappings: Record<string, ProductCategoryMapping>) => void
  clearAll: () => void
}

export const useProductCategoryStore = create<ProductCategoryState>()(
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
    { name: 'mc-product-categories', storage: createJSONStorage(() => sqliteStorage) }
  )
)
