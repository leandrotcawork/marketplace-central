'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useGroupStore } from '@/stores/groupStore'
import { useClassificationStore } from '@/stores/classificationStore'
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'
import { resolveProductMargin } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { MarginIndicator } from './MarginIndicator'
import type { MarginResult } from '@/types'

type HealthFilter = 'all' | 'good' | 'warning' | 'critical'

export function MarginTable() {
  const allProducts = useProductStore((s) => s.products)
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const commissionRules = useMarketplaceStore((s) => s.commissionRules)
  const productImportOverrides = useMarketplaceStore((s) => s.productImportOverrides)
  const groups = useGroupStore((s) => s.groups)
  const classifications = useClassificationStore((s) => s.classifications)
  const manualSuggestedPrices = useProductSuggestedPriceStore((s) => s.suggestedPrices)

  const activeMarketplaces = useMemo(
    () => marketplaces.filter((m) => m.active),
    [marketplaces]
  )

  // sellingPrices: key = `${productId}::${marketplaceId}`
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClassifications, setSelectedClassifications] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  function toggleFilter(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
    setPage(0)
  }

  // Pre-filter products by classification and group
  const products = useMemo(() => {
    let list = allProducts
    if (selectedClassifications.size > 0) {
      const allowedIds = new Set<string>()
      for (const clsId of selectedClassifications) {
        const cls = classifications.find((c) => c.id === clsId)
        if (cls) cls.productIds.forEach((id) => allowedIds.add(id))
      }
      list = list.filter((p) => allowedIds.has(p.id))
    }
    if (selectedGroups.size > 0) {
      const allowedIds = new Set<string>()
      for (const gId of selectedGroups) {
        const group = groups.find((g) => g.id === gId)
        if (group) group.productIds.forEach((id) => allowedIds.add(id))
      }
      list = list.filter((p) => allowedIds.has(p.id))
    }
    return list
  }, [allProducts, selectedClassifications, selectedGroups, classifications, groups])

  function cellKey(productId: string, marketplaceId: string) {
    return `${productId}::${marketplaceId}`
  }

  function getSellingPrice(productId: string, marketplaceId: string, basePrice: number) {
    return sellingPrices[cellKey(productId, marketplaceId)] ?? basePrice
  }

  function getMarketplaceResult(
    product: (typeof allProducts)[number],
    marketplace: (typeof marketplaces)[number],
    sellingPrice: number
  ): MarginResult {
    return resolveProductMargin(product, marketplace, commissionRules, productImportOverrides, sellingPrice)
  }

  function getPreferredSuggestion(product: (typeof allProducts)[number]) {
    const manual = manualSuggestedPrices[product.id]
    if (manual != null && manual > 0) return manual
    return product.msPriceSuggestion ?? null
  }

  const filteredProducts = useMemo(() => {
    let list = products
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.referencia?.toLowerCase().includes(q) ?? false) ||
        (p.ean?.toLowerCase().includes(q) ?? false)
      )
    }
    if (healthFilter !== 'all') {
      list = list.filter((p) =>
        activeMarketplaces.some((m) => {
          const priceKey = cellKey(p.id, m.id)
          const sp = sellingPrices[priceKey] ?? p.basePrice
          const { health } = getMarketplaceResult(p, m, sp)
          return health === healthFilter
        })
      )
    }
    return list
  }, [products, searchQuery, healthFilter, sellingPrices, activeMarketplaces, commissionRules])

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE)
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredProducts, page]
  )

  // Summary stats
  const summaryStats = useMemo(() => {
    let totalMarginPct = 0
    let count = 0
    let criticalCount = 0

    for (const p of filteredProducts) {
      for (const m of activeMarketplaces) {
        const priceKey = cellKey(p.id, m.id)
        const sp = sellingPrices[priceKey] ?? p.basePrice
        const { marginPercent, health } = getMarketplaceResult(p, m, sp)
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
  }, [filteredProducts, activeMarketplaces, sellingPrices, commissionRules])

  function startEdit(productId: string, marketplaceId: string, currentPrice: number) {
    const key = cellKey(productId, marketplaceId)
    setEditingKey(key)
    setEditValue(String(currentPrice.toFixed(2)))
  }

  function applyAllMsSuggestions() {
    const updates: Record<string, number> = {}
    for (const product of filteredProducts) {
      const suggestion = getPreferredSuggestion(product)
      if (!suggestion) continue
      for (const m of activeMarketplaces) {
        updates[cellKey(product.id, m.id)] = suggestion
      }
    }
    setSellingPrices((prev) => ({ ...prev, ...updates }))
  }

  function applyMsSuggestion(product: (typeof allProducts)[number]) {
    const suggestion = getPreferredSuggestion(product)
    if (!suggestion) return
    const updates: Record<string, number> = {}
    for (const m of activeMarketplaces) {
      updates[cellKey(product.id, m.id)] = suggestion
    }
    setSellingPrices((prev) => ({ ...prev, ...updates }))
  }

  function isMsActive(product: (typeof allProducts)[number]): boolean {
    const suggestion = getPreferredSuggestion(product)
    if (!suggestion) return false
    return activeMarketplaces.every(
      (m) => (sellingPrices[cellKey(product.id, m.id)] ?? product.basePrice) === suggestion
    )
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
    const headers = ['SKU', 'Produto', 'Categoria', 'Custo', ...activeMarketplaces.map((m) => `${m.name} - Preço`), ...activeMarketplaces.map((m) => `${m.name} - Margem%`)]
    const rows = filteredProducts.map((p) => {
      const prices = activeMarketplaces.map((m) => {
        const sp = getSellingPrice(p.id, m.id, p.basePrice)
        return sp.toFixed(2)
      })
      const margins = activeMarketplaces.map((m) => {
        const sp = getSellingPrice(p.id, m.id, p.basePrice)
        const { marginPercent } = getMarketplaceResult(p, m, sp)
        return marginPercent.toFixed(2)
      })
      return [p.sku, p.name, p.category, p.cost.toFixed(2), ...prices, ...margins]
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

      {/* Search + Filters + export */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nome, SKU, referência ou EAN..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
          className="rounded-md border px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        <MultiSelectDropdown
          label="Classificação"
          items={classifications.map((c) => ({ id: c.id, name: `${c.name} (${c.productIds.length})` }))}
          selected={selectedClassifications}
          onToggle={(id) => toggleFilter(selectedClassifications, id, setSelectedClassifications)}
        />
        <MultiSelectDropdown
          label="Grupo"
          items={groups.map((g) => ({ id: g.id, name: g.name }))}
          selected={selectedGroups}
          onToggle={(id) => toggleFilter(selectedGroups, id, setSelectedGroups)}
        />

        <select
          value={healthFilter}
          onChange={(e) => { setHealthFilter(e.target.value as HealthFilter); setPage(0) }}
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

        <div className="ml-auto flex items-center gap-2">
          {filteredProducts.some((p) => p.msPriceSuggestion) && (
            <>
              <button
                onClick={applyAllMsSuggestions}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                Usar sugestão MS
              </button>
              {Object.keys(sellingPrices).length > 0 && (
                <button
                  onClick={() => setSellingPrices({})}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Restaurar preços base
                </button>
              )}
            </>
          )}
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
                    Base {formatPercent(m.commercialProfile.commissionPercent * 100)}
                    {m.commercialProfile.fixedFeeAmount > 0 &&
                      ` + ${formatBRL(m.commercialProfile.fixedFeeAmount)}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.length === 0 ? (
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
              paginatedProducts.map((product, rowIdx) => (
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
                    {product.ean && (
                      <div
                        className="text-xs mt-0.5"
                        style={{
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                        }}
                      >
                        EAN: {product.ean}
                      </div>
                    )}
                    {product.referencia && (
                      <div
                        className="text-xs mt-0.5"
                        style={{
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                        }}
                      >
                        Ref: {product.referencia}
                      </div>
                    )}
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Custo: <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{formatBRL(product.cost)}</span>
                    </div>
                    {product.msPriceSuggestion && (
                      <button
                        onClick={() => applyMsSuggestion(product)}
                        title={`Usar sugestão MS: ${formatBRL(product.msPriceSuggestion)}`}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium mt-1 transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: isMsActive(product) ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary)',
                          border: `1px solid ${isMsActive(product) ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}`,
                          color: isMsActive(product) ? 'var(--accent-success)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                        }}
                      >
                        MS {formatBRL(product.msPriceSuggestion)}
                      </button>
                    )}
                  </td>

                  {/* Marketplace cells */}
                  {activeMarketplaces.map((marketplace) => {
                    const key = cellKey(product.id, marketplace.id)
                    const sp = getSellingPrice(product.id, marketplace.id, product.basePrice)
                    const result = getMarketplaceResult(product, marketplace, sp)
                    const { margin, marginPercent, health } = result
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

                        {/* Cost */}
                        <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                          Custo:{' '}
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {formatBRL(product.cost)}
                          </span>
                        </div>

                        {/* Commission + Freight breakdown */}
                        <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                          Comissão:{' '}
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {formatBRL(result.commissionAmount)}
                          </span>
                          <span style={{ fontSize: '10px', marginLeft: '2px' }}>
                            ({formatPercent(result.commission * 100, 1)})
                          </span>
                          {(() => {
                            const tag = productImportOverrides[marketplace.id]?.[product.id]?.listingTypeId
                            if (!tag) return null
                            return (
                              <span
                                className="rounded-full px-1.5 py-0.5 ml-1"
                                style={{
                                  fontSize: '9px',
                                  backgroundColor: 'rgba(139,92,246,0.1)',
                                  color: 'rgb(139,92,246)',
                                }}
                              >
                                {tag === 'gold_special' ? 'Classico' : tag === 'gold_pro' ? 'Premium' : tag}
                              </span>
                            )
                          })()}
                        </div>
                        {result.freightFixedAmount > 0 && (
                          <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            Frete:{' '}
                            <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                              {formatBRL(result.freightFixedAmount)}
                            </span>
                          </div>
                        )}
                        {result.fixedFeeAmount > 0 && (
                          <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Taxa fixa:{' '}
                            <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                              {formatBRL(result.fixedFeeAmount)}
                            </span>
                          </div>
                        )}

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

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg border text-sm"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        >
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              Anterior
            </button>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MultiSelectDropdown({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: { id: string; name: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const count = selected.size
  const displayLabel = count === 0 ? label : `${label} (${count})`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border px-3 py-1.5 text-sm flex items-center gap-1.5"
        style={{
          backgroundColor: count > 0 ? 'rgba(59,130,246,0.08)' : 'var(--bg-tertiary)',
          borderColor: count > 0 ? 'rgba(59,130,246,0.3)' : 'var(--border-color)',
          color: count > 0 ? 'var(--accent-primary)' : 'var(--text-primary)',
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg border shadow-lg overflow-auto"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
            minWidth: '200px',
            maxHeight: '280px',
          }}
        >
          {items.map((item) => {
            const checked = selected.has(item.id)
            return (
              <label
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:opacity-80"
                style={{
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: checked ? 'rgba(59,130,246,0.06)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  className="accent-[var(--accent-primary)]"
                />
                <span className="truncate">{item.name}</span>
              </label>
            )
          })}
          {items.length === 0 && (
            <div className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhum item
            </div>
          )}
        </div>
      )}
    </div>
  )
}
