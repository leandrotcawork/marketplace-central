'use client'

import { useState } from 'react'
import { Plus, X, Store } from 'lucide-react'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { MarketplaceCard } from '@/components/marketplaces/MarketplaceCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { generateId } from '@/lib/formatters'

function AddMarketplaceForm({ onClose }: { onClose: () => void }) {
  const { addMarketplace } = useMarketplaceStore()
  const [form, setForm] = useState({ name: '', commission: '15', fixedFee: '0', notes: '' })
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    const commission = parseFloat(form.commission) / 100
    if (isNaN(commission) || commission < 0 || commission > 1) { setError('Comissão inválida (0-100%)'); return }
    addMarketplace({
      id: generateId(),
      name: form.name.trim(),
      commission,
      fixedFee: parseFloat(form.fixedFee) || 0,
      active: true,
      notes: form.notes || undefined,
    })
    onClose()
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-primary)',
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
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--accent-primary)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
          Novo Marketplace
        </h3>
        <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Nome *</label>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle}
            placeholder="Nome do marketplace"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Comissão (%)</label>
            <input
              type="number"
              value={form.commission}
              onChange={(e) => setForm(f => ({ ...f, commission: e.target.value }))}
              style={inputStyle}
              min="0" max="100" step="0.5"
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Taxa Fixa (R$)</label>
            <input
              type="number"
              value={form.fixedFee}
              onChange={(e) => setForm(f => ({ ...f, fixedFee: e.target.value }))}
              style={inputStyle}
              min="0" step="0.5"
            />
          </div>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Observações</label>
          <input
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ ...inputStyle, fontFamily: 'var(--font-ibm-plex-sans)' }}
            placeholder="Ex: frete grátis acima de R$79"
          />
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs transition-colors"
            style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 py-2 rounded-lg text-xs text-white font-medium"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            Adicionar
          </button>
        </div>
      </form>
    </div>
  )
}

export default function MarketplacesPage() {
  const { marketplaces } = useMarketplaceStore()
  const [showAdd, setShowAdd] = useState(false)

  const activeCount = marketplaces.filter((m) => m.active).length
  const defaultIds = ['mercado-livre', 'amazon', 'shopee', 'magalu', 'leroy', 'madeira']

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Marketplaces"
        subtitle={`${activeCount} de ${marketplaces.length} marketplace${marketplaces.length !== 1 ? 's' : ''} ativo${activeCount !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            <Plus size={13} />
            Adicionar marketplace
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Info banner */}
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 mb-6 text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Store size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <p>
            Configure comissões e taxas de cada marketplace. Apenas os marketplaces <strong style={{ color: 'var(--text-primary)' }}>ativos</strong> serão incluídos no simulador e na análise de IA.
          </p>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-6">
            <AddMarketplaceForm onClose={() => setShowAdd(false)} />
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
          {marketplaces.map((m) => (
            <MarketplaceCard
              key={m.id}
              marketplace={m}
              canDelete={!defaultIds.includes(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
