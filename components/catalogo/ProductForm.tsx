'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useProductStore } from '@/stores/productStore'
import { generateId } from '@/lib/formatters'
import type { Product } from '@/types'

interface ProductFormProps {
  open: boolean
  onClose: () => void
  editProduct?: Product
}

const UNITS = ['un', 'm²', 'm', 'kg', 'cx', 'pç', 'par', 'kit']
const CATEGORIES = ['Porcelanato', 'Cerâmica', 'Revestimento', 'Metal', 'Louça', 'Acessório', 'Rejunte', 'Argamassa', 'Outros']

export function ProductForm({ open, onClose, editProduct }: ProductFormProps) {
  const { addProduct, updateProduct } = useProductStore()
  const isEditing = !!editProduct

  const getInitialForm = () => ({
    sku: editProduct?.sku ?? '',
    referencia: editProduct?.referencia ?? '',
    ean: editProduct?.ean ?? '',
    name: editProduct?.name ?? '',
    category: editProduct?.category ?? '',
    cost: editProduct?.cost?.toString() ?? '',
    basePrice: editProduct?.basePrice?.toString() ?? '',
    stock: editProduct?.stock?.toString() ?? '',
    unit: editProduct?.unit ?? 'un',
  })

  const [form, setForm] = useState({
    sku: editProduct?.sku ?? '',
    referencia: editProduct?.referencia ?? '',
    ean: editProduct?.ean ?? '',
    name: editProduct?.name ?? '',
    category: editProduct?.category ?? '',
    cost: editProduct?.cost?.toString() ?? '',
    basePrice: editProduct?.basePrice?.toString() ?? '',
    stock: editProduct?.stock?.toString() ?? '',
    unit: editProduct?.unit ?? 'un',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(getInitialForm())
      setErrors({})
    }
  // editProduct is required to update the form when switching rows in edit mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProduct])

  if (!open) return null

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nome obrigatório'
    if (!form.sku.trim()) errs.sku = 'SKU obrigatório'
    const cost = parseFloat(form.cost.replace(',', '.'))
    const price = parseFloat(form.basePrice.replace(',', '.'))
    if (isNaN(cost) || cost <= 0) errs.cost = 'Custo inválido'
    if (isNaN(price) || price <= 0) errs.basePrice = 'Preço inválido'
    return errs
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const data: Product = {
      id: editProduct?.id ?? generateId(),
      sku: form.sku.trim().toUpperCase(),
      referencia: form.referencia.trim() || undefined,
      ean: form.ean.trim() || undefined,
      name: form.name.trim(),
      category: form.category || 'Outros',
      primaryTaxonomyGroupName: form.category || 'Outros',
      cost: parseFloat(form.cost.replace(',', '.')),
      basePrice: parseFloat(form.basePrice.replace(',', '.')),
      stock: parseInt(form.stock) || 0,
      unit: form.unit,
    }

    if (isEditing) updateProduct(editProduct!.id, data)
    else addProduct(data)
    setForm(getInitialForm())
    setErrors({})
    onClose()
  }

  const Field = ({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}>
        {label}
      </label>
      {children}
      {error && <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{error}</p>}
    </div>
  )

  const inputStyle = {
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-jetbrains-mono)',
    fontSize: '13px',
    borderRadius: '6px',
    padding: '8px 10px',
    width: '100%',
    outline: 'none',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div
        className="relative rounded-xl w-full max-w-md shadow-2xl"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
            {isEditing ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU *" id="sku" error={errors.sku}>
              <input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.sku ? 'var(--accent-danger)' : 'var(--border-color)' }}
                placeholder="001"
              />
            </Field>
            <Field label="Unidade" id="unit">
              <select
                id="unit"
                value={form.unit}
                onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                style={{ ...inputStyle }}
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Referência" id="referencia">
              <input
                id="referencia"
                value={form.referencia}
                onChange={(e) => setForm(f => ({ ...f, referencia: e.target.value }))}
                style={inputStyle}
                placeholder="REF-001"
              />
            </Field>
            <Field label="EAN / GTIN" id="ean">
              <input
                id="ean"
                value={form.ean}
                onChange={(e) => setForm(f => ({ ...f, ean: e.target.value }))}
                style={inputStyle}
                placeholder="7891234567890"
              />
            </Field>
          </div>

          <Field label="Nome *" id="name" error={errors.name}>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, borderColor: errors.name ? 'var(--accent-danger)' : 'var(--border-color)' }}
              placeholder="Porcelanato Bianco 60x60"
            />
          </Field>

          <Field label="Categoria" id="category">
            <select
              id="category"
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...inputStyle }}
            >
              <option value="">Selecione...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Custo (R$) *" id="cost" error={errors.cost}>
              <input
                id="cost"
                value={form.cost}
                onChange={(e) => setForm(f => ({ ...f, cost: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.cost ? 'var(--accent-danger)' : 'var(--border-color)' }}
                placeholder="45.00"
              />
            </Field>
            <Field label="Preço Base (R$) *" id="basePrice" error={errors.basePrice}>
              <input
                id="basePrice"
                value={form.basePrice}
                onChange={(e) => setForm(f => ({ ...f, basePrice: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.basePrice ? 'var(--accent-danger)' : 'var(--border-color)' }}
                placeholder="89.90"
              />
            </Field>
            <Field label="Estoque" id="stock">
              <input
                id="stock"
                type="number"
                value={form.stock}
                onChange={(e) => setForm(f => ({ ...f, stock: e.target.value }))}
                style={inputStyle}
                placeholder="100"
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm transition-colors"
              style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--accent-primary)', fontFamily: 'var(--font-dm-sans)' }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {isEditing ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
