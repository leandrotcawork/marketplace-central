'use client'

import { useEffect, useState } from 'react'
import { usePackStore } from '@/stores/packStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { X } from 'lucide-react'
import type { Pack } from '@/types'
import { ProductSelector } from './ProductSelector'

interface PackFormProps {
  pack?: Pack | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: () => void
}

export function PackForm({ pack, open, onOpenChange, onSave }: PackFormProps) {
  const { addPack, updatePack } = usePackStore()
  const { marketplaces } = useMarketplaceStore()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    marketplaceIds: [] as string[],
    productIds: [] as string[],
  })
  const [showProductSelector, setShowProductSelector] = useState(false)

  useEffect(() => {
    if (pack) {
      setFormData({
        name: pack.name,
        description: pack.description || '',
        marketplaceIds: pack.marketplaceIds,
        productIds: pack.productIds,
      })
    } else {
      setFormData({
        name: '',
        description: '',
        marketplaceIds: [],
        productIds: [],
      })
    }
  }, [pack, open])

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('Nome do pack é obrigatório')
      return
    }

    const now = new Date().toISOString()

    if (pack) {
      updatePack(pack.id, {
        name: formData.name,
        description: formData.description,
        marketplaceIds: formData.marketplaceIds,
        productIds: formData.productIds,
        updatedAt: now,
      })
    } else {
      const newPack: Pack = {
        id: `pack-${Date.now()}`,
        name: formData.name,
        description: formData.description,
        marketplaceIds: formData.marketplaceIds,
        productIds: formData.productIds,
        createdAt: now,
        updatedAt: now,
      }
      addPack(newPack)
    }

    onOpenChange(false)
    onSave?.()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {pack ? 'Editar Pack' : 'Criar Pack'}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {showProductSelector ? (
          <ProductSelector
            selectedProductIds={formData.productIds}
            onSelectedChange={(productIds) =>
              setFormData((prev) => ({ ...prev, productIds }))
            }
            onDone={() => setShowProductSelector(false)}
          />
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {/* Name */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Nome do Pack *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ex: Premium Metals - ML"
                  className="w-full px-3 py-2 rounded-lg border transition-colors"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Descrição (Opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Descrição do pack..."
                  className="w-full px-3 py-2 rounded-lg border transition-colors resize-none h-24"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Marketplaces */}
              <div>
                <label
                  className="block text-sm font-medium mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Marketplaces Alvo
                </label>
                <div className="space-y-2">
                  {marketplaces.map((marketplace) => (
                    <label
                      key={marketplace.id}
                      className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={formData.marketplaceIds.includes(marketplace.id)}
                        onChange={(e) => {
                          const newIds = e.target.checked
                            ? [...formData.marketplaceIds, marketplace.id]
                            : formData.marketplaceIds.filter(
                                (id) => id !== marketplace.id
                              )
                          setFormData((prev) => ({
                            ...prev,
                            marketplaceIds: newIds,
                          }))
                        }}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <span style={{ color: 'var(--text-primary)' }}>
                        {marketplace.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Products Selection */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Produtos ({formData.productIds.length} selecionados)
                </label>
                <button
                  onClick={() => setShowProductSelector(true)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-dashed transition-colors"
                  style={{
                    borderColor: 'var(--accent-primary)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  Selecionar Produtos
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-white transition-colors"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {pack ? 'Atualizar' : 'Criar'} Pack
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
