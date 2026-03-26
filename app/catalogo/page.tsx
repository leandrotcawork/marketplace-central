'use client'

import { useState } from 'react'
import { Plus, Package, Trash2 } from 'lucide-react'
import { useProductStore } from '@/stores/productStore'
import { FileUpload } from '@/components/catalogo/FileUpload'
import { ProductTable } from '@/components/catalogo/ProductTable'
import { ProductForm } from '@/components/catalogo/ProductForm'
import { PageHeader } from '@/components/layout/PageHeader'

export default function CatalogoPage() {
  const { products, clearAll, fetchFromMetalShopping, isLoading, error } = useProductStore()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Catálogo"
        subtitle={products.length > 0
          ? `${products.length} produto${products.length !== 1 ? 's' : ''} carregado${products.length !== 1 ? 's' : ''}`
          : 'Importe o catálogo de produtos'}
        actions={
          products.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--accent-danger)', border: '1px solid var(--border-color)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
              >
                <Trash2 size={13} />
                Limpar tudo
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
                style={{ backgroundColor: 'var(--accent-primary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                <Plus size={13} />
                Adicionar produto
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 p-6 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Origem dos Dados
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Carregue produtos do banco de dados MetalShopping_Final. Alternativamente, você pode importar um arquivo .xlsx.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => fetchFromMetalShopping()}
              disabled={isLoading}
              className="w-full px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {isLoading ? 'Carregando...' : 'Buscar Produtos do MetalShopping'}
            </button>
            {error && (
              <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>
                Erro: {error}
              </p>
            )}
          </div>
          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Ou importar XLSX
            </h4>
            <FileUpload />
          </div>
        </div>

        {products.length > 0 ? (
          <ProductTable />
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
              <Package size={28} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
                Catálogo vazio
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Importe um arquivo .xlsx ou adicione produtos manualmente
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Plus size={13} />
              Adicionar produto manualmente
            </button>
          </div>
        )}
      </div>

      <ProductForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  )
}
