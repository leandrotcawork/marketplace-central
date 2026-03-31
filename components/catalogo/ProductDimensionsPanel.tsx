'use client'

import { useState, useEffect } from 'react'
import { X, Ruler, Save, Trash2 } from 'lucide-react'
import { useProductDimensionsStore } from '@/stores/productDimensionsStore'
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'
import { formatBRL } from '@/lib/formatters'
import type { Product, ProductDimensions } from '@/types'

interface Props {
  product: Product
  onClose: () => void
}

export function ProductDimensionsPanel({ product, onClose }: Props) {
  const { getDimensions, setDimensions, deleteDimensions } = useProductDimensionsStore()
  const { getSuggestedPrice, setSuggestedPrice, deleteSuggestedPrice } = useProductSuggestedPriceStore()

  const [heightCm, setHeightCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [weightG, setWeightG] = useState('')
  const [saved, setSaved] = useState(false)
  const [liveSuggestion, setLiveSuggestion] = useState<number | null>(null)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [manualSuggestion, setManualSuggestion] = useState('')

  useEffect(() => {
    const s = getDimensions(product.id)
    setHeightCm(s?.heightCm != null ? String(s.heightCm) : '')
    setWidthCm(s?.widthCm != null ? String(s.widthCm) : '')
    setLengthCm(s?.lengthCm != null ? String(s.lengthCm) : '')
    setWeightG(s?.weightG != null ? String(s.weightG) : '')
    setSaved(false)
  }, [product.id])

  useEffect(() => {
    const stored = getSuggestedPrice(product.id)
    setManualSuggestion(stored != null ? String(stored.toFixed(2)) : '')
  }, [product.id, getSuggestedPrice])

  useEffect(() => {
    let alive = true
    setLiveSuggestion(null)
    setSuggestionError(null)

    if (!product.sku) return

    fetch(`/api/metalshopping/price-suggestion/${encodeURIComponent(product.sku)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('fetch_failed')
        const payload = await res.json()
        if (!alive) return
        if (payload?.success && payload?.data?.minPrice) {
          setLiveSuggestion(Number(payload.data.minPrice))
        } else {
          setLiveSuggestion(null)
        }
      })
      .catch(() => {
        if (!alive) return
        setSuggestionError('Preço Sugerido indisponível')
      })

    return () => {
      alive = false
    }
  }, [product.sku])

  const storedDims = getDimensions(product.id)
  const hasDimensions = storedDims != null && Object.values(storedDims).some((v) => v != null)

  const mlString = (() => {
    const h = storedDims?.heightCm
    const w = storedDims?.widthCm
    const l = storedDims?.lengthCm
    const wg = storedDims?.weightG
    if (h != null && w != null && l != null && wg != null) return `${h}x${w}x${l},${wg}`
    return null
  })()

  function handleSave() {
    const dims: ProductDimensions = {
      heightCm: heightCm !== '' ? Number(heightCm) : null,
      widthCm: widthCm !== '' ? Number(widthCm) : null,
      lengthCm: lengthCm !== '' ? Number(lengthCm) : null,
      weightG: weightG !== '' ? Number(weightG) : null,
    }
    setDimensions(product.id, dims)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleDelete() {
    deleteDimensions(product.id)
    setHeightCm('')
    setWidthCm('')
    setLengthCm('')
    setWeightG('')
  }

  function saveManualSuggestion(value: string) {
    setManualSuggestion(value)
    const num = Number(value.replace(',', '.'))
    if (Number.isFinite(num) && num > 0) setSuggestedPrice(product.id, num)
    else deleteSuggestedPrice(product.id)
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-jetbrains-mono)',
  }

  const fields = [
    { label: 'Altura (cm)', value: heightCm, setter: setHeightCm },
    { label: 'Largura (cm)', value: widthCm, setter: setWidthCm },
    { label: 'Comprimento (cm)', value: lengthCm, setter: setLengthCm },
    { label: 'Peso (g)', value: weightG, setter: setWeightG },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ backgroundColor: 'transparent' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-72 z-40 flex flex-col shadow-2xl"
        style={{ backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <div className="flex items-center gap-2">
            <Ruler size={14} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Dimensões
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Product info */}
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <p
            className="text-xs font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
            title={product.name}
          >
            {product.name}
          </p>
          <p
            className="text-xs mt-0.5 font-mono"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {product.sku}
          </p>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {fields.map(({ label, value, setter }) => (
            <div key={label}>
              <label
                className="block text-xs mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {label}
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder="—"
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          ))}

          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Preço Sugerido
            </p>
            {suggestionError ? (
              <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
                {suggestionError}
              </p>
            ) : liveSuggestion != null ? (
              <p
                className="text-xs font-mono"
                style={{
                  color: 'var(--accent-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                MS {formatBRL(liveSuggestion)}
              </p>
            ) : null}
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Preço sugerido manual (R$)
            </label>
            <input
              aria-label="Preço sugerido manual (R$)"
              type="text"
              value={manualSuggestion}
              onChange={(e) => saveManualSuggestion(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm outline-none"
              style={inputStyle}
              placeholder="—"
            />
          </div>

          {mlString && (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>ML format: </span>
              <span
                className="font-mono"
                style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {mlString}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="px-4 py-3 flex gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border-color)' }}
        >
          {hasDimensions && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-md flex items-center justify-center"
              style={{ border: '1px solid var(--accent-danger)', color: 'var(--accent-danger)' }}
              title="Remover dimensões"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-white transition-opacity"
            style={{ backgroundColor: saved ? 'var(--accent-success, #22c55e)' : 'var(--accent-primary)' }}
          >
            <Save size={12} />
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>
    </>
  )
}
