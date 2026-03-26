'use client'

import { useState, useMemo } from 'react'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { usePackStore } from '@/stores/packStore'
import { calculateMargin } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { MarginIndicator } from './MarginIndicator'

type HealthFilter = 'all' | 'good' | 'warning' | 'critical'

interface MarginTableProps {
  packId?: string | null
}

export function MarginTable({ packId }: MarginTableProps) {
  const allProducts = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const packs = usePackStore((s) => s.packs)

  // Filter products by pack if packId is provided
  const products = useMemo(() => {
    if (!packId) return allProducts
    const pack = packs.find((p) => p.id === packId)
    return allProducts.filter((p) => pack?.productIds.includes(p.id))
  }, [allProducts, packId, packs])

  const activeMarketplaces = useMemo(
    () => marketplaces.filter((m) => m.active),
    [marketplaces]
  )

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products]
  )

  // sellingPrices: key = `${productId}::${marketplaceId}`
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')

  function cellKey(productId: string, marketplaceId: string) {
    return `${productId}::${marketplaceId}`
  }

  function getSellingPrice(productId: string, marketplaceId: string, basePrice: number) {
    return sellingPrices[cellKey(productId, marketplaceId)] ?? basePrice
  }

  const filteredProducts = useMemo(() => {
    let list = products
    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter)
    }
    if (healthFilter !== 'all') {
      list = list.filter((p) =>
        activeMarketplaces.some((m) => {
          const priceKey = cellKey(p.id, m.id)
          const sp = sellingPrices[priceKey] ?? p.basePrice
          const { health } = calculateMargin(sp, p.cost, m.commission, m.fixedFee)
          return health === healthFilter
        })
      )
    }
    return list
  }, [products, categoryFilter, healthFilter, sellingPrices, activeMarketplaces])

  // Summary stats
  const summaryStats = useMemo(() => {
    let totalMarginPct = 0
    let count = 0
    let criticalCount = 0

    for (const p of filteredProducts) {
      for (const m of activeMarketplaces) {
        const priceKey = cellKey(p.id, m.id)
        const sp = sellingPrices[priceKey] ?? p.basePrice
        const { marginPercent, health } = calculateMargin(sp, p.cost, m.commission, m.fixedFee)
        totalMarginPct += marginPercent
        count++
        if (health === 'critical') criticalCount++
      }
    }

    return {
      avgMargin: count > 0 ? totalMarginPct / count : 0,
      criticalCount,
      totalProducts: filteredProducts.length,
    }
  }, [filteredProducts, activeMarketplaces, sellingPrices])

  function startEdit(productId: string, marketplaceId: string, currentPrice: number) {
    const key = cellKey(productId, marketplaceId)
    setEditingKey(key)
    setEditValue(String(currentPrice.toFixed(2)))
  }

  function commitEdit(productId: string, marketplaceId: string) {
    const parsed = parseFloat(editValue.replace(',', '.'))
    if (!isNaN(parsed) && parsed > 0) {
      setSellingPrices((prev) => ({
        ...prev,
        [cellKey(productId, marketplaceId)]: parsed,
      }))
    }
    setEditingKey(null)
    setEditValue('')
  }

  function exportCSV() {
    const headers = ['SKU', 'Produto', 'Categoria', ...activeMarketplaces.map((m) => `${m.name} - Preço`), ...activeMarketplaces.map((m) => `${m.name} - Margem%`)]
    const rows = filteredProducts.map((p) => {
      const prices = activeMarketplaces.map((m) => {
        const sp = getSellingPrice(p.id, m.id, p.basePrice)
        return sp.toFixed(2)
      })
      const margins = activeMarketplaces.map((m) => {
        const sp = getSellingPrice(p.id, m.id, p.basePrice)
        const { marginPercent } = calculateMargin(sp, p.cost, m.commission, m.fixedFee)
        return marginPercent.toFixed(2)
      })
      return [p.sku, p.name, p.category, ...prices, ...margins]
    })

    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulador-margens.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (products.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="text-4xl">📦</span>
        <p className="text-base">Nenhum produto cadastrado.</p>
        <p className="text-sm">Adicione produtos no Catálogo para simular margens.</p>
      </div>
    )
  }

  if (activeMarketplaces.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="text-4xl">🏪</span>
        <p className="text-base">Nenhum marketplace ativo.</p>
        <p className="text-sm">Ative pelo menos um marketplace nas configurações.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div
        className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border text-sm"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-secondary)' }}>Produtos:</span>
          <span
            className="font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {summaryStats.totalProducts}
          </span>
        </div>
        <div
          className="w-px h-4"
          style={{ backgroundColor: 'var(--border-color)' }}
        />
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-secondary)' }}>Margem média:</span>
          <span
            className="font-semibold"
            style={{
              color:
                summaryStats.avgMargin >= 20
                  ? 'var(--accent-success)'
                  : summaryStats.avgMargin >= 10
                  ? 'var(--accent-warning)'
                  : 'var(--accent-danger)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {formatPercent(summaryStats.avgMargin)}
          </span>
        </div>
        <div
          className="w-px h-4"
          style={{ backgroundColor: 'var(--border-color)' }}
        />
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-secondary)' }}>Críticos:</span>
          <span
            className="font-semibold"
            style={{
              color: summaryStats.criticalCount > 0 ? 'var(--accent-danger)' : 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {summaryStats.criticalCount}
          </span>
        </div>
      </div>

      {/* Filters + export */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value as HealthFilter)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">Todos os status</option>
          <option value="good">Saudável (&gt;20%)</option>
          <option value="warning">Atenção (10-20%)</option>
          <option value="critical">Crítico (&lt;10%)</option>
        </select>

        <div className="ml-auto">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-lg border overflow-auto"
        style={{ borderColor: 'var(--border-color)', maxHeight: 'calc(100vh - 320px)' }}
      >
        <table className="w-full text-sm border-collapse" style={{ minWidth: `${200 + activeMarketplaces.length * 200}px` }}>
          <thead
            className="sticky top-0 z-20"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <tr>
              <th
                className="sticky left-0 z-30 px-4 py-3 text-left font-semibold border-b border-r"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-secondary)',
                  minWidth: '200px',
                }}
              >
                Produto
              </th>
              {activeMarketplaces.map((m) => (
                <th
                  key={m.id}
                  className="px-4 py-3 text-left font-semibold border-b border-r"
                  style={{
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-secondary)',
                    minWidth: '190px',
                  }}
                >
                  <div style={{ color: 'var(--text-primary)' }}>{m.name}</div>
                  <div className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                    Comissão {formatPercent(m.commission * 100)}
                    {m.fixedFee > 0 && ` + ${formatBRL(m.fixedFee)}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td
                  colSpan={activeMarketplaces.length + 1}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Nenhum produto encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product, rowIdx) => (
                <tr
                  key={product.id}
                  className="border-b transition-colors hover:opacity-90"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: rowIdx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  }}
                >
                  {/* Sticky product column */}
                  <td
                    className="sticky left-0 z-10 px-4 py-3 border-r"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: rowIdx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    }}
                  >
                    <div
                      className="font-medium text-sm leading-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {product.name}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {product.sku}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Custo: <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{formatBRL(product.cost)}</span>
                    </div>
                  </td>

                  {/* Marketplace cells */}
                  {activeMarketplaces.map((marketplace) => {
                    const key = cellKey(product.id, marketplace.id)
                    const sp = getSellingPrice(product.id, marketplace.id, product.basePrice)
                    const { margin, marginPercent, health } = calculateMargin(
                      sp,
                      product.cost,
                      marketplace.commission,
                      marketplace.fixedFee
                    )
                    const commissionAmount = sp * marketplace.commission + marketplace.fixedFee
                    const isEditing = editingKey === key

                    return (
                      <td
                        key={marketplace.id}
                        className="px-4 py-3 border-r"
                        style={{ borderColor: 'var(--border-color)', verticalAlign: 'top' }}
                      >
                        {/* Selling price (editable) */}
                        <div className="flex items-center gap-1 mb-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(product.id, marketplace.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(product.id, marketplace.id)
                                if (e.key === 'Escape') {
                                  setEditingKey(null)
                                  setEditValue('')
                                }
                              }}
                              autoFocus
                              className="rounded border px-2 py-0.5 text-sm w-28"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                borderColor: 'var(--accent-primary)',
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-jetbrains-mono)',
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(product.id, marketplace.id, sp)}
                              className="rounded px-1.5 py-0.5 text-sm font-medium transition-colors hover:opacity-80 text-left"
                              style={{
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-jetbrains-mono)',
                                backgroundColor: 'rgba(59,130,246,0.08)',
                                border: '1px solid rgba(59,130,246,0.2)',
                              }}
                              title="Clique para editar o preço de venda"
                            >
                              {formatBRL(sp)}
                            </button>
                          )}
                        </div>

                        {/* Commission */}
                        <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Comissão:{' '}
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {formatBRL(commissionAmount)}
                          </span>
                        </div>

                        {/* Margin */}
                        <div className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          Margem:{' '}
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono)',
                              color:
                                health === 'good'
                                  ? 'var(--accent-success)'
                                  : health === 'warning'
                                  ? 'var(--accent-warning)'
                                  : 'var(--accent-danger)',
                            }}
                          >
                            {formatBRL(margin)}
                          </span>
                        </div>

                        {/* Indicator */}
                        <MarginIndicator
                          health={health}
                          marginPercent={marginPercent}
                          size="sm"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
