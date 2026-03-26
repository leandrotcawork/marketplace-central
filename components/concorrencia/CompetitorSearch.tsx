'use client'

import { useProductStore } from '@/stores/productStore'

interface CompetitorSearchProps {
  onSearch: (productId: string) => void
  isLoading: boolean
}

export function CompetitorSearch({ onSearch, isLoading }: CompetitorSearchProps) {
  const products = useProductStore((s) => s.products)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const productId = data.get('productId') as string
    if (productId) {
      onSearch(productId)
    }
  }

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <h2
        className="text-base font-semibold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Buscar Concorrentes
      </h2>

      {products.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nenhum produto cadastrado. Adicione produtos no Catálogo primeiro.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
            <label
              htmlFor="productId"
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Produto
            </label>
            <select
              id="productId"
              name="productId"
              required
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Selecione um produto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.sku}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
            }}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Buscando...
              </>
            ) : (
              <>
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
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Buscar Concorrentes
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
