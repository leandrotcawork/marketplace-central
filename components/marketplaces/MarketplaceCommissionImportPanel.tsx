'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, DownloadCloud, RefreshCcw, Tag, Truck } from 'lucide-react'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { useProductDimensionsStore } from '@/stores/productDimensionsStore'
import { useProductCategoryStore } from '@/stores/productCategoryStore'
import { useShippingStore } from '@/stores/shippingStore'
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
  const { fromCep, toCep } = useShippingStore()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [freightLoading, setFreightLoading] = useState(false)
  const [result, setResult] = useState<MarketplaceCommissionImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [freightMessage, setFreightMessage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState('')
  const [listingTypeId, setListingTypeId] = useState<'gold_special' | 'gold_pro'>('gold_special')
  const [discountTier, setDiscountTier] = useState<'none' | '25' | '50'>('none')
  const [minimized, setMinimized] = useState(false)
  const [msPrices, setMsPrices] = useState<Record<string, number>>({})
  const [msLoading, setMsLoading] = useState(false)
  const [msMessage, setMsMessage] = useState<string | null>(null)

  const conflictGroupIds = useMemo(
    () => new Set(result?.conflictGroups.map((group) => group.groupId) ?? []),
    [result]
  )

  const totals = useMemo(() => {
    if (!result) {
      return { importable: 0, conflict: 0, missing: 0, error: 0, total: 0 }
    }

    const previews = result.productPreviews
    const importable = previews.filter((p) => p.status === 'importable').length
    const missing = previews.filter((p) => p.status === 'missing').length
    const error = previews.filter((p) => p.status === 'error').length
    const conflict = previews.filter((p) => conflictGroupIds.has(p.groupId)).length

    return {
      importable,
      conflict,
      missing,
      error,
      total: previews.length,
    }
  }, [result, conflictGroupIds])

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
      setMinimized(false)
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

  async function handleFreightQuotes() {
    if (!result || !fromCep || !toCep) return
    setFreightLoading(true)
    setFreightMessage(null)

    const updatedPreviews = [...result.productPreviews]
    const previewIndexById = new Map<string, number>()
    for (let i = 0; i < updatedPreviews.length; i++) {
      previewIndexById.set(updatedPreviews[i]!.productId, i)
    }

    let quotedCount = 0
    let skippedCount = 0
    let failedCount = 0

    async function quotePreview(preview: MarketplaceCommissionImportProductPreview): Promise<void> {
      if (typeof preview.freightFixedAmount === 'number' && preview.freightFixedAmount > 0) {
        skippedCount++
        return
      }

      const dims = getDimensions(preview.productId)
      if (
        !dims ||
        dims.heightCm == null ||
        dims.widthCm == null ||
        dims.lengthCm == null ||
        dims.weightG == null ||
        dims.heightCm <= 0 ||
        dims.widthCm <= 0 ||
        dims.lengthCm <= 0 ||
        dims.weightG <= 0
      ) {
        failedCount++
        return
      }

      try {
        const response = await fetch('/api/melhor-envio/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromPostalCode: fromCep,
            toPostalCode: toCep,
            products: [
              {
                id: preview.productId,
                widthCm: Math.ceil(dims.widthCm),
                heightCm: Math.ceil(dims.heightCm),
                lengthCm: Math.ceil(dims.lengthCm),
                weightG: Math.ceil(dims.weightG),
                insuranceValue: Number.isFinite(preview.basePrice) && preview.basePrice > 0 ? preview.basePrice : 0,
                quantity: 1,
              },
            ],
          }),
        })

        const payload = await response.json()
        if (!payload?.success || !Array.isArray(payload.data)) {
          failedCount++
          return
        }

        const options = payload.data as Array<{ customPrice: unknown; error?: unknown }>
        const valid = options
          .map((o) => ({ price: Number(o.customPrice), error: o.error }))
          .filter((o) => !o.error && Number.isFinite(o.price) && o.price > 0)

        if (valid.length === 0) {
          failedCount++
          return
        }

        const cheapest = valid.reduce((a, b) => (a.price < b.price ? a : b))
        const idx = previewIndexById.get(preview.productId)
        if (idx === undefined) return
        updatedPreviews[idx] = { ...preview, freightFixedAmount: cheapest.price }
        quotedCount++
      } catch {
        failedCount++
      }
    }

    const candidates = updatedPreviews.filter((p) => p.status === 'importable')
    const CONCURRENCY = 4
    let cursor = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      while (true) {
        const i = cursor++
        if (i >= candidates.length) break
        await quotePreview(candidates[i]!)
      }
    })

    await Promise.all(workers)

    setResult((prev) => (prev ? { ...prev, productPreviews: updatedPreviews } : prev))
    setFreightMessage(
      `Frete ME calculado: ${quotedCount} produto(s) atualizado(s)` +
        (skippedCount > 0 ? `, ${skippedCount} ja tinham frete` : '') +
        (failedCount > 0 ? `, ${failedCount} sem dimensoes ou cotacao` : '') +
        '.'
    )
    setFreightLoading(false)
  }

  async function handleMsPriceSuggestions() {
    if (!result) return
    setMsLoading(true)
    setMsMessage(null)

    const skus = result.productPreviews
      .filter((p) => p.status === 'importable' && p.sku)
      .map((p) => p.sku)

    if (skus.length === 0) {
      setMsMessage('Nenhum produto importável com SKU disponível.')
      setMsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/metalshopping/price-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus }),
      })
      const payload = await response.json()
      if (!payload?.success) throw new Error(payload?.error ?? 'Falha ao buscar sugestões MS')

      const map: Record<string, number> = {}
      for (const item of payload.data as Array<{ sku: string; minPrice: number }>) {
        map[item.sku] = item.minPrice
      }
      setMsPrices(map)
      const found = Object.keys(map).length
      setMsMessage(`Sugestão MS carregada: ${found} de ${skus.length} produto(s) com preço mínimo.`)
    } catch (err) {
      setMsMessage(err instanceof Error ? err.message : 'Erro ao buscar sugestão MS')
    } finally {
      setMsLoading(false)
    }
  }

  function handleApply() {
    if (!result || result.importedGroups.length === 0) return
    setApplying(true)
    try {
      onApply(result.importedGroups, result.productPreviews)
      const productCount = result.productPreviews.filter((p) => p.status === 'importable').length
      setMessage(
        `Importacao aplicada para ${productCount} produto(s) (${result.importedGroups.length} grupo(s)).`
      )
      setMinimized(true)
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
            disabled={loading || freightLoading || products.length === 0}
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
          {result && result.importedGroups.length > 0 && (
            <button
              type="button"
              onClick={() => void handleFreightQuotes()}
              disabled={freightLoading || !fromCep || !toCep}
              title={!fromCep || !toCep ? 'Configure os CEPs em Configurações para usar o Melhor Envios' : undefined}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {freightLoading ? <RefreshCcw size={14} className="animate-spin" /> : <Truck size={14} />}
              {freightLoading ? 'Cotando frete...' : 'Calcular frete Melhor Envios'}
            </button>
          )}
          {result && result.importedGroups.length > 0 && (
            <button
              type="button"
              onClick={() => void handleMsPriceSuggestions()}
              disabled={msLoading}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {msLoading ? <RefreshCcw size={14} className="animate-spin" /> : <Tag size={14} />}
              {msLoading ? 'Buscando sugestão MS...' : 'Buscar sugestão MS'}
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || freightLoading || !result || result.importedGroups.length === 0}
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
          <MetricPill label="Produtos no preview" value={String(totals.total)} tone="neutral" />
          <MetricPill label="Importaveis" value={String(totals.importable)} tone="success" />
          <MetricPill label="Conflito no grupo" value={String(totals.conflict)} tone="warning" />
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

        {freightMessage && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              color: 'var(--accent-primary)',
            }}
          >
            {freightMessage}
          </div>
        )}

        {msMessage && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              color: 'var(--accent-warning)',
            }}
          >
            {msMessage}
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
            Gere um preview para ver quais produtos podem ser sobrescritos com a fee oficial do{' '}
            {CHANNEL_LABELS[channelId] ?? channelId}.
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            {minimized ? (
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-opacity"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  width: 'fit-content',
                }}
              >
                Expandir detalhes do preview
              </button>
            ) : (
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
              >
                <div
                  className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <CheckCircle2 size={14} />
                  Produtos no preview
                  <span className="ml-auto text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {result.productPreviews.length}
                  </span>
                </div>
                {result.productPreviews.length === 0 ? (
                  <div className="px-4 py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Nenhum produto retornado no preview.
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium" style={tableHeaderStyle}>
                            SKU
                          </th>
                          <th className="px-3 py-2 text-left font-medium" style={tableHeaderStyle}>
                            Produto
                          </th>
                          <th className="px-3 py-2 text-left font-medium" style={tableHeaderStyle}>
                            Grupo
                          </th>
                          <th className="px-3 py-2 text-right font-medium" style={tableHeaderStyle}>
                            Comissao
                          </th>
                          <th className="px-3 py-2 text-right font-medium" style={tableHeaderStyle}>
                            Fixo
                          </th>
                          <th className="px-3 py-2 text-right font-medium" style={tableHeaderStyle}>
                            Frete
                          </th>
                          <th className="px-3 py-2 text-right font-medium" style={tableHeaderStyle}>
                            Sugestão MS
                          </th>
                          <th className="px-3 py-2 text-left font-medium" style={tableHeaderStyle}>
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.productPreviews.map((preview, index) => {
                          const statusTone =
                            preview.status === 'importable'
                              ? 'success'
                              : preview.status === 'conflict'
                              ? 'warning'
                              : preview.status === 'missing'
                              ? 'neutral'
                              : 'danger'
                          const hasConflict = conflictGroupIds.has(preview.groupId)
                          return (
                            <tr
                              key={preview.productId}
                              style={{
                                backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                borderBottom: '1px solid var(--border-color)',
                              }}
                            >
                              <td className="px-3 py-2" style={tableCellMono}>
                                {preview.sku}
                              </td>
                              <td className="px-3 py-2" style={tableCell}>
                                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                  {preview.name}
                                </div>
                                <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                  {preview.categoryId ?? 'sem categoria'}
                                </div>
                              </td>
                              <td className="px-3 py-2" style={tableCell}>
                                <div className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                                  {preview.groupName}
                                </div>
                                <div className="text-[10px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
                                  {preview.groupId}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right" style={tableCellMono}>
                                {typeof preview.commissionPercent === 'number'
                                  ? formatPercent(preview.commissionPercent * 100, 1)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right" style={tableCellMono}>
                                {typeof preview.fixedFeeAmount === 'number'
                                  ? formatBRL(preview.fixedFeeAmount)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right" style={tableCellMono}>
                                {typeof preview.freightFixedAmount === 'number'
                                  ? formatBRL(preview.freightFixedAmount)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right" style={tableCellMono}>
                                {typeof msPrices[preview.sku] === 'number'
                                  ? formatBRL(msPrices[preview.sku]!)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2" style={tableCell}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className="rounded-full px-2 py-1 text-[10px]"
                                    style={{
                                      backgroundColor: toneStyles[statusTone].background,
                                      color: toneStyles[statusTone].color,
                                    }}
                                  >
                                    {statusLabel(preview.status)}
                                  </span>
                                  {hasConflict && (
                                    <span
                                      className="rounded-full px-2 py-1 text-[10px]"
                                      style={{
                                        backgroundColor: toneStyles.warning.background,
                                        color: toneStyles.warning.color,
                                      }}
                                    >
                                      Conflito no grupo
                                    </span>
                                  )}
                                  {preview.error && (
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                      {preview.error}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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

const tableHeaderStyle = {
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-dm-sans)',
} as const

const tableCell = {
  borderBottom: '1px solid var(--border-color)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-dm-sans)',
} as const

const tableCellMono = {
  borderBottom: '1px solid var(--border-color)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-jetbrains-mono)',
} as const

function statusLabel(status: MarketplaceCommissionImportProductPreview['status']): string {
  switch (status) {
    case 'importable':
      return 'Importavel'
    case 'conflict':
      return 'Conflito'
    case 'missing':
      return 'Sem resposta'
    default:
      return 'Erro'
  }
}
