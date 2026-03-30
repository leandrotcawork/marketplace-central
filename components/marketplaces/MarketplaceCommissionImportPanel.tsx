'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, DownloadCloud, RefreshCcw, XCircle } from 'lucide-react'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { useProductDimensionsStore } from '@/stores/productDimensionsStore'
import { useProductCategoryStore } from '@/stores/productCategoryStore'
import type {
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionImportResult,
  Product,
} from '@/types'

interface MarketplaceCommissionImportPanelProps {
  channelId?: string
  products: Product[]
  onApply: (
    groups: MarketplaceCommissionImportGroupPreview[],
    productPreviews: MarketplaceCommissionImportProductPreview[]
  ) => void
}

const CHANNEL_LABELS: Record<string, string> = {
  'mercado-livre': 'Mercado Livre',
  'magalu': 'Magalu',
  'leroy': 'Leroy Merlin',
  'madeira': 'Madeira Madeira',
}

export function MarketplaceCommissionImportPanel({
  channelId = 'mercado-livre',
  products,
  onApply,
}: MarketplaceCommissionImportPanelProps) {
  const { getDimensions } = useProductDimensionsStore()
  const { categories: storedCategories, setMany: saveCategories } = useProductCategoryStore()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<MarketplaceCommissionImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState('')
  const [listingTypeId, setListingTypeId] = useState<'gold_special' | 'gold_pro'>('gold_special')
  const [discountTier, setDiscountTier] = useState<'none' | '25' | '50'>('none')

  const totals = useMemo(() => {
    if (!result) {
      return { imported: 0, conflict: 0, missing: 0, error: 0 }
    }

    return {
      imported: result.importedGroups.length,
      conflict: result.conflictGroups.length,
      missing: result.missingGroups.length,
      error: result.errorGroups.length,
    }
  }, [result])

  async function handlePreview() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      // Build per-product dimensions map from local store
      // ML API requires integer dimensions — round up to avoid underestimating
      const productDimensions: Record<string, string> = {}
      for (const p of products) {
        const d = getDimensions(p.id)
        if (d?.heightCm != null && d?.widthCm != null && d?.lengthCm != null && d?.weightG != null) {
          productDimensions[p.id] = `${Math.ceil(d.heightCm)}x${Math.ceil(d.widthCm)}x${Math.ceil(d.lengthCm)},${Math.ceil(d.weightG)}`
        }
      }

      // Build per-product category overrides from local store
      const productCategories: Record<string, { categoryId: string; categoryName?: string }> = {}
      for (const p of products) {
        const cat = storedCategories[p.id]
        if (cat?.categoryId) {
          productCategories[p.id] = cat
        }
      }

      const response = await fetch(`/api/marketplace-commission-import/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products,
          dimensions: dimensions.trim() || undefined,
          productDimensions: Object.keys(productDimensions).length > 0 ? productDimensions : undefined,
          ...(channelId === 'mercado-livre'
            ? {
                listingTypeId,
                productCategories: Object.keys(productCategories).length > 0 ? productCategories : undefined,
              }
            : {}),
          ...(channelId === 'magalu' ? { discountTier } : {}),
        }),
      })
      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? `Falha ao importar comissoes do ${CHANNEL_LABELS[channelId] ?? channelId}`)
      }

      const importResult = payload.data as MarketplaceCommissionImportResult

      // Save newly discovered categories to store for next time
      const newCategories: Record<string, { categoryId: string; categoryName?: string }> = {}
      for (const group of importResult.importedGroups) {
        if (group.status === 'importable' && group.categoryId) {
          for (const sp of group.sampleProducts ?? []) {
            if (sp.categoryId && !storedCategories[sp.productId]) {
              newCategories[sp.productId] = { categoryId: sp.categoryId, categoryName: sp.categoryName }
            }
          }
        }
      }
      if (Object.keys(newCategories).length > 0) {
        saveCategories(newCategories)
      }

      setResult(importResult)
      setMessage('Preview de comissao gerado com sucesso.')
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : `Falha ao importar comissoes do ${CHANNEL_LABELS[channelId] ?? channelId}`
      )
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!result || result.importedGroups.length === 0) return
    setApplying(true)
    try {
      onApply(result.importedGroups, result.productPreviews)
      const productCount = result.productPreviews.filter((p) => p.status === 'importable').length
      setMessage(
        `${result.importedGroups.length} grupo(s) e ${productCount} produto(s) atualizados na matriz comercial.`
      )
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Importar comissao oficial do {CHANNEL_LABELS[channelId] ?? channelId}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {channelId === 'mercado-livre'
              ? `Usa domain_discovery + listing_prices para preencher overrides por grupo. Frete calculado automaticamente via EAN do catalogo MeLi.`
              : channelId === 'magalu'
              ? 'Comissao fixa 16%. Frete calculado via tabela Magalu Entregas (peso real vs cubado). Informe dimensoes para habilitar o calculo de frete.'
              : channelId === 'leroy'
              ? 'Comissao fixa 18% via Mirakl Seller API. Sem calculo de frete — depende de configuracao de logistic-class com a Leroy.'
              : channelId === 'madeira'
              ? 'Comissao fixa 15%. Frete disponivel via cotacao direta (/v1/freight/quote). Demais endpoints aguardam sandbox do parceiro.'
              : channelId === 'amazon'
              ? 'Comissao por categoria (10–15%) mapeada via nome do grupo taxonomico. Categorias tiered (Moveis, Acessorios Eletronicos): preco <= limiar usa 15%, acima usa 10%.'
              : `Importa comissoes do ${CHANNEL_LABELS[channelId] ?? channelId}.`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {channelId === 'mercado-livre' && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="meli-listing-type"
                  className="text-xs"
                  style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                >
                  Tipo de anuncio:
                </label>
                <select
                  id="meli-listing-type"
                  value={listingTypeId}
                  onChange={(e) => setListingTypeId(e.target.value as 'gold_special' | 'gold_pro')}
                  className="rounded-md px-2 py-1 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                >
                  <option value="gold_special">Classico (gold_special)</option>
                  <option value="gold_pro">Premium (gold_pro)</option>
                </select>
              </div>
            )}
            {channelId === 'magalu' && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="magalu-discount-tier"
                  className="text-xs"
                  style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                >
                  Desconto frete:
                </label>
                <select
                  id="magalu-discount-tier"
                  value={discountTier}
                  onChange={(e) => setDiscountTier(e.target.value as 'none' | '25' | '50')}
                  className="rounded-md px-2 py-1 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                >
                  <option value="none">Sem desconto (&lt;87% pontualidade)</option>
                  <option value="25">25% desconto (87-97%)</option>
                  <option value="50">50% desconto (&gt;97%)</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label
                htmlFor="meli-dimensions"
                className="text-xs"
                style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
              >
                Dimensoes (opcional):
              </label>
              <input
                id="meli-dimensions"
                type="text"
                placeholder="Substitui catalogo — ex: 10x60x60,25000"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                className="rounded-md px-2 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  width: '260px',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={loading || products.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {loading ? <RefreshCcw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
            {loading ? `Consultando ${CHANNEL_LABELS[channelId] ?? channelId}...` : 'Gerar preview'}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !result || result.importedGroups.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
            }}
          >
            <CheckCircle2 size={14} />
            Aplicar importacao
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <MetricPill label="Produtos no escopo" value={String(products.length)} tone="neutral" />
          <MetricPill label="Importaveis" value={String(totals.imported)} tone="success" />
          <MetricPill label="Conflitos" value={String(totals.conflict)} tone="warning" />
          <MetricPill label="Sem resposta" value={String(totals.missing)} tone="neutral" />
          <MetricPill label="Erros" value={String(totals.error)} tone="danger" />
        </div>

        {message && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: 'var(--accent-success)',
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--accent-danger)',
            }}
          >
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Gere um preview para ver quais grupos podem ser sobrescritos com a fee oficial do{' '}
            {CHANNEL_LABELS[channelId] ?? channelId}.
          </div>
        )}

        {result && (
          <div className="grid gap-4 xl:grid-cols-2">
            <GroupList
              title="Grupos importaveis"
              icon={<CheckCircle2 size={14} />}
              tone="success"
              groups={result.importedGroups}
            />
            <GroupList
              title="Grupos em conflito"
              icon={<AlertTriangle size={14} />}
              tone="warning"
              groups={result.conflictGroups}
            />
            <GroupList
              title="Grupos sem resposta"
              icon={<XCircle size={14} />}
              tone="neutral"
              groups={result.missingGroups}
            />
            <GroupList
              title="Grupos com erro"
              icon={<XCircle size={14} />}
              tone="danger"
              groups={result.errorGroups}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function GroupList({
  title,
  icon,
  tone,
  groups,
}: {
  title: string
  icon: ReactNode
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  groups: MarketplaceCommissionImportGroupPreview[]
}) {
  const colors = toneStyles[tone]

  return (
    <div
      className="rounded-xl border"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-tertiary)',
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium"
        style={{ borderColor: 'var(--border-color)', color: colors.color }}
      >
        {icon}
        {title}
        <span className="ml-auto text-xs" style={{ color: 'var(--text-secondary)' }}>
          {groups.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Nenhum grupo nesta faixa.
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div
                key={group.groupId}
                className="rounded-lg border px-3 py-3"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {group.groupName}
                    </div>
                    <div
                      className="mt-1 text-[11px]"
                      style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      {group.groupId}
                    </div>
                  </div>
                  <div className="text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {group.resolvedProductCount}/{group.productCount} produtos validos
                  </div>
                </div>

                {(typeof group.commissionPercent === 'number' || typeof group.fixedFeeAmount === 'number' || typeof group.freightFixedAmount === 'number') && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {typeof group.commissionPercent === 'number' && (
                      <span className="rounded-full px-2 py-1" style={chipStyle}>
                        Comissao {formatPercent(group.commissionPercent * 100, 1)}
                      </span>
                    )}
                    {typeof group.fixedFeeAmount === 'number' && (
                      <span className="rounded-full px-2 py-1" style={chipStyle}>
                        Taxa fixa {formatBRL(group.fixedFeeAmount)}
                      </span>
                    )}
                    {typeof group.freightFixedAmount === 'number' && (
                      <span className="rounded-full px-2 py-1" style={chipStyle}>
                        Frete vendedor {formatBRL(group.freightFixedAmount)}
                      </span>
                    )}
                    {group.categoryId && (
                      <span className="rounded-full px-2 py-1" style={chipStyle}>
                        {group.categoryId}
                      </span>
                    )}
                  </div>
                )}

                {group.notes && (
                  <div className="mt-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {group.notes}
                  </div>
                )}

                {group.sampleProducts.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {group.sampleProducts.map((product) => (
                      <div key={product.productId}>
                        {product.sku} · {product.categoryId ?? 'sem categoria'} ·{' '}
                        {product.error ?? product.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}) {
  const colors = toneStyles[tone]

  return (
    <span
      className="rounded-full px-3 py-1"
      style={{
        backgroundColor: colors.background,
        color: colors.color,
      }}
    >
      {label}: {value}
    </span>
  )
}

const chipStyle = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
} as const

const toneStyles = {
  success: {
    background: 'rgba(16,185,129,0.12)',
    color: 'var(--accent-success)',
  },
  warning: {
    background: 'rgba(245,158,11,0.12)',
    color: 'var(--accent-warning)',
  },
  danger: {
    background: 'rgba(239,68,68,0.12)',
    color: 'var(--accent-danger)',
  },
  neutral: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
  },
} as const
