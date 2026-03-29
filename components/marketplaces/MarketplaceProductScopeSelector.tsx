'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import type { Classification, Group, Product } from '@/types'

type ScopeMode = 'classification' | 'group' | 'product'

interface MarketplaceProductScopeSelectorProps {
  products: Product[]
  classifications: Classification[]
  groups: Group[]
  onScopeChange: (products: Product[]) => void
}

export function MarketplaceProductScopeSelector({
  products,
  classifications,
  groups,
  onScopeChange,
}: MarketplaceProductScopeSelectorProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState<ScopeMode>('classification')
  const [search, setSearch] = useState('')

  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(
    () => new Set(classifications.map((c) => c.id))
  )
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(products.map((p) => p.primaryTaxonomyNodeId).filter(Boolean) as string[])
  )
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(products.map((p) => p.id))
  )

  // Keep onScopeChange stable to avoid infinite loops when parent passes inline lambdas
  const onScopeChangeRef = useRef(onScopeChange)
  onScopeChangeRef.current = onScopeChange

  // Re-initialise to "all selected" when the products/classifications data loads
  useEffect(() => {
    setSelectedClassIds(new Set(classifications.map((c) => c.id)))
  }, [classifications])

  useEffect(() => {
    setSelectedGroupIds(
      new Set(products.map((p) => p.primaryTaxonomyNodeId).filter(Boolean) as string[])
    )
    setSelectedProductIds(new Set(products.map((p) => p.id)))
  }, [products])

  // Only groups that have at least one product in scope
  const availableGroups = useMemo(() => {
    const groupIds = new Set(products.map((p) => p.primaryTaxonomyNodeId).filter(Boolean))
    return groups.filter((g) => groupIds.has(g.id))
  }, [products, groups])

  // Derive the filtered product set for the current mode + selection
  const filteredProducts = useMemo(() => {
    if (mode === 'classification') {
      const selectedPids = new Set(
        classifications
          .filter((c) => selectedClassIds.has(c.id))
          .flatMap((c) => c.productIds)
      )
      return products.filter((p) => selectedPids.has(p.id))
    }
    if (mode === 'group') {
      return products.filter(
        (p) => p.primaryTaxonomyNodeId && selectedGroupIds.has(p.primaryTaxonomyNodeId)
      )
    }
    // product mode
    return products.filter((p) => selectedProductIds.has(p.id))
  }, [mode, products, classifications, selectedClassIds, selectedGroupIds, selectedProductIds])

  // Notify parent whenever the selection changes
  useEffect(() => {
    onScopeChangeRef.current(filteredProducts)
  }, [filteredProducts])

  // Product count per classification (only counting products actually in scope)
  const classProductCount = useMemo(() => {
    const pids = new Set(products.map((p) => p.id))
    return new Map(
      classifications.map((c) => [c.id, c.productIds.filter((id) => pids.has(id)).length])
    )
  }, [classifications, products])

  // Product count per group
  const groupProductCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      if (p.primaryTaxonomyNodeId) {
        counts.set(p.primaryTaxonomyNodeId, (counts.get(p.primaryTaxonomyNodeId) ?? 0) + 1)
      }
    }
    return counts
  }, [products])

  // Search-filtered items per mode
  const visibleClassifications = useMemo(() => {
    if (!search.trim()) return classifications
    const q = search.toLowerCase()
    return classifications.filter((c) => c.name.toLowerCase().includes(q))
  }, [classifications, search])

  const visibleGroups = useMemo(() => {
    if (!search.trim()) return availableGroups
    const q = search.toLowerCase()
    return availableGroups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q)
    )
  }, [availableGroups, search])

  const visibleProducts = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.primaryTaxonomyGroupName ?? '').toLowerCase().includes(q)
    )
  }, [products, search])

  function handleModeChange(next: ScopeMode) {
    setMode(next)
    setSearch('')
  }

  const excluded = products.length - filteredProducts.length

  return (
    <div
      className="rounded-2xl border"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* ── Header (collapsible) ── */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-all hover:opacity-80 active:scale-[0.99]"
        style={{
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color)',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Escopo de produtos para importação
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {filteredProducts.length} selecionado{filteredProducts.length !== 1 ? 's' : ''}
          </span>
          {excluded > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--accent-warning)' }}
            >
              {excluded} excluído{excluded !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        )}
      </button>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Mode switcher */}
          <div className="flex items-center gap-1">
            {SCOPE_MODES.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleModeChange(tab.key)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor:
                    mode === tab.key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: mode === tab.key ? '#fff' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)',
                  border: '1px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'classification' && (
            <ClassificationPane
              items={visibleClassifications}
              selectedIds={selectedClassIds}
              productCount={classProductCount}
              search={search}
              onSearch={setSearch}
              onToggle={(id) =>
                setSelectedClassIds((prev) => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })
              }
              onSelectAll={() => setSelectedClassIds(new Set(classifications.map((c) => c.id)))}
              onClear={() => setSelectedClassIds(new Set())}
            />
          )}

          {mode === 'group' && (
            <GroupPane
              items={visibleGroups}
              selectedIds={selectedGroupIds}
              productCount={groupProductCount}
              search={search}
              onSearch={setSearch}
              onToggle={(id) =>
                setSelectedGroupIds((prev) => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })
              }
              onSelectAll={() => setSelectedGroupIds(new Set(availableGroups.map((g) => g.id)))}
              onClear={() => setSelectedGroupIds(new Set())}
            />
          )}

          {mode === 'product' && (
            <ProductPane
              items={visibleProducts}
              allProducts={products}
              selectedIds={selectedProductIds}
              search={search}
              onSearch={setSearch}
              onToggle={(id) =>
                setSelectedProductIds((prev) => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })
              }
              onSelectAll={() => setSelectedProductIds(new Set(products.map((p) => p.id)))}
              onClear={() => setSelectedProductIds(new Set())}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Classification pane ──────────────────────────────────────────────────────

function ClassificationPane({
  items,
  selectedIds,
  productCount,
  search,
  onSearch,
  onToggle,
  onSelectAll,
  onClear,
}: {
  items: Classification[]
  selectedIds: Set<string>
  productCount: Map<string, number>
  search: string
  onSearch: (v: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <BulkActions
        search={search}
        onSearch={onSearch}
        onSelectAll={onSelectAll}
        onClear={onClear}
        placeholder="Buscar classificação..."
      />
      {items.length === 0 ? (
        <EmptyState message={search ? 'Nenhuma classificação encontrada.' : 'Nenhuma classificação disponível.'} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const count = productCount.get(c.id) ?? 0
            const checked = selectedIds.has(c.id)
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
                style={{
                  borderColor: checked ? 'var(--accent-primary)' : 'var(--border-color)',
                  backgroundColor: checked ? 'rgba(99,102,241,0.06)' : 'var(--bg-tertiary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(c.id)}
                  className="mt-0.5 accent-[var(--accent-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        flexShrink: 0,
                      }}
                    >
                      {count}
                    </span>
                  </div>
                  {c.aiContext && (
                    <p
                      className="mt-1 line-clamp-2 text-[11px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {c.aiContext}
                    </p>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Group pane ───────────────────────────────────────────────────────────────

function GroupPane({
  items,
  selectedIds,
  productCount,
  search,
  onSearch,
  onToggle,
  onSelectAll,
  onClear,
}: {
  items: Group[]
  selectedIds: Set<string>
  productCount: Map<string, number>
  search: string
  onSearch: (v: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <BulkActions
        search={search}
        onSearch={onSearch}
        onSelectAll={onSelectAll}
        onClear={onClear}
        placeholder="Buscar grupo ou ID..."
      />
      {items.length === 0 ? (
        <EmptyState
          message={
            search ? 'Nenhum grupo encontrado.' : 'Nenhum grupo com produtos no escopo.'
          }
        />
      ) : (
        <div
          className="overflow-auto rounded-xl border"
          style={{
            maxHeight: '320px',
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          {items.map((g) => {
            const count = productCount.get(g.id) ?? 0
            const checked = selectedIds.has(g.id)
            return (
              <label
                key={g.id}
                className="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 last:border-b-0 transition-colors"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: checked ? 'rgba(99,102,241,0.05)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(g.id)}
                  className="accent-[var(--accent-primary)]"
                />
                <span
                  className="flex-1 text-sm"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  {g.name}
                </span>
                <span
                  className="text-[11px]"
                  style={{
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                >
                  {g.id}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    flexShrink: 0,
                  }}
                >
                  {count}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Product pane ─────────────────────────────────────────────────────────────

function ProductPane({
  items,
  allProducts,
  selectedIds,
  search,
  onSearch,
  onToggle,
  onSelectAll,
  onClear,
}: {
  items: Product[]
  allProducts: Product[]
  selectedIds: Set<string>
  search: string
  onSearch: (v: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}) {
  const allVisible = items.length > 0 && items.every((p) => selectedIds.has(p.id))
  const someVisible = items.some((p) => selectedIds.has(p.id))

  return (
    <div className="flex flex-col gap-3">
      <BulkActions
        search={search}
        onSearch={onSearch}
        onSelectAll={onSelectAll}
        onClear={onClear}
        placeholder="Buscar SKU, nome ou grupo..."
      />
      {items.length === 0 ? (
        <EmptyState
          message={search ? 'Nenhum produto encontrado.' : 'Nenhum produto no escopo.'}
        />
      ) : (
        <div
          className="overflow-auto rounded-xl border"
          style={{
            maxHeight: '320px',
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          <table className="w-full text-xs">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-tertiary)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="w-8 px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={allVisible}
                    ref={(el) => {
                      if (el) el.indeterminate = !allVisible && someVisible
                    }}
                    onChange={(e) => (e.target.checked ? onSelectAll() : onClear())}
                    className="accent-[var(--accent-primary)]"
                  />
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  SKU
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  Nome
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  Grupo
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const checked = selectedIds.has(p.id)
                return (
                  <tr
                    key={p.id}
                    onClick={() => onToggle(p.id)}
                    className="cursor-pointer border-b last:border-b-0 transition-colors"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: checked ? 'rgba(99,102,241,0.05)' : 'transparent',
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[var(--accent-primary)]"
                      />
                    </td>
                    <td
                      className="px-4 py-2.5"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.sku}
                    </td>
                    <td
                      className="max-w-[280px] truncate px-4 py-2.5"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                    >
                      {p.name}
                    </td>
                    <td
                      className="px-4 py-2.5"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.primaryTaxonomyGroupName ?? p.primaryTaxonomyNodeId ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function BulkActions({
  search,
  onSearch,
  onSelectAll,
  onClear,
  placeholder,
}: {
  search: string
  onSearch: (v: string) => void
  onSelectAll: () => void
  onClear: () => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg py-2 pl-8 pr-8 text-xs outline-none"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70 active:scale-90"
          >
            <X size={12} style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onSelectAll}
        className="rounded-lg px-3 py-2 text-xs font-medium transition-all hover:opacity-90 active:scale-95"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        Todos
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg px-3 py-2 text-xs font-medium transition-all hover:opacity-90 active:scale-95"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-color)',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        Limpar
      </button>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-8 text-center text-sm"
      style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
    >
      {message}
    </div>
  )
}

const SCOPE_MODES: { key: ScopeMode; label: string }[] = [
  { key: 'classification', label: 'Por classificação' },
  { key: 'group', label: 'Por grupo' },
  { key: 'product', label: 'Por produto' },
]
