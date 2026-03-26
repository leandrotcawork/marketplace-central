'use client'

import type {
  MarketplaceCapabilityProfile,
  MarketplaceCapabilityStatus,
  MarketplaceCommercialProfile,
  MarketplaceReviewStatus,
  MarketplaceRuleSourceType,
  Marketplace,
} from '@/types'

interface MarketplaceBaseFormProps {
  marketplace: Marketplace
  completeness: {
    total: number
    validated: number
    manualAssumption: number
    missing: number
  }
  onToggleActive: () => void
  onCommercialProfileChange: (partial: Partial<MarketplaceCommercialProfile>) => void
  onCapabilitiesChange: (partial: Partial<MarketplaceCapabilityProfile>) => void
}

const CAPABILITY_CYCLE: MarketplaceCapabilityStatus[] = [
  'supported',
  'partial',
  'planned',
  'blocked',
]

const CAPABILITY_META: Record<
  MarketplaceCapabilityStatus,
  { label: string; bg: string; color: string; dot: string }
> = {
  supported: {
    label: 'Suportado',
    bg: 'rgba(16,185,129,0.10)',
    color: 'var(--accent-success)',
    dot: '#10b981',
  },
  partial: {
    label: 'Parcial',
    bg: 'rgba(245,158,11,0.10)',
    color: 'var(--accent-warning)',
    dot: '#f59e0b',
  },
  planned: {
    label: 'Planejado',
    bg: 'rgba(99,102,241,0.10)',
    color: '#818cf8',
    dot: '#818cf8',
  },
  blocked: {
    label: 'Bloqueado',
    bg: 'rgba(239,68,68,0.08)',
    color: 'var(--accent-danger)',
    dot: '#ef4444',
  },
}

const REVIEW_META: Record<
  MarketplaceReviewStatus,
  { label: string; color: string; bg: string }
> = {
  validated: {
    label: 'Validado',
    color: 'var(--accent-success)',
    bg: 'rgba(16,185,129,0.10)',
  },
  manual_assumption: {
    label: 'Manual',
    color: 'var(--accent-warning)',
    bg: 'rgba(245,158,11,0.10)',
  },
  missing: {
    label: 'Faltando',
    color: 'var(--accent-danger)',
    bg: 'rgba(239,68,68,0.08)',
  },
}

const sourceTypeOptions: Array<{ value: MarketplaceRuleSourceType; label: string }> = [
  { value: 'official_doc', label: 'Doc oficial' },
  { value: 'seller_portal', label: 'Portal seller' },
  { value: 'contract', label: 'Contrato' },
  { value: 'manual_assumption', label: 'Manual' },
  { value: 'pending_doc', label: 'Pendente' },
]

const reviewOptions: Array<{ value: MarketplaceReviewStatus; label: string }> = [
  { value: 'validated', label: 'Validado' },
  { value: 'manual_assumption', label: 'Manual' },
  { value: 'missing', label: 'Faltando' },
]

const capabilityLabels: Record<keyof MarketplaceCapabilityProfile, string> = {
  publish: 'Publicação',
  priceSync: 'Preço',
  stockSync: 'Estoque',
  orders: 'Pedidos',
  messages: 'Mensagens',
  questions: 'Perguntas',
  freightQuotes: 'Frete',
  webhooks: 'Webhooks',
  sandbox: 'Sandbox',
}

function parsePercent(value: string): number {
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return parsed / 100
}

function parseCurrency(value: string): number {
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function cycleCapability(current: MarketplaceCapabilityStatus): MarketplaceCapabilityStatus {
  const idx = CAPABILITY_CYCLE.indexOf(current)
  return CAPABILITY_CYCLE[(idx + 1) % CAPABILITY_CYCLE.length]
}

export function MarketplaceBaseForm({
  marketplace,
  completeness,
  onToggleActive,
  onCommercialProfileChange,
  onCapabilitiesChange,
}: MarketplaceBaseFormProps) {
  const review = REVIEW_META[marketplace.commercialProfile.reviewStatus]

  const executionLabel =
    marketplace.executionMode === 'live'
      ? 'V1 ativo'
      : marketplace.executionMode === 'planned'
        ? 'Segunda onda'
        : 'Bloqueado'

  const rolloutLabel =
    marketplace.rolloutStage === 'v1'
      ? 'V1'
      : marketplace.rolloutStage === 'wave_2'
        ? 'Wave 2'
        : 'Bloqueado'

  return (
    <div
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Configuração base do canal
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Abastece a matriz por grupo e cobre qualquer produto sem exceção dedicada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: marketplace.active
                ? 'rgba(16,185,129,0.12)'
                : 'var(--bg-tertiary)',
              color: marketplace.active ? 'var(--accent-success)' : 'var(--text-secondary)',
            }}
          >
            {marketplace.active ? 'Ativo no simulador' : 'Inativo no simulador'}
          </span>
          <button
            type="button"
            onClick={onToggleActive}
            className="rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-dm-sans)',
            }}
          >
            {marketplace.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Info pills row */}
      <div
        className="flex flex-wrap gap-2 px-6 py-4"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <InfoPill label="Execução" value={executionLabel} />
        <InfoPill label="Rollout" value={rolloutLabel} />
        <InfoPill label="Auth" value={marketplace.authStrategy} />
        <InfoPill
          label="Completude"
          value={`${completeness.validated}/${completeness.total || 0} validado`}
        />
        <span
          className="ml-auto self-center rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: review.bg, color: review.color }}
        >
          {review.label}
        </span>
      </div>

      {/* Commercial fields */}
      <div className="px-6 py-5">
        <SectionLabel>Dados comerciais</SectionLabel>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EditableField
            label="Comissão base (%)"
            value={(marketplace.commercialProfile.commissionPercent * 100).toFixed(2)}
            onChange={(v) => onCommercialProfileChange({ commissionPercent: parsePercent(v) })}
            placeholder="ex: 15.00"
          />
          <EditableField
            label="Taxa fixa (R$)"
            value={marketplace.commercialProfile.fixedFeeAmount.toFixed(2)}
            onChange={(v) => onCommercialProfileChange({ fixedFeeAmount: parseCurrency(v) })}
            placeholder="ex: 8.00"
          />
          <EditableField
            label="Frete fixo (R$)"
            value={marketplace.commercialProfile.freightFixedAmount.toFixed(2)}
            onChange={(v) =>
              onCommercialProfileChange({ freightFixedAmount: parseCurrency(v) })
            }
            placeholder="ex: 0.00"
          />

          <label className="flex flex-col gap-1.5 text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Revisão base</span>
            <select
              value={marketplace.commercialProfile.reviewStatus}
              onChange={(e) =>
                onCommercialProfileChange({
                  reviewStatus: e.target.value as MarketplaceReviewStatus,
                })
              }
              className="rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            >
              {reviewOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Origem base</span>
            <select
              value={marketplace.commercialProfile.sourceType}
              onChange={(e) =>
                onCommercialProfileChange({
                  sourceType: e.target.value as MarketplaceRuleSourceType,
                })
              }
              className="rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            >
              {sourceTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Data da evidência</span>
            <input
              type="date"
              value={marketplace.commercialProfile.evidenceDate?.slice(0, 10) ?? ''}
              onChange={(e) =>
                onCommercialProfileChange({ evidenceDate: e.target.value || undefined })
              }
              className="rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs sm:col-span-2 lg:col-span-3">
            <span style={{ color: 'var(--text-secondary)' }}>Referência</span>
            <input
              value={marketplace.commercialProfile.sourceRef ?? ''}
              onChange={(e) => onCommercialProfileChange({ sourceRef: e.target.value })}
              className="rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="URL, contrato, nota interna"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs sm:col-span-2 lg:col-span-3">
            <span style={{ color: 'var(--text-secondary)' }}>Notas</span>
            <textarea
              value={marketplace.commercialProfile.notes ?? ''}
              onChange={(e) => onCommercialProfileChange({ notes: e.target.value })}
              className="min-h-20 rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="Contexto operacional, restrições do canal, observações de contrato."
            />
          </label>
        </div>
      </div>

      {/* Capabilities */}
      <div
        className="px-6 py-5"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <SectionLabel>Capabilities</SectionLabel>
        <p className="mt-1 mb-4 text-xs" style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}>
          Clique para alternar entre Suportado → Parcial → Planejado → Bloqueado.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
          {(
            Object.entries(capabilityLabels) as [keyof MarketplaceCapabilityProfile, string][]
          ).map(([key, label]) => {
            const status = marketplace.capabilities[key]
            const meta = CAPABILITY_META[status]
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onCapabilitiesChange({ [key]: cycleCapability(status) })
                }
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all"
                style={{
                  backgroundColor: meta.bg,
                  borderColor: `${meta.dot}30`,
                  cursor: 'pointer',
                }}
                title={`Clique para alterar: ${meta.label}`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: meta.dot }}
                />
                <div className="min-w-0">
                  <div
                    className="truncate text-xs font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {label}
                  </div>
                  <div className="text-xs" style={{ color: meta.color }}>
                    {meta.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span
        className="text-xs font-medium"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-jetbrains-mono)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="text-xs font-semibold uppercase tracking-widest"
      style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em' }}
    >
      {children}
    </h4>
  )
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm"
        style={inputStyle}
        placeholder={placeholder}
      />
    </label>
  )
}

const inputStyle = {
  borderColor: 'var(--border-color)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
}
