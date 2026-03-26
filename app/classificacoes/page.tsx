'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClassificationList } from '@/components/classificacoes/ClassificationList'
import { ClassificationForm } from '@/components/classificacoes/ClassificationForm'
import { useProductStore } from '@/stores/productStore'
import { useClassificationStore } from '@/stores/classificationStore'
import type { Classification } from '@/types'

export default function ClassificacoesPage() {
  const [openForm, setOpenForm] = useState(false)
  const [editingClassification, setEditingClassification] = useState<Classification | null>(null)
  const { products, fetchFromMetalShopping, isLoading, error } = useProductStore()
  const { classifications } = useClassificationStore()

  const handleEditClassification = (c: Classification) => {
    setEditingClassification(c)
    setOpenForm(true)
  }

  const handleNew = () => {
    setEditingClassification(null)
    setOpenForm(true)
  }

  const handleFormClose = (open: boolean) => {
    setOpenForm(open)
    if (!open) setEditingClassification(null)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Classificações"
        subtitle={
          classifications.length > 0
            ? `${classifications.length} classificaç${classifications.length !== 1 ? 'ões' : 'ão'} criada${classifications.length !== 1 ? 's' : ''}`
            : 'Organize produtos em classificações para análise com IA'
        }
        actions={
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus size={16} />
            Nova Classificação
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-6">
          {products.length === 0 && (
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Catálogo não carregado
              </p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Carregue os produtos do MetalShopping antes de criar classificações.
              </p>
              <button
                onClick={() => fetchFromMetalShopping()}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {isLoading ? 'Carregando...' : 'Buscar Produtos do MetalShopping'}
              </button>
              {error && (
                <p className="text-xs mt-2" style={{ color: 'var(--accent-danger)' }}>
                  {error}
                </p>
              )}
            </div>
          )}

          <ClassificationList
            onNewClassification={handleNew}
            onEditClassification={handleEditClassification}
          />
        </div>
      </div>

      <ClassificationForm
        classification={editingClassification}
        open={openForm}
        onOpenChange={handleFormClose}
      />
    </div>
  )
}
