'use client'

import { useState } from 'react'
import { usePackStore } from '@/stores/packStore'
import { useProductStore } from '@/stores/productStore'
import { Edit2, Trash2, Plus } from 'lucide-react'
import type { Pack } from '@/types'

interface PackListProps {
  onEditPack?: (pack: Pack) => void
  onNewPack?: () => void
}

export function PackList({ onEditPack, onNewPack }: PackListProps) {
  const { packs, deletePack } = usePackStore()
  const { products } = useProductStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDelete = (packId: string) => {
    deletePack(packId)
    setConfirmDeleteId(null)
  }

  if (packs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--text-secondary)] mb-4">Nenhum pack criado ainda</p>
        <button
          onClick={onNewPack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Plus size={18} />
          Criar Primeiro Pack
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {packs.map((pack) => {
        const packProductCount = pack.productIds.length
        const productsInPack = products.filter((p) => pack.productIds.includes(p.id))

        return (
          <div
            key={pack.id}
            className="flex items-center justify-between p-4 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')
            }
          >
            <div className="flex-1">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {pack.name}
              </h3>
              {pack.description && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {pack.description}
                </p>
              )}
              <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>
                  {packProductCount} produto{packProductCount !== 1 ? 's' : ''}
                </span>
                <span>
                  {pack.marketplaceIds.length} marketplace{pack.marketplaceIds.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onEditPack?.(pack)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <Edit2 size={16} />
              </button>

              {confirmDeleteId === pack.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(pack.id)}
                    className="px-2 py-1 text-xs rounded-lg text-white transition-colors"
                    style={{ backgroundColor: 'var(--accent-danger)' }}
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 text-xs rounded-lg transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(pack.id)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-danger)'
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
