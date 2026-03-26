'use client'

import { CheckCheck, CheckSquare, ChevronDown, ChevronUp, Lock, Square } from 'lucide-react'
import { calculateMarginForMarketplace } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { resolveCommercialTerms } from '@/lib/marketplace-commercial'
import type { Marketplace, MarketplaceCommissionRule, Product } from '@/types'

interface PublishListProps {
  products: Product[]
  marketplaces: Marketplace[]
  commissionRules: MarketplaceCommissionRule[]
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

function getSelectionStatus(
  productId: string,
  selectedIds: Set<string>,
  marketplaceSelections: Record<string, Set<string>>
): 'draft' | 'queued' {
  if (!selectedIds.has(productId)) return 'draft'
  const selectedMarketplaces = marketplaceSelections[productId]
  if (!selectedMarketplaces || selectedMarketplaces.size === 0) return 'draft'
  return 'queued'
}

function SelectionStatusBadge({ status }: { status: 'draft' | 'queued' }) {
  if (status === 'queued') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
        style={{
          color: 'var(--accent-warning)',
          backgroundColor: 'rgba(245,158,11,0.12)',
        }}
      >
        Pronto para enviar
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

function isSelectableMarketplace(marketplace: Marketplace): boolean {
  return marketplace.capabilities.publish !== 'blocked' && marketplace.executionMode !== 'blocked'
}

export function PublishList({
  products,
  marketplaces,
  commissionRules,
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
  const activeMarketplaces = marketplaces.filter((marketplace) => marketplace.active)

  if (products.length === 0) return null

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
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
          {allSelected ? 'Desmarcar todos' : 'Selecionar todos'} - {products.length} produto
          {products.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div>
        {products.map((product, index) => {
          const checked = selectedIds.has(product.id)
          const expanded = expandedIds.has(product.id)
          const price = prices[product.id] ?? product.basePrice
          const selectedMarketplaces = marketplaceSelections[product.id] ?? new Set<string>()
          const status = getSelectionStatus(product.id, selectedIds, marketplaceSelections)

          return (
            <div
              key={product.id}
              className="border-b last:border-b-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div
                className="flex items-center gap-3 px-5 py-3 select-none"
                style={{
                  backgroundColor: checked
                    ? 'rgba(59,130,246,0.06)'
                    : index % 2 === 0
                    ? 'transparent'
                    : 'rgba(255,255,255,0.01)',
                }}
              >
                <div className="cursor-pointer flex-shrink-0" onClick={() => onToggle(product.id)}>
                  {checked ? (
                    <CheckSquare size={16} color="var(--accent-primary)" />
                  ) : (
                    <Square size={16} color="var(--text-secondary)" />
                  )}
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onToggle(product.id)}>
                  <span
                    className="text-sm block truncate"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    {product.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {product.sku} - {product.primaryTaxonomyGroupName ?? product.category}
                  </span>
                </div>

                <span
                  className="text-sm tabular-nums flex-shrink-0 hidden sm:block"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {formatBRL(product.basePrice)}
                </span>

                <SelectionStatusBadge status={status} />

                {checked && (
                  <button
                    className="flex-shrink-0 p-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleExpand(product.id)
                    }}
                    aria-label={expanded ? 'Recolher' : 'Expandir'}
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>

              {checked && expanded && (
                <div
                  className="px-5 pb-4 pt-2"
                  style={{ backgroundColor: 'rgba(59,130,246,0.03)' }}
                >
                  <div className="ml-7 flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs">
                        <span style={{ color: 'var(--text-secondary)' }}>Preco de publicacao</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={price}
                          onChange={(event) =>
                            onPriceChange(product.id, Number(event.target.value) || 0)
                          }
                          className="rounded-lg border px-3 py-2 text-sm"
                          style={inputStyle}
                        />
                      </label>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        O mesmo preco e usado para os canais selecionados deste produto.
                      </div>
                    </div>

                    {activeMarketplaces.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Nenhum marketplace ativo configurado.
                      </p>
                    ) : (
                      activeMarketplaces.map((marketplace) => {
                        const selected = selectedMarketplaces.has(marketplace.id)
                        const selectable = isSelectableMarketplace(marketplace)
                        const marginResult = calculateMarginForMarketplace(
                          product,
                          marketplace,
                          commissionRules,
                          price
                        )
                        const terms = resolveCommercialTerms(product, marketplace, commissionRules)

                        return (
                          <div
                            key={marketplace.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
                            style={{
                              borderColor: 'var(--border-color)',
                              backgroundColor: selected
                                ? 'rgba(59,130,246,0.06)'
                                : 'var(--bg-secondary)',
                              opacity: selectable ? 1 : 0.72,
                            }}
                          >
                            <button
                              type="button"
                              className="relative inline-flex items-center flex-shrink-0 rounded-full transition-colors focus:outline-none"
                              style={{
                                width: 32,
                                height: 18,
                                backgroundColor: selected
                                  ? 'var(--accent-primary)'
                                  : 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                cursor: selectable ? 'pointer' : 'not-allowed',
                              }}
                              onClick={() => {
                                if (!selectable) return
                                onMarketplaceToggle(product.id, marketplace.id)
                              }}
                              aria-label={`Selecionar ${marketplace.name}`}
                              disabled={!selectable}
                            >
                              <span
                                style={{
                                  display: 'block',
                                  width: 12,
                                  height: 12,
                                  borderRadius: 9999,
                                  backgroundColor: '#fff',
                                  transform: selected ? 'translateX(16px)' : 'translateX(2px)',
                                  transition: 'transform 150ms ease',
                                }}
                              />
                            </button>

                            <div className="min-w-[180px] flex-1">
                              <div
                                className="text-sm font-medium"
                                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                              >
                                {marketplace.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  {marketplace.executionMode === 'live' ? 'V1' : 'Segunda onda'}
                                </span>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  {terms.ruleType === 'group_override' ? 'Excecao por grupo' : 'Base do canal'}
                                </span>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  Revisao {terms.reviewStatus}
                                </span>
                              </div>
                            </div>

                            <div className="flex min-w-[120px] flex-col">
                              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Taxas resolvidas
                              </span>
                              <span
                                className="text-sm"
                                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                              >
                                {formatBRL(marginResult.totalFees)}
                              </span>
                            </div>

                            <div className="flex min-w-[100px] flex-col">
                              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Margem
                              </span>
                              <MarginChip marginPercent={marginResult.marginPercent} />
                            </div>

                            {!selectable && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{
                                  color: 'var(--accent-danger)',
                                  backgroundColor: 'rgba(239,68,68,0.12)',
                                }}
                              >
                                <Lock size={11} />
                                Canal bloqueado
                              </span>
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

const inputStyle = {
  borderColor: 'var(--border-color)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
}
