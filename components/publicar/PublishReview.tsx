'use client'

import { Loader2, X } from 'lucide-react'
import { calculateMarginForMarketplace } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { resolveCommercialTerms } from '@/lib/marketplace-commercial'
import type { Marketplace, MarketplaceCommissionRule, Product } from '@/types'

interface PublishReviewProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  selectedProducts: Product[]
  marketplaces: Marketplace[]
  commissionRules: MarketplaceCommissionRule[]
  prices: Record<string, number>
  marketplaceSelections: Record<string, Set<string>>
  isPublishing: boolean
}

export function PublishReview({
  open,
  onClose,
  onConfirm,
  selectedProducts,
  marketplaces,
  commissionRules,
  prices,
  marketplaceSelections,
  isPublishing,
}: PublishReviewProps) {
  if (!open) return null

  const pairs: Array<{
    product: Product
    marketplace: Marketplace
    price: number
    marginPercent: number
    totalFees: number
    ruleLabel: string
    reviewLabel: string
  }> = []

  for (const product of selectedProducts) {
    const selectedMarketplaces = marketplaceSelections[product.id]
    if (!selectedMarketplaces || selectedMarketplaces.size === 0) continue

    const price = prices[product.id] ?? product.basePrice

    for (const marketplaceId of selectedMarketplaces) {
      const marketplace = marketplaces.find((candidate) => candidate.id === marketplaceId)
      if (!marketplace) continue

      const margin = calculateMarginForMarketplace(product, marketplace, commissionRules, price)
      const terms = resolveCommercialTerms(product, marketplace, commissionRules)

      pairs.push({
        product,
        marketplace,
        price,
        marginPercent: margin.marginPercent,
        totalFees: margin.totalFees,
        ruleLabel: terms.ruleType === 'group_override' ? 'Excecao' : 'Base',
        reviewLabel:
          terms.reviewStatus === 'validated'
            ? 'Validado'
            : terms.reviewStatus === 'manual_assumption'
            ? 'Manual'
            : 'Faltando',
      })
    }
  }

  const totalProducts = selectedProducts.length
  const totalPublications = pairs.length

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        onClick={!isPublishing ? onClose : undefined}
      />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-4xl rounded-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            maxHeight: '85vh',
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Revisar envio para marketplaces
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {totalProducts} produto{totalProducts !== 1 ? 's' : ''} em {totalPublications}{' '}
                publicacao{totalPublications !== 1 ? 'es' : ''}
              </p>
            </div>
            {!isPublishing && (
              <button
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onClick={onClose}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {pairs.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                Nenhum marketplace selecionado para envio.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <div
                  className="grid grid-cols-6 gap-3 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                >
                  <span>Produto</span>
                  <span>Marketplace</span>
                  <span className="text-right">Preco</span>
                  <span className="text-right">Taxas</span>
                  <span className="text-right">Margem</span>
                  <span className="text-right">Regra</span>
                </div>

                {pairs.map((pair, index) => (
                  <div
                    key={`${pair.product.id}-${pair.marketplace.id}`}
                    className="grid grid-cols-6 gap-3 px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-sm truncate"
                        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                      >
                        {pair.product.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {pair.product.sku}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                        {pair.marketplace.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {pair.marketplace.executionMode === 'live' ? 'Execucao V1' : 'Segunda onda'}
                      </p>
                    </div>

                    <span
                      className="text-sm self-center text-right tabular-nums"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatBRL(pair.price)}
                    </span>

                    <span
                      className="text-sm self-center text-right tabular-nums"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatBRL(pair.totalFees)}
                    </span>

                    <span
                      className="text-sm self-center text-right tabular-nums font-medium"
                      style={{
                        color:
                          pair.marginPercent >= 20
                            ? 'var(--accent-success)'
                            : pair.marginPercent >= 10
                            ? 'var(--accent-warning)'
                            : 'var(--accent-danger)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatPercent(pair.marginPercent)}
                    </span>

                    <div className="flex flex-col items-end justify-center">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {pair.ruleLabel}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {pair.reviewLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-shrink-0"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            {!isPublishing && (
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color)',
                  fontFamily: 'var(--font-dm-sans)',
                }}
                onClick={onClose}
              >
                Cancelar
              </button>
            )}
            <button
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60"
              style={{
                backgroundColor: pairs.length > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: '#fff',
                fontFamily: 'var(--font-dm-sans)',
                cursor: isPublishing || pairs.length === 0 ? 'not-allowed' : 'pointer',
              }}
              onClick={onConfirm}
              disabled={isPublishing || pairs.length === 0}
            >
              {isPublishing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Enviando jobs...
                </>
              ) : (
                'Confirmar envio'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
