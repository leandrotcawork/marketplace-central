'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
          set({
            products: data.data,
            isLoaded: true,
            isLoading: false,
            error: null,
          })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
          set({
            isLoading: false,
            error: errorMessage,
          })
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
    }
  )
)
