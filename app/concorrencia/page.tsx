'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { CompetitorSearch } from '@/components/concorrencia/CompetitorSearch'
import { PriceComparison } from '@/components/concorrencia/PriceComparison'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { usePackStore } from '@/stores/packStore'
import { generateCompetitorData } from '@/lib/mock-competitors'

export default function ConcorrenciaPage() {
  const allProducts = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const { packs } = usePackStore()
  const setCompetitorData = useAnalysisStore((s) => s.setCompetitorData)

  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Filter products by selected pack
  const products = selectedPackId
    ? allProducts.filter((p) => {
        const pack = packs.find((pk) => pk.id === selectedPackId)
        return pack?.productIds.includes(p.id)
      })
    : allProducts

  function handleSearch(productId: string) {
    setIsLoading(true)
    setSelectedProductId(null)

    setTimeout(() => {
      const data = generateCompetitorData(products, marketplaces)
      setCompetitorData(data)
      setSelectedProductId(productId)
      setIsLoading(false)
    }, 800)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Análise de Concorrência"
        subtitle="Compare seus preços com os concorrentes nos marketplaces"
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
            onChange={(e) => {
              setSelectedPackId(e.target.value || null)
              setSelectedProductId(null)
            }}
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
        </div>

        {products.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-64 gap-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.4 }}
            >
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
              Nenhum produto cadastrado
            </p>
            <p className="text-sm">Adicione produtos no Catálogo para analisar concorrência.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <CompetitorSearch onSearch={handleSearch} isLoading={isLoading} />

            {isLoading && (
              <div
                className="flex items-center justify-center gap-3 h-32 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
              >
                <svg
                  className="animate-spin"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-sm">Buscando dados de concorrentes...</span>
              </div>
            )}

            {!isLoading && selectedProductId === null && (
              <div
                className="flex flex-col items-center justify-center h-48 gap-3 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderStyle: 'dashed',
                }}
              >
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: 0.4 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p className="text-sm">Selecione um produto e clique em &quot;Buscar Concorrentes&quot;</p>
              </div>
            )}

            {!isLoading && selectedProductId !== null && (
              <PriceComparison productId={selectedProductId} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
