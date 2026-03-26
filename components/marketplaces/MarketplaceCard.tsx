'use client'

import { useState } from 'react'
import { Store, Check, X, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { formatBRL, formatPercent } from '@/lib/formatters'
import type { Marketplace } from '@/types'

interface MarketplaceCardProps {
  marketplace: Marketplace
  canDelete?: boolean
}

function MarketplaceIcon({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const colors: Record<string, string> = {
    'Mercado Livre': '#FFE600',
    'Amazon Brasil': '#FF9900',
    'Shopee': '#EE4D2D',
    'Magalu': '#0067B3',
    'Leroy Merlin': '#7CB442',
    'Madeira Madeira': '#2D7D4E',
  }
  const bg = colors[name] ?? 'var(--accent-primary)'
  const isLight = ['#FFE600'].includes(bg)

  return (
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
      style={{
        backgroundColor: bg,
        color: isLight ? '#1A1D27' : 'white',
        fontFamily: 'var(--font-dm-sans)',
      }}
    >
      {initials}
    </div>
  )
}

export function MarketplaceCard({ marketplace, canDelete }: MarketplaceCardProps) {
  const { toggleActive, updateMarketplace, removeMarketplace } = useMarketplaceStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    commission: (marketplace.commission * 100).toFixed(0),
    fixedFee: marketplace.fixedFee.toString(),
    notes: marketplace.notes ?? '',
  })

  const handleSave = () => {
    const commission = parseFloat(draft.commission) / 100
    const fixedFee = parseFloat(draft.fixedFee) || 0
    if (isNaN(commission) || commission < 0 || commission > 1) return
    updateMarketplace(marketplace.id, { commission, fixedFee, notes: draft.notes || undefined })
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft({
      commission: (marketplace.commission * 100).toFixed(0),
      fixedFee: marketplace.fixedFee.toString(),
      notes: marketplace.notes ?? '',
    })
    setEditing(false)
  }

  return (
    <div
      className={cn(
        'rounded-xl p-5 transition-all duration-200 relative group',
        !marketplace.active && 'opacity-50'
      )}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: `1px solid ${marketplace.active ? 'var(--border-color)' : 'var(--border-color)'}`,
        boxShadow: marketplace.active ? '0 0 0 0 transparent' : undefined,
      }}
      onMouseEnter={(e) => {
        if (marketplace.active) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 20px rgba(59,130,246,0.08)'
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 0 transparent'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <MarketplaceIcon name={marketplace.name} />
          <div>
            <h3 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
              {marketplace.name}
            </h3>
            {marketplace.notes && (
              <p className="text-xs mt-0.5 truncate max-w-[160px]" style={{ color: 'var(--text-secondary)' }}>
                {marketplace.notes}
              </p>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => toggleActive(marketplace.id)}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 mt-0.5',
          )}
          style={{ backgroundColor: marketplace.active ? 'var(--accent-success)' : 'var(--bg-tertiary)' }}
        >
          <div
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
            style={{ left: marketplace.active ? '22px' : '2px' }}
          />
        </button>
      </div>

      {/* Metrics */}
      {!editing ? (
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Comissão</p>
            <p className="text-lg font-semibold" style={{ color: 'var(--accent-warning)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {formatPercent(marketplace.commission * 100, 0)}
            </p>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Taxa Fixa</p>
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {marketplace.fixedFee > 0 ? formatBRL(marketplace.fixedFee) : '—'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Comissão (%)</label>
              <input
                type="number"
                value={draft.commission}
                onChange={(e) => setDraft(d => ({ ...d, commission: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
                min="0" max="100" step="0.5"
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Taxa Fixa (R$)</label>
              <input
                type="number"
                value={draft.fixedFee}
                onChange={(e) => setDraft(d => ({ ...d, fixedFee: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
                min="0" step="0.5"
              />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Observações</label>
            <input
              value={draft.notes}
              onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="Ex: frete grátis acima de R$79"
              className="w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white transition-colors"
              style={{ backgroundColor: 'var(--accent-success)' }}
            >
              <Check size={12} /> Salvar
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs transition-colors"
              style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors flex-1 justify-center"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <Pencil size={12} /> Editar
          </button>
          {canDelete && (
            <button
              onClick={() => removeMarketplace(marketplace.id)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--accent-danger)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
