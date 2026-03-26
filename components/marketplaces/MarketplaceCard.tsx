'use client'

import { BadgeCheck, Blocks, Cable, Clock3, Lock, Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBRL, formatPercent } from '@/lib/formatters'
import type { Marketplace } from '@/types'

interface MarketplaceCardProps {
  marketplace: Marketplace
  completeness: {
    total: number
    validated: number
    manualAssumption: number
    missing: number
  }
  averageMargin?: number | null
  selected?: boolean
  onSelect: () => void
}

function MarketplaceIcon({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
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

  const backgroundColor = colors[name] ?? 'var(--accent-primary)'
  const lightBackground = backgroundColor === '#FFE600'

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold"
      style={{
        backgroundColor,
        color: lightBackground ? '#1A1D27' : '#fff',
        fontFamily: 'var(--font-dm-sans)',
      }}
    >
      {initials}
    </div>
  )
}

function RolloutBadge({ marketplace }: { marketplace: Marketplace }) {
  const config =
    marketplace.executionMode === 'live'
      ? {
          icon: <BadgeCheck size={12} />,
          label: 'V1',
          color: 'var(--accent-success)',
          backgroundColor: 'rgba(16,185,129,0.12)',
        }
      : marketplace.executionMode === 'planned'
      ? {
          icon: <Clock3 size={12} />,
          label: 'Segunda onda',
          color: 'var(--accent-warning)',
          backgroundColor: 'rgba(245,158,11,0.12)',
        }
      : {
          icon: <Lock size={12} />,
          label: 'Bloqueado',
          color: 'var(--accent-danger)',
          backgroundColor: 'rgba(239,68,68,0.12)',
        }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium"
      style={{ color: config.color, backgroundColor: config.backgroundColor }}
    >
      {config.icon}
      {config.label}
    </span>
  )
}

function ConnectionBadge({ marketplace }: { marketplace: Marketplace }) {
  const config =
    marketplace.connectionStatus === 'connected'
      ? {
          label: 'Conectado',
          color: 'var(--accent-success)',
        }
      : marketplace.connectionStatus === 'blocked'
      ? {
          label: 'Bloqueado',
          color: 'var(--accent-danger)',
        }
      : marketplace.connectionStatus === 'attention'
      ? {
          label: 'Atenção',
          color: 'var(--accent-warning)',
        }
      : {
          label: 'Sem conexão',
          color: 'var(--text-secondary)',
        }

  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: config.color }}>
      <Cable size={12} />
      {config.label}
    </span>
  )
}

function CapabilityPill({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <span
      className="rounded-full px-2 py-1 text-[11px]"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        backgroundColor: active ? 'rgba(59,130,246,0.1)' : 'var(--bg-tertiary)',
      }}
    >
      {label}
    </span>
  )
}

export function MarketplaceCard({
  marketplace,
  completeness,
  averageMargin,
  selected,
  onSelect,
}: MarketplaceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-2xl border p-5 text-left transition-all duration-200',
        selected && 'ring-2 ring-offset-0'
      )}
      style={{
        backgroundColor: selected ? 'rgba(59,130,246,0.06)' : 'var(--bg-secondary)',
        borderColor: selected ? 'var(--accent-primary)' : 'var(--border-color)',
        boxShadow: selected ? '0 0 0 1px rgba(59,130,246,0.1)' : 'none',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <MarketplaceIcon name={marketplace.name} />
          <div className="min-w-0">
            <h3
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              {marketplace.name}
            </h3>
            <ConnectionBadge marketplace={marketplace} />
          </div>
        </div>
        <RolloutBadge marketplace={marketplace} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <p className="mb-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Base comercial
          </p>
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {formatPercent(marketplace.commercialProfile.commissionPercent * 100, 0)}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {marketplace.commercialProfile.fixedFeeAmount > 0
              ? `${formatBRL(marketplace.commercialProfile.fixedFeeAmount)} fixo`
              : 'Sem taxa fixa'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {marketplace.commercialProfile.freightFixedAmount > 0
              ? `${formatBRL(marketplace.commercialProfile.freightFixedAmount)} frete`
              : 'Frete por grupo'}
          </p>
        </div>

        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <p className="mb-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Completude comercial
          </p>
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {completeness.validated}/{completeness.total || 0}
          </p>
          <p className="text-xs" style={{ color: 'var(--accent-warning)' }}>
            {completeness.manualAssumption} manual
          </p>
          <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
            {completeness.missing} faltando
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <CapabilityPill
          label="Publicação"
          active={marketplace.capabilities.publish !== 'blocked'}
        />
        <CapabilityPill
          label="Estoque"
          active={marketplace.capabilities.stockSync !== 'blocked'}
        />
        <CapabilityPill
          label="Pedidos"
          active={marketplace.capabilities.orders !== 'blocked'}
        />
        <CapabilityPill
          label="Mensagens"
          active={marketplace.capabilities.messages === 'supported'}
        />
      </div>

      <div
        className="mt-4 flex items-center justify-between border-t pt-3 text-xs"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
          <Store size={12} />
          {marketplace.active ? 'Ativo no simulador' : 'Inativo no simulador'}
        </span>
        <span
          className="inline-flex items-center gap-1"
          style={{
            color:
              averageMargin == null
                ? 'var(--text-secondary)'
                : averageMargin >= 20
                ? 'var(--accent-success)'
                : averageMargin >= 10
                ? 'var(--accent-warning)'
                : 'var(--accent-danger)',
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          <Blocks size={12} />
          {averageMargin == null ? 'sem base' : `${formatPercent(averageMargin)} margem`}
        </span>
      </div>
    </button>
  )
}
