'use client'

import { Loader2, X } from 'lucide-react'
import type { Product, Marketplace } from '@/types'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { calculateMargin } from '@/lib/calculations'

interface PublishReviewProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  selectedProducts: Product[]
  marketplaces: Marketplace[]
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
  prices,
  marketplaceSelections,
  isPublishing,
}: PublishReviewProps) {
  if (!open) return null

  // Build list of (product, marketplace) pairs
  const pairs: Array<{
    product: Product
    marketplace: Marketplace
    price: number
    marginPercent: number
    margin: number
  }> = []

  for (const product of selectedProducts) {
    const mktSel = marketplaceSelections[product.id]
    if (!mktSel || mktSel.size === 0) continue
    const price = prices[product.id] ?? product.basePrice

    for (const mktId of mktSel) {
      const marketplace = marketplaces.find((m) => m.id === mktId)
      if (!marketplace) continue
      const { margin, marginPercent } = calculateMargin(
        price,
        product.cost,
        marketplace.commission,
        marketplace.fixedFee
      )
      pairs.push({ product, marketplace, price, margin, marginPercent })
    }
  }

  const totalProducts = selectedProducts.length
  const totalPublications = pairs.length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        onClick={!isPublishing ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            maxHeight: '85vh',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div>
              <h2
                className="text-base font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Revisar Publicação
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {totalProducts} produto{totalProducts !== 1 ? 's' : ''} em{' '}
                {totalPublications} publicaç{totalPublications !== 1 ? 'ões' : 'ão'}
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

          {/* Content */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {pairs.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                Nenhum marketplace selecionado para publicação.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {/* Table header */}
                <div
                  className="grid grid-cols-4 gap-3 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                >
                  <span>Produto</span>
                  <span>Marketplace</span>
                  <span className="text-right">Preço</span>
                  <span className="text-right">Margem</span>
                </div>

                {/* Table rows */}
                {pairs.map((pair, idx) => (
                  <div
                    key={`${pair.product.id}-${pair.marketplace.id}`}
                    className="grid grid-cols-4 gap-3 px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor:
                        idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {/* Product */}
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

                    {/* Marketplace */}
                    <span
                      className="text-sm self-center truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {pair.marketplace.name}
                    </span>

                    {/* Price */}
                    <span
                      className="text-sm self-center text-right tabular-nums"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatBRL(pair.price)}
                    </span>

                    {/* Margin */}
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
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
                  Publicando…
                </>
              ) : (
                'Confirmar e Publicar'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
