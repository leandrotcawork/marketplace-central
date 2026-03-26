'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarginTable } from '@/components/simulador/MarginTable'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useGroupStore } from '@/stores/groupStore'

export default function SimuladorPage() {
  const products = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const { groups } = useGroupStore()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const activeMarketplaces = marketplaces.filter((m) => m.active)

  // Get products for selected taxonomy group or all products
  const groupProducts = selectedGroupId
    ? products.filter((p) => {
        const group = groups.find((g) => g.id === selectedGroupId)
        return group?.productIds.includes(p.id)
      })
    : products

  const subtitle =
    groupProducts.length > 0 && activeMarketplaces.length > 0
      ? `${groupProducts.length} produto${groupProducts.length !== 1 ? 's' : ''} × ${activeMarketplaces.length} marketplace${activeMarketplaces.length !== 1 ? 's' : ''}`
      : 'Simule preços e calcule margens por marketplace'

  const selectedGroupName =
    selectedGroupId && groups.find((g) => g.id === selectedGroupId)
      ? groups.find((g) => g.id === selectedGroupId)!.name
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
            Grupo:
          </label>
          <select
            value={selectedGroupId || ''}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
            className="px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Todos os Produtos</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
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

        <MarginTable groupId={selectedGroupId} />
      </div>
    </div>
  )
}
