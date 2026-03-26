'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Marketplace } from '@/types'

const DEFAULT_MARKETPLACES: Marketplace[] = [
  {
    id: 'mercado-livre',
    name: 'Mercado Livre',
    commission: 0.16,
    fixedFee: 0,
    active: true,
  },
  {
    id: 'amazon',
    name: 'Amazon Brasil',
    commission: 0.15,
    fixedFee: 8,
    active: true,
  },
  {
    id: 'shopee',
    name: 'Shopee',
    commission: 0.14,
    fixedFee: 2,
    active: true,
  },
  {
    id: 'magalu',
    name: 'Magalu',
    commission: 0.16,
    fixedFee: 0,
    active: true,
  },
  {
    id: 'leroy',
    name: 'Leroy Merlin',
    commission: 0.18,
    fixedFee: 0,
    active: true,
  },
  {
    id: 'madeira',
    name: 'Madeira Madeira',
    commission: 0.15,
    fixedFee: 0,
    active: true,
  },
]

interface MarketplaceState {
  marketplaces: Marketplace[]
  toggleActive: (id: string) => void
  updateMarketplace: (id: string, partial: Partial<Marketplace>) => void
  addMarketplace: (marketplace: Marketplace) => void
  removeMarketplace: (id: string) => void
}

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set) => ({
      marketplaces: DEFAULT_MARKETPLACES,

      toggleActive: (id) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((m) =>
            m.id === id ? { ...m, active: !m.active } : m
          ),
        })),

      updateMarketplace: (id, partial) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((m) =>
            m.id === id ? { ...m, ...partial } : m
          ),
        })),

      addMarketplace: (marketplace) =>
        set((state) => ({
          marketplaces: [...state.marketplaces, marketplace],
        })),

      removeMarketplace: (id) =>
        set((state) => ({
          marketplaces: state.marketplaces.filter((m) => m.id !== id),
        })),
    }),
    {
      name: 'mc-marketplaces',
    }
  )
)
