'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarginTable } from '@/components/simulador/MarginTable'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useClassificationStore } from '@/stores/classificationStore'

export default function SimuladorPage() {
  const products = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const { classifications } = useClassificationStore()
  const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null)

  const activeMarketplaces = marketplaces.filter((m) => m.active)

  // Get products for selected classification or all products
  const groupProducts = selectedClassificationId
    ? products.filter((p) => {
        const cls = classifications.find((c) => c.id === selectedClassificationId)
        return cls?.productIds.includes(p.id)
      })
    : products

  const subtitle =
    groupProducts.length > 0 && activeMarketplaces.length > 0
      ? `${groupProducts.length} produto${groupProducts.length !== 1 ? 's' : ''} × ${activeMarketplaces.length} marketplace${activeMarketplaces.length !== 1 ? 's' : ''}`
      : 'Simule preços e calcule margens por marketplace'

  const selectedGroupName =
    selectedClassificationId && classifications.find((c) => c.id === selectedClassificationId)
      ? classifications.find((c) => c.id === selectedClassificationId)!.name
      : 'Todos os Produtos'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Simulador de Margens"
        subtitle={subtitle}
      />
      <div className="flex-1 p-6 overflow-auto">
        {/* Group Selector */}
        <div className="mb-6 flex items-center gap-4">
          <label
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Classificação:
          </label>
          <select
            value={selectedClassificationId || ''}
            onChange={(e) => setSelectedClassificationId(e.target.value || null)}
            className="px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Todos os Produtos</option>
            {classifications.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <span
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {selectedGroupName}
          </span>
        </div>

        <MarginTable groupId={selectedClassificationId} />
      </div>
    </div>
  )
}
