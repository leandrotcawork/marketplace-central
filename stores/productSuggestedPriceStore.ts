'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'

interface ProductSuggestedPriceState {
  suggestedPrices: Record<string, number>
  setSuggestedPrice: (productId: string, price: number) => void
  getSuggestedPrice: (productId: string) => number | undefined
  deleteSuggestedPrice: (productId: string) => void
  clearAll: () => void
}

export const useProductSuggestedPriceStore = create<ProductSuggestedPriceState>()(
  persist(
    (set, get) => ({
      suggestedPrices: {},

      setSuggestedPrice: (productId, price) =>
        set((state) => ({
          suggestedPrices: { ...state.suggestedPrices, [productId]: price },
        })),

      getSuggestedPrice: (productId) => get().suggestedPrices[productId],

      deleteSuggestedPrice: (productId) =>
        set((state) => {
          const { [productId]: _removed, ...rest } = state.suggestedPrices
          return { suggestedPrices: rest }
        }),

      clearAll: () => set({ suggestedPrices: {} }),
    }),
    { name: 'mc-product-suggested-prices', storage: createJSONStorage(() => sqliteStorage) }
  )
)
