'use client'

import { useState, useMemo } from 'react'
import { useProductStore } from '@/stores/productStore'
import { ChevronUp, ChevronDown, Search, ArrowLeft } from 'lucide-react'

interface ProductSelectorProps {
  selectedProductIds: string[]
  onSelectedChange: (productIds: string[]) => void
  onDone: () => void
}

export function ProductSelector({
  selectedProductIds,
  onSelectedChange,
  onDone,
}: ProductSelectorProps) {
  const { products } = useProductStore()
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<'name' | 'sku' | 'referencia'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const filteredProducts = useMemo(() => {
    let filtered = products.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.referencia?.toLowerCase().includes(search.toLowerCase()) ||
        p.ean?.toLowerCase().includes(search.toLowerCase())
    )

    filtered.sort((a, b) => {
      let aVal = a[sortColumn] || ''
      let bVal = b[sortColumn] || ''

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal || '').toString().toLowerCase()
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [products, search, sortColumn, sortDirection])

  const handleSelectAll = (select: boolean) => {
    if (select) {
      onSelectedChange(products.map((p) => p.id))
    } else {
      onSelectedChange([])
    }
  }

  const handleToggleProduct = (productId: string) => {
    const isSelected = selectedProductIds.includes(productId)
    if (isSelected) {
      onSelectedChange(selectedProductIds.filter((id) => id !== productId))
    } else {
      onSelectedChange([...selectedProductIds, productId])
    }
  }

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? (
      <ChevronUp size={14} className="inline ml-1" />
    ) : (
      <ChevronDown size={14} className="inline ml-1" />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        onClick={onDone}
        className="inline-flex items-center gap-2 text-sm transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-3"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, SKU, referência ou EAN..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border transition-colors"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Table */}
      <div
        className="border rounded-lg overflow-hidden"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <tr>
                <th className="w-12 p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedProductIds.length === products.length && products.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left font-semibold cursor-pointer hover:opacity-70"
                  onClick={() => handleSort('name')}
                  style={{ color: 'var(--text-primary)' }}
                >
                  Nome <SortIcon column="name" />
                </th>
                <th
                  className="px-4 py-3 text-left font-semibold cursor-pointer hover:opacity-70"
                  onClick={() => handleSort('sku')}
                  style={{ color: 'var(--text-primary)' }}
                >
                  SKU <SortIcon column="sku" />
                </th>
                <th
                  className="px-4 py-3 text-left font-semibold cursor-pointer hover:opacity-70"
                  onClick={() => handleSort('referencia')}
                  style={{ color: 'var(--text-primary)' }}
                >
                  Referência <SortIcon column="referencia" />
                </th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>
                  EAN
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Nenhum produto encontrado
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="border-t transition-colors cursor-pointer"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: selectedProductIds.includes(product.id)
                        ? 'var(--bg-tertiary)'
                        : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedProductIds.includes(product.id)) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedProductIds.includes(product.id)) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => handleToggleProduct(product.id)}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                      {product.name}
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-mono"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {product.sku}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {product.referencia || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {product.ean || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {selectedProductIds.length} de {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} selecionados
      </div>
    </div>
  )
}
