'use client'

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Filter, Ruler } from 'lucide-react'
import { useProductStore } from '@/stores/productStore'
import { useProductDimensionsStore } from '@/stores/productDimensionsStore'
import { formatBRL } from '@/lib/formatters'
import { ProductDimensionsPanel } from './ProductDimensionsPanel'
import type { Product } from '@/types'

export function ProductTable() {
  const { products } = useProductStore()
  const { getDimensions } = useProductDimensionsStore()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products]
  )

  const filteredData = useMemo(() => {
    let data = products
    if (categoryFilter !== 'all') data = data.filter((p) => p.category === categoryFilter)
    if (globalFilter) {
      const q = globalFilter.toLowerCase()
      data = data.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.referencia?.toLowerCase().includes(q) ?? false) ||
        (p.ean?.toLowerCase().includes(q) ?? false)
      )
    }
    return data
  }, [products, globalFilter, categoryFilter])

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        size: 80,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'referencia',
        header: 'Referência',
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue() as string | undefined
          return v ? (
            <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {v}
            </span>
          ) : (
            <span style={{ color: 'var(--border-color)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'ean',
        header: 'EAN',
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue() as string | undefined
          return v ? (
            <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {v}
            </span>
          ) : (
            <span style={{ color: 'var(--border-color)' }}>—</span>
          )
        },
      },
      {
        accessorKey: 'name',
        header: 'Nome',
        size: 220,
        cell: ({ getValue }) => (
          <span className="text-sm font-medium truncate block max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Categoria',
        size: 120,
        cell: ({ getValue }) => (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'cost',
        header: 'Custo',
        size: 100,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
            {formatBRL(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: 'basePrice',
        header: 'Preço Base',
        size: 110,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm font-semibold" style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
            {formatBRL(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: 'stock',
        header: 'Estoque',
        size: 80,
        cell: ({ getValue, row }) => {
          const stock = getValue() as number
          return (
            <span
              className="font-mono text-sm"
              style={{
                color: stock === 0 ? 'var(--accent-danger)' : stock < 10 ? 'var(--accent-warning)' : 'var(--text-primary)',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            >
              {stock} {row.original.unit}
            </span>
          )
        },
      },
      {
        id: 'dimensions',
        header: '',
        size: 36,
        cell: ({ row }) => {
          const dims = getDimensions(row.original.id)
          const has = dims != null && Object.values(dims).some((v) => v != null)
          return has ? (
            <span title="Dimensões salvas">
              <Ruler size={13} style={{ color: 'var(--accent-primary)', opacity: 0.8 }} />
            </span>
          ) : null
        },
      },
    ],
    [getDimensions]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <>
      {selectedProduct && (
        <ProductDimensionsPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex items-center gap-2 flex-1 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Buscar por nome, SKU, referência ou EAN..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ibm-plex-sans)' }}
          />
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ibm-plex-sans)' }}
          >
            {categories.map((c) => (
              <option key={c} value={c} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {c === 'all' ? 'Todas categorias' : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 text-xs font-medium select-none"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-dm-sans)',
                        width: header.getSize(),
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span>
                            {header.column.getIsSorted() === 'asc' ? (
                              <ChevronUp size={12} />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
                    <div className="space-y-2">
                      <p className="text-sm">Nenhum produto encontrado</p>
                      {globalFilter || categoryFilter !== 'all' ? (
                        <button
                          onClick={() => { setGlobalFilter(''); setCategoryFilter('all') }}
                          className="text-xs"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Limpar filtros
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: selectedProduct?.id === row.original.id
                        ? 'var(--bg-tertiary)'
                        : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      transition: 'background-color 0.1s',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedProduct(row.original)}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => {
                      if (selectedProduct?.id !== row.original.id) {
                        e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {table.getRowModel().rows.length > 0 && (
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <span className="text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {table.getRowModel().rows.length} de {products.length} produto{products.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

    </>
  )
}
