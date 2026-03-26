'use client'

import { CheckSquare, Square, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react'
import type { Product, Marketplace } from '@/types'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { calculateMargin } from '@/lib/calculations'

interface PublishListProps {
  products: Product[]
  marketplaces: Marketplace[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  prices: Record<string, number>
  onPriceChange: (productId: string, price: number) => void
  marketplaceSelections: Record<string, Set<string>>
  onMarketplaceToggle: (productId: string, marketplaceId: string) => void
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
}

function getPublishStatus(
  productId: string,
  selectedIds: Set<string>,
  marketplaceSelections: Record<string, Set<string>>
): 'draft' | 'ready' | 'published' {
  if (!selectedIds.has(productId)) return 'draft'
  const mktSel = marketplaceSelections[productId]
  if (!mktSel || mktSel.size === 0) return 'draft'
  return 'ready'
}

function StatusBadge({ status }: { status: 'draft' | 'ready' | 'published' }) {
  if (status === 'published') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
        style={{
          color: 'var(--accent-success)',
          backgroundColor: 'rgba(16,185,129,0.12)',
        }}
      >
        Publicado
      </span>
    )
  }
  if (status === 'ready') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
        style={{
          color: 'var(--accent-warning)',
          backgroundColor: 'rgba(245,158,11,0.12)',
        }}
      >
        Pronto
      </span>
    )
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
      style={{
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      Rascunho
    </span>
  )
}

function MarginChip({ marginPercent }: { marginPercent: number }) {
  const color =
    marginPercent >= 20
      ? 'var(--accent-success)'
      : marginPercent >= 10
      ? 'var(--accent-warning)'
      : 'var(--accent-danger)'

  return (
    <span
      className="text-xs font-medium tabular-nums"
      style={{ color, fontFamily: 'var(--font-jetbrains-mono)' }}
    >
      {formatPercent(marginPercent)}
    </span>
  )
}

export function PublishList({
  products,
  marketplaces,
  selectedIds,
  onToggle,
  onSelectAll,
  prices,
  onPriceChange,
  marketplaceSelections,
  onMarketplaceToggle,
  expandedIds,
  onToggleExpand,
}: PublishListProps) {
  const allSelected = products.length > 0 && selectedIds.size === products.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const activeMarketplaces = marketplaces.filter((m) => m.active)

  if (products.length === 0) {
    return null
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b cursor-pointer select-none"
        style={{ borderColor: 'var(--border-color)' }}
        onClick={onSelectAll}
      >
        {allSelected ? (
          <CheckCheck size={16} color="var(--accent-primary)" className="flex-shrink-0" />
        ) : someSelected ? (
          <CheckSquare size={16} color="var(--accent-primary)" className="flex-shrink-0" />
        ) : (
          <Square size={16} color="var(--text-secondary)" className="flex-shrink-0" />
        )}
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {allSelected ? 'Desmarcar todos' : 'Selecionar todos'} —{' '}
          {products.length} produto{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Product rows */}
      <div>
        {products.map((product, idx) => {
          const checked = selectedIds.has(product.id)
          const expanded = expandedIds.has(product.id)
          const price = prices[product.id] ?? product.basePrice
          const mktSel = marketplaceSelections[product.id] ?? new Set<string>()
          const status = getPublishStatus(product.id, selectedIds, marketplaceSelections)

          return (
            <div
              key={product.id}
              className="border-b last:border-b-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {/* Main product row */}
              <div
                className="flex items-center gap-3 px-5 py-3 select-none"
                style={{
                  backgroundColor: checked
                    ? 'rgba(59,130,246,0.06)'
                    : idx % 2 === 0
                    ? 'transparent'
                    : 'rgba(255,255,255,0.01)',
                }}
              >
                {/* Checkbox */}
                <div
                  className="cursor-pointer flex-shrink-0"
                  onClick={() => onToggle(product.id)}
                >
                  {checked ? (
                    <CheckSquare size={16} color="var(--accent-primary)" />
                  ) : (
                    <Square size={16} color="var(--text-secondary)" />
                  )}
                </div>

                {/* Product info */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onToggle(product.id)}
                >
                  <span
                    className="text-sm block truncate"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    {product.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {product.sku} · {product.category}
                  </span>
                </div>

                {/* Base price */}
                <span
                  className="text-sm tabular-nums flex-shrink-0 hidden sm:block"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {formatBRL(product.basePrice)}
                </span>

                {/* Status badge */}
                <StatusBadge status={status} />

                {/* Expand/collapse chevron (only when selected) */}
                {checked && (
                  <button
                    className="flex-shrink-0 p-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpand(product.id)
                    }}
                    aria-label={expanded ? 'Recolher' : 'Expandir'}
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>

              {/* Expanded section */}
              {checked && expanded && (
                <div
                  className="px-5 pb-4 pt-2"
                  style={{ backgroundColor: 'rgba(59,130,246,0.03)' }}
                >
                  <div className="ml-7 flex flex-col gap-3">
                    {activeMarketplaces.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Nenhum marketplace ativo configurado.
                      </p>
                    ) : (
                      activeMarketplaces.map((mkt) => {
                        const mktActive = mktSel.has(mkt.id)
                        const mktPrice = prices[product.id] ?? product.basePrice
                        const { marginPercent } = calculateMargin(
                          mktPrice,
                          product.cost,
                          mkt.commission,
                          mkt.fixedFee
                        )

                        return (
                          <div
                            key={mkt.id}
                            className="flex items-center gap-3 flex-wrap"
                          >
                            {/* Toggle switch (manual) */}
                            <button
                              className="relative inline-flex items-center flex-shrink-0 rounded-full transition-colors focus:outline-none"
                              style={{
                                width: 32,
                                height: 18,
                                backgroundColor: mktActive
                                  ? 'var(--accent-primary)'
                                  : 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                              }}
                              onClick={() => onMarketplaceToggle(product.id, mkt.id)}
                              aria-label={`Toggle ${mkt.name}`}
                            >
                              <span
                                className="block rounded-full transition-transform"
                                style={{
                                  width: 12,
                                  height: 12,
                                  backgroundColor: '#fff',
                                  transform: mktActive
                                    ? 'translateX(15px)'
                                    : 'translateX(3px)',
                                }}
                              />
                            </button>

                            {/* Marketplace name */}
                            <span
                              className="text-sm w-32 flex-shrink-0 truncate"
                              style={{
                                color: mktActive
                                  ? 'var(--text-primary)'
                                  : 'var(--text-secondary)',
                                fontFamily: 'var(--font-dm-sans)',
                              }}
                            >
                              {mkt.name}
                            </span>

                            {/* Price input */}
                            {mktActive && (
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  R$
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={mktPrice}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    if (!isNaN(val) && val >= 0) {
                                      onPriceChange(product.id, val)
                                    }
                                  }}
                                  className="w-24 px-2 py-1 rounded text-sm tabular-nums outline-none"
                                  style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-jetbrains-mono)',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span
                                  className="text-xs"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  Margem:
                                </span>
                                <MarginChip marginPercent={marginPercent} />
                                <span
                                  className="text-xs ml-2"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  ({formatPercent(mkt.commission * 100, 0)} comissão)
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
