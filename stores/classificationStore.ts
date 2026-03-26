'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Classification } from '@/types'

interface ClassificationState {
  classifications: Classification[]
  selectedClassificationId: string | null
  addClassification: (c: Classification) => void
  updateClassification: (id: string, partial: Partial<Classification>) => void
  deleteClassification: (id: string) => void
  selectClassification: (id: string | null) => void
  getClassificationById: (id: string) => Classification | undefined
  toggleProductInClassification: (classificationId: string, productId: string) => void
  clearAll: () => void
}

export const useClassificationStore = create<ClassificationState>()(
  persist(
    (set, get) => ({
      classifications: [],
      selectedClassificationId: null,

      addClassification: (c) =>
        set((state) => ({ classifications: [...state.classifications, c] })),

      updateClassification: (id, partial) =>
        set((state) => ({
          classifications: state.classifications.map((c) =>
            c.id === id ? { ...c, ...partial, updatedAt: new Date().toISOString() } : c
          ),
        })),

      deleteClassification: (id) =>
        set((state) => ({
          classifications: state.classifications.filter((c) => c.id !== id),
          selectedClassificationId:
            state.selectedClassificationId === id ? null : state.selectedClassificationId,
        })),

      selectClassification: (id) => set({ selectedClassificationId: id }),

      getClassificationById: (id) => get().classifications.find((c) => c.id === id),

      toggleProductInClassification: (classificationId, productId) =>
        set((state) => ({
          classifications: state.classifications.map((c) => {
            if (c.id !== classificationId) return c
            const included = c.productIds.includes(productId)
            return {
              ...c,
              productIds: included
                ? c.productIds.filter((id) => id !== productId)
                : [...c.productIds, productId],
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      clearAll: () => set({ classifications: [], selectedClassificationId: null }),
    }),
    { name: 'mc-classifications' }
  )
)
