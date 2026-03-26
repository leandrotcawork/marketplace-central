'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { MarginTable } from '@/components/simulador/MarginTable'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'

export default function SimuladorPage() {
  const products = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const activeMarketplaces = marketplaces.filter((m) => m.active)

  const subtitle =
    products.length > 0 && activeMarketplaces.length > 0
      ? `${products.length} produto${products.length !== 1 ? 's' : ''} × ${activeMarketplaces.length} marketplace${activeMarketplaces.length !== 1 ? 's' : ''}`
      : 'Simule preços e calcule margens por marketplace'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Simulador de Margens"
        subtitle={subtitle}
      />
      <div className="flex-1 p-6 overflow-auto">
        <MarginTable />
      </div>
    </div>
  )
}
