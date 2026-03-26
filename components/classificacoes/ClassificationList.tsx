'use client'

import { useState } from 'react'
import { Edit2, Trash2, Plus, Users } from 'lucide-react'
import { useClassificationStore } from '@/stores/classificationStore'
import { useProductStore } from '@/stores/productStore'
import type { Classification } from '@/types'

interface ClassificationListProps {
  onEditClassification?: (c: Classification) => void
  onNewClassification?: () => void
}

export function ClassificationList({ onEditClassification, onNewClassification }: ClassificationListProps) {
  const { classifications, deleteClassification } = useClassificationStore()
  const { products } = useProductStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    deleteClassification(id)
    setConfirmDeleteId(null)
  }

  if (classifications.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          <Users size={24} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Nenhuma classificação criada ainda
        </p>
        <button
          onClick={onNewClassification}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Plus size={16} />
          Criar Primeira Classificação
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {classifications.map((c) => {
        const productCount = c.productIds.length
        const inStockCount = products.filter(
          (p) => c.productIds.includes(p.id) && p.stock > 0
        ).length

        return (
          <div
            key={c.id}
            className="flex items-start justify-between p-4 rounded-lg border"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex-1 min-w-0 mr-4">
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                {c.name}
              </h3>
              {c.aiContext && (
                <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                  {c.aiContext}
                </p>
              )}
              <div className="flex gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>{productCount} produto{productCount !== 1 ? 's' : ''}</span>
                {productCount > 0 && (
                  <span style={{ color: inStockCount > 0 ? 'var(--accent-success)' : 'var(--text-secondary)' }}>
                    {inStockCount} em estoque
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => onEditClassification?.(c)}
                className="p-2 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                title="Editar classificação"
              >
                <Edit2 size={15} />
              </button>

              {confirmDeleteId === c.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="px-2 py-1 text-xs rounded-lg text-white"
                    style={{ backgroundColor: 'var(--accent-danger)' }}
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 text-xs rounded-lg"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(c.id)}
                  className="p-2 rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-danger)'
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="Excluir classificação"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
