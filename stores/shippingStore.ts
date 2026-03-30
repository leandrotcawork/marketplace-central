'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'

interface ShippingState {
  /** CEP de origem (armazém / expedição) */
  fromCep: string
  /** CEP de destino padrão para simulação de frete */
  toCep: string
  setFromCep: (cep: string) => void
  setToCep: (cep: string) => void
}

export const useShippingStore = create<ShippingState>()(
  persist(
    (set) => ({
      fromCep: '',
      toCep: '',
      setFromCep: (cep) => set({ fromCep: cep }),
      setToCep: (cep) => set({ toCep: cep }),
    }),
    { name: 'mc-shipping', storage: createJSONStorage(() => sqliteStorage) }
  )
)
