'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'
import type { ProductDimensions } from '@/types'

interface ProductDimensionsState {
  dimensions: Record<string, ProductDimensions>
  setDimensions: (productId: string, dims: ProductDimensions) => void
  getDimensions: (productId: string) => ProductDimensions | undefined
  deleteDimensions: (productId: string) => void
  clearAll: () => void
}

export const useProductDimensionsStore = create<ProductDimensionsState>()(
  persist(
    (set, get) => ({
      dimensions: {},

      setDimensions: (productId, dims) =>
        set((state) => ({
          dimensions: { ...state.dimensions, [productId]: dims },
        })),

      getDimensions: (productId) => get().dimensions[productId],

      deleteDimensions: (productId) =>
        set((state) => {
          const { [productId]: _removed, ...rest } = state.dimensions
          return { dimensions: rest }
        }),

      clearAll: () => set({ dimensions: {} }),
    }),
    { name: 'mc-product-dimensions', storage: createJSONStorage(() => sqliteStorage) }
  )
)
