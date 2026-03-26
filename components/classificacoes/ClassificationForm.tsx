'use client'

import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useClassificationStore } from '@/stores/classificationStore'
import { ProductSelector } from './ProductSelector'
import type { Classification } from '@/types'

interface ClassificationFormProps {
  classification?: Classification | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClassificationForm({ classification, open, onOpenChange }: ClassificationFormProps) {
  const { addClassification, updateClassification } = useClassificationStore()
  const [name, setName] = useState('')
  const [aiContext, setAiContext] = useState('')
  const [productIds, setProductIds] = useState<string[]>([])
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (open) {
      setName(classification?.name ?? '')
      setAiContext(classification?.aiContext ?? '')
      setProductIds(classification?.productIds ?? [])
      setShowSelector(false)
    }
  }, [classification, open])

  const handleSave = () => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    if (classification) {
      updateClassification(classification.id, { name: name.trim(), aiContext, productIds, updatedAt: now })
    } else {
      addClassification({
        id: `cls-${Date.now()}`,
        name: name.trim(),
        aiContext,
        productIds,
        createdAt: now,
        updatedAt: now,
      })
    }
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {classification ? 'Editar Classificação' : 'Nova Classificação'}
          </h2>
          <button onClick={() => onOpenChange(false)} style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {showSelector ? (
          <ProductSelector
            selectedProductIds={productIds}
            onSelectedChange={setProductIds}
            onDone={() => setShowSelector(false)}
          />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Nome da Classificação *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Premium Banheiro, Alta Rotatividade, Lançamentos"
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
                  Contexto para IA
                </span>
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Descreva o que esta classificação representa. A IA lerá este texto para calibrar as
                recomendações de preço. Inclua segmento de mercado, perfil do comprador, posicionamento.
              </p>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Ex: Produtos premium de acabamento para banheiros de alto padrão. Comprador típico: construtoras de luxo e arquitetos. Posicionamento: qualidade sobre preço. Alta margem aceitável."
                className="w-full px-3 py-2 rounded-lg border resize-none"
                rows={5}
                style={{
                  borderColor: 'var(--accent-primary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              />
              <p
                className="text-xs mt-1"
                style={{ color: aiContext.length > 600 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
              >
                {aiContext.length}/800 caracteres
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Produtos ({productIds.length} selecionados)
              </label>
              <button
                onClick={() => setShowSelector(true)}
                className="w-full px-4 py-2 rounded-lg border-2 border-dashed text-sm"
                style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
              >
                {productIds.length > 0 ? 'Alterar seleção de produtos' : 'Selecionar produtos'}
              </button>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {classification ? 'Salvar Classificação' : 'Criar Classificação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
