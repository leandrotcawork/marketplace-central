'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pack } from '@/types'

interface PackState {
  packs: Pack[]
  selectedPackId: string | null
  addPack: (pack: Pack) => void
  updatePack: (id: string, partial: Partial<Pack>) => void
  deletePack: (id: string) => void
  selectPack: (packId: string | null) => void
  getPackById: (id: string) => Pack | undefined
  toggleProductInPack: (packId: string, productId: string) => void
  setMarketplacesForPack: (packId: string, marketplaceIds: string[]) => void
  clearAll: () => void
}

export const usePackStore = create<PackState>()(
  persist(
    (set, get) => ({
      packs: [],
      selectedPackId: null,

      addPack: (pack) =>
        set((state) => ({
          packs: [...state.packs, pack],
        })),

      updatePack: (id, partial) =>
        set((state) => ({
          packs: state.packs.map((p) =>
            p.id === id
              ? { ...p, ...partial, updatedAt: new Date().toISOString() }
              : p
          ),
        })),

      deletePack: (id) =>
        set((state) => ({
          packs: state.packs.filter((p) => p.id !== id),
          selectedPackId:
            state.selectedPackId === id ? null : state.selectedPackId,
        })),

      selectPack: (packId) =>
        set({
          selectedPackId: packId,
        }),

      getPackById: (id) => {
        const state = get()
        return state.packs.find((p) => p.id === id)
      },

      toggleProductInPack: (packId, productId) =>
        set((state) => ({
          packs: state.packs.map((p) => {
            if (p.id === packId) {
              const isIncluded = p.productIds.includes(productId)
              return {
                ...p,
                productIds: isIncluded
                  ? p.productIds.filter((id) => id !== productId)
                  : [...p.productIds, productId],
                updatedAt: new Date().toISOString(),
              }
            }
            return p
          }),
        })),

      setMarketplacesForPack: (packId, marketplaceIds) =>
        set((state) => ({
          packs: state.packs.map((p) =>
            p.id === packId
              ? {
                  ...p,
                  marketplaceIds,
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      clearAll: () =>
        set(() => ({
          packs: [],
          selectedPackId: null,
        })),
    }),
    {
      name: 'mc-packs',
    }
  )
)
