'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarginTable } from '@/components/simulador/MarginTable'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { usePackStore } from '@/stores/packStore'

export default function SimuladorPage() {
  const products = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const { packs } = usePackStore()
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)

  const activeMarketplaces = marketplaces.filter((m) => m.active)

  // Get products for selected pack or all products
  const packProducts = selectedPackId
    ? products.filter((p) => {
        const pack = packs.find((pk) => pk.id === selectedPackId)
        return pack?.productIds.includes(p.id)
      })
    : products

  const subtitle =
    packProducts.length > 0 && activeMarketplaces.length > 0
      ? `${packProducts.length} produto${packProducts.length !== 1 ? 's' : ''} × ${activeMarketplaces.length} marketplace${activeMarketplaces.length !== 1 ? 's' : ''}`
      : 'Simule preços e calcule margens por marketplace'

  const selectedPackName =
    selectedPackId && packs.find((p) => p.id === selectedPackId)
      ? packs.find((p) => p.id === selectedPackId)!.name
      : 'Todos os Produtos'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Simulador de Margens"
        subtitle={subtitle}
      />
      <div className="flex-1 p-6 overflow-auto">
        {/* Pack Selector */}
        <div className="mb-6 flex items-center gap-4">
          <label
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Pack:
          </label>
          <select
            value={selectedPackId || ''}
            onChange={(e) => setSelectedPackId(e.target.value || null)}
            className="px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Todos os Produtos</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
          <span
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {selectedPackName}
          </span>
        </div>

        <MarginTable packId={selectedPackId} />
      </div>
    </div>
  )
}
