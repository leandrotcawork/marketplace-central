'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types'

interface ProductState {
  products: Product[]
  isLoaded: boolean
  addProduct: (product: Product) => void
  updateProduct: (id: string, partial: Partial<Product>) => void
  removeProduct: (id: string) => void
  importFromXLSX: (products: Product[]) => void
  clearAll: () => void
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: [],
      isLoaded: false,

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
        })),

      clearAll: () =>
        set(() => ({
          products: [],
          isLoaded: false,
        })),
    }),
    {
      name: 'mc-products',
    }
  )
)
