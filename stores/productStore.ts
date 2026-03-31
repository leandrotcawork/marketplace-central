'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'
import type { Product } from '@/types'

interface ProductState {
  products: Product[]
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  addProduct: (product: Product) => void
  updateProduct: (id: string, partial: Partial<Product>) => void
  removeProduct: (id: string) => void
  importFromXLSX: (products: Product[]) => void
  fetchFromMetalShopping: () => Promise<void>
  clearAll: () => void
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: [],
      isLoaded: false,
      isLoading: false,
      error: null,

      addProduct: (product) =>
        set((state) => ({
          products: [...state.products, product],
          isLoaded: true,
        })),

      updateProduct: (id, partial) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...partial } : p
          ),
        })),

      removeProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),

      importFromXLSX: (products) =>
        set(() => ({
          products,
          isLoaded: true,
          error: null,
        })),

      fetchFromMetalShopping: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch('/api/products')
          if (!response.ok) {
            throw new Error(`Failed to fetch products: ${response.statusText}`)
          }
          const data = await response.json()
          if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid response format from API')
          }
          const products: Product[] = data.data

          // Step 2: enrich with MetalShopping price suggestions (non-blocking)
          try {
            const skus = products.map((p) => p.sku).filter(Boolean)
            if (skus.length > 0) {
              const priceRes = await fetch('/api/metalshopping/price-suggestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus }),
              })
              if (priceRes.ok) {
                const priceData = await priceRes.json()
                if (priceData.success && Array.isArray(priceData.data)) {
                  const priceMap = new Map<string, number>(
                    priceData.data.map((item: { sku: string; minPrice: number }) => [item.sku, item.minPrice])
                  )
                  for (const product of products) {
                    const suggestion = priceMap.get(product.sku)
                    if (suggestion !== undefined && suggestion > 0) {
                      product.msPriceSuggestion = suggestion
                    }
                  }
                }
              }
            }
          } catch {
            // Price suggestion enrichment failure is non-blocking — products load normally
          }

          set({ products, isLoaded: true, isLoading: false, error: null })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
          set({ isLoading: false, error: errorMessage })
          console.error('Error fetching products from MetalShopping:', err)
        }
      },

      clearAll: () =>
        set(() => ({
          products: [],
          isLoaded: false,
          isLoading: false,
          error: null,
        })),
    }),
    {
      name: 'mc-products',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
)
