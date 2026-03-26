'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { PackList } from '@/components/packs/PackList'
import { PackForm } from '@/components/packs/PackForm'
import { useProductStore } from '@/stores/productStore'
import type { Pack } from '@/types'

export default function PacksPage() {
  const [openForm, setOpenForm] = useState(false)
  const [editingPack, setEditingPack] = useState<Pack | null>(null)
  const { fetchFromMetalShopping, isLoading, error } = useProductStore()
  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true)
    }
  }, [hasInitialized])

  const handleNewPack = () => {
    setEditingPack(null)
    setOpenForm(true)
  }

  const handleEditPack = (pack: Pack) => {
    setEditingPack(pack)
    setOpenForm(true)
  }

  const handleFormClose = (open: boolean) => {
    setOpenForm(open)
    if (!open) {
      setEditingPack(null)
    }
  }

  return (
    <main className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Packs
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Crie seleções de produtos para análises de marketplaces específicos
          </p>
        </div>

        {/* Fetch products section */}
        <div className="mb-8 p-6 rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Origem dos Dados
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Os produtos vêm do banco de dados MetalShopping_Final. Clique no botão abaixo para
            carregá-los.
          </p>
          <button
            onClick={() => fetchFromMetalShopping()}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {isLoading ? 'Carregando...' : 'Buscar Produtos do MetalShopping'}
          </button>
          {error && (
            <p className="text-sm mt-3" style={{ color: 'var(--accent-danger)' }}>
              Erro: {error}
            </p>
          )}
        </div>

        {/* New Pack Button */}
        <div className="mb-8 flex gap-3">
          <button
            onClick={handleNewPack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus size={18} />
            Novo Pack
          </button>
        </div>

        {/* Pack List */}
        <div>
          <PackList
            onNewPack={handleNewPack}
            onEditPack={handleEditPack}
          />
        </div>
      </div>

      {/* Pack Form Modal */}
      <PackForm
        pack={editingPack}
        open={openForm}
        onOpenChange={handleFormClose}
      />
    </main>
  )
}
