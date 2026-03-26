'use client'

import { useState } from 'react'
import { Bot, AlertCircle, Loader2, CheckSquare, Square, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnalysisCard } from '@/components/analise-ia/AnalysisCard'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { usePackStore } from '@/stores/packStore'
import { calculateAllMargins } from '@/lib/calculations'
import { generateCompetitorData } from '@/lib/mock-competitors'
import type { AIAnalysis } from '@/types'

function normalizeAnalysisResponse(
  raw: Record<string, unknown>,
  productId: string
): AIAnalysis {
  const toNumberMap = (value: unknown): Record<string, number> => {
    if (!value || typeof value !== 'object') return {}
    const result: Record<string, number> = {}
    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
      const parsed =
        typeof rawValue === 'string'
          ? Number(rawValue)
          : rawValue
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        result[key] = parsed
      }
    }
    return result
  }

  // The API route uses a Portuguese prompt that returns recomendacao_preco / viabilidade / etc.
  // but may also return the English field names. Handle both.
  const recommendations = toNumberMap(raw.recommendations ?? raw.recomendacao_preco)

  const rawViability = toNumberMap(raw.viability ?? raw.viabilidade)

  // Viability scores from the API might be 0-100; normalise to 1-10
  const viability: Record<string, number> = {}
  for (const [k, v] of Object.entries(rawViability)) {
    viability[k] = v > 10 ? Math.round((v / 100) * 10 * 10) / 10 : v
  }

  const justification =
    (raw.justification as string | undefined) ??
    (raw.justificativa as string | undefined) ??
    ''

  const rawStrategy =
    (raw.strategy as string | undefined) ??
    (raw.estrategia as string | undefined) ??
    'competitivo'

  const strategy: AIAnalysis['strategy'] = ['penetracao', 'premium', 'competitivo'].includes(
    rawStrategy
  )
    ? (rawStrategy as AIAnalysis['strategy'])
    : 'competitivo'

  const alerts: string[] = Array.isArray(raw.alerts)
    ? (raw.alerts as string[])
    : Array.isArray(raw.alerta)
    ? (raw.alerta as string[])
    : []

  return { productId, recommendations, viability, justification, strategy, alerts }
}

export default function AnaliseIaPage() {
  const allProducts = useProductStore((s) => s.products)
  const { marketplaces } = useMarketplaceStore()
  const { packs } = usePackStore()
  const { competitorPrices, aiAnalyses, addAnalysis } = useAnalysisStore()

  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [apiKeyMissing, setApiKeyMissing] = useState(false)

  // Filter products by selected pack
  const products = selectedPackId
    ? allProducts.filter((p) => {
        const pack = packs.find((pk) => pk.id === selectedPackId)
        return pack?.productIds.includes(p.id)
      })
    : allProducts

  const allSelected = products.length > 0 && selectedIds.size === products.length

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)))
    }
  }

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function analyzeSelected() {
    if (selectedIds.size === 0) return
    setErrorMsg(null)
    setApiKeyMissing(false)

    const toAnalyze = products.filter((p) => selectedIds.has(p.id))

    for (const product of toAnalyze) {
      setLoadingIds((prev) => new Set(prev).add(product.id))

      try {
        const productMargins = calculateAllMargins([product], marketplaces)

        const storedCompetitors = competitorPrices.filter(
          (c) => c.productId === product.id
        )
        const competitors =
          storedCompetitors.length > 0
            ? storedCompetitors
            : generateCompetitorData([product], marketplaces)

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product,
            margins: productMargins,
            competitors,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          if (res.status === 503 || data?.error?.includes('OPENAI_API_KEY')) {
            setApiKeyMissing(true)
            setLoadingIds((prev) => {
              const next = new Set(prev)
              next.delete(product.id)
              return next
            })
            break
          }
          throw new Error(data?.error ?? 'Erro desconhecido')
        }

        const analysis = normalizeAnalysisResponse(data, product.id)
        addAnalysis(analysis)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao analisar produto'
        setErrorMsg(`Erro ao analisar "${product.name}": ${message}`)
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(product.id)
          return next
        })
      }
    }
  }

  const completedAnalyses = aiAnalyses.filter((a) =>
    products.some((p) => p.id === a.productId)
  )

  const isAnalyzing = loadingIds.size > 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Análise com IA"
        subtitle="Recomendações de preços geradas por inteligência artificial"
        actions={
          products.length > 0 ? (
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  selectedIds.size > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: selectedIds.size > 0 ? '#fff' : 'var(--text-secondary)',
                fontFamily: 'var(--font-dm-sans)',
              }}
              disabled={selectedIds.size === 0 || isAnalyzing}
              onClick={analyzeSelected}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Analisando…
                </>
              ) : (
                <>
                  <Bot size={15} />
                  Analisar Selecionados
                  {selectedIds.size > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                    >
                      {selectedIds.size}
                    </span>
                  )}
                </>
              )}
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* Pack Selector */}
        <div className="flex items-center gap-4">
          <label
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Pack:
          </label>
          <select
            value={selectedPackId || ''}
            onChange={(e) => {
              setSelectedPackId(e.target.value || null)
              setSelectedIds(new Set())
            }}
            className="px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Todos os Produtos</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
        </div>

        {/* API key missing banner */}
        {apiKeyMissing && (
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <AlertCircle size={18} color="var(--accent-danger)" className="flex-shrink-0 mt-0.5" />
            <div>
              <p
                className="font-semibold text-sm mb-1"
                style={{ color: 'var(--accent-danger)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Chave OpenAI não configurada
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Para usar a análise com IA, adicione sua chave no arquivo{' '}
                <code
                  className="px-1 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                >
                  .env.local
                </code>{' '}
                na raiz do projeto:
              </p>
              <pre
                className="mt-2 px-3 py-2 rounded text-xs"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--accent-success)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                OPENAI_API_KEY=sk-...
              </pre>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Reinicie o servidor de desenvolvimento após salvar o arquivo.
              </p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {errorMsg && !apiKeyMissing && (
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <AlertCircle size={18} color="var(--accent-danger)" className="flex-shrink-0 mt-0.5" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {errorMsg}
            </p>
          </div>
        )}

        {/* Empty state — no products */}
        {products.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Bot size={32} color="var(--text-secondary)" />
            </div>
            <div className="text-center">
              <p
                className="font-semibold text-base mb-1"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Nenhum produto carregado
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Importe produtos no catálogo antes de usar a análise com IA.
              </p>
            </div>
          </div>
        )}

        {/* Product selection list */}
        {products.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            {/* Select all header */}
            <div
              className="flex items-center gap-3 px-5 py-3 border-b cursor-pointer select-none"
              style={{ borderColor: 'var(--border-color)' }}
              onClick={toggleSelectAll}
            >
              {allSelected ? (
                <CheckCheck size={16} color="var(--accent-primary)" />
              ) : selectedIds.size > 0 ? (
                <CheckSquare size={16} color="var(--accent-primary)" />
              ) : (
                <Square size={16} color="var(--text-secondary)" />
              )}
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'} —{' '}
                {products.length} produto{products.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Product rows */}
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {products.map((product) => {
                const checked = selectedIds.has(product.id)
                const loading = loadingIds.has(product.id)
                const done = aiAnalyses.some((a) => a.productId === product.id)

                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none transition-colors"
                    style={{
                      backgroundColor: checked
                        ? 'rgba(59,130,246,0.06)'
                        : 'transparent',
                    }}
                    onClick={() => !loading && toggleProduct(product.id)}
                  >
                    {loading ? (
                      <Loader2
                        size={16}
                        color="var(--accent-primary)"
                        className="animate-spin flex-shrink-0"
                      />
                    ) : checked ? (
                      <CheckSquare size={16} color="var(--accent-primary)" className="flex-shrink-0" />
                    ) : (
                      <Square size={16} color="var(--text-secondary)" className="flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm truncate block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {product.name}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {product.sku} · {product.category}
                      </span>
                    </div>
                    {done && !loading && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          color: 'var(--accent-success)',
                          backgroundColor: 'rgba(16,185,129,0.12)',
                        }}
                      >
                        Analisado
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Analysis results */}
        {completedAnalyses.length > 0 && (
          <div>
            <h2
              className="text-sm font-semibold mb-4"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Resultados da Análise ({completedAnalyses.length})
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {completedAnalyses.map((analysis) => {
                const product = products.find((p) => p.id === analysis.productId)
                if (!product) return null
                return (
                  <AnalysisCard
                    key={analysis.productId}
                    analysis={analysis}
                    product={product}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Empty results state when products exist but none analyzed yet */}
        {products.length > 0 && completedAnalyses.length === 0 && !isAnalyzing && (
          <div
            className="rounded-xl border p-12 flex flex-col items-center gap-4"
            style={{
              borderColor: 'var(--border-color)',
              borderStyle: 'dashed',
            }}
          >
            <Bot size={36} color="var(--text-secondary)" />
            <p
              className="text-sm text-center"
              style={{ color: 'var(--text-secondary)' }}
            >
              Selecione produtos acima e clique em{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                Analisar Selecionados
              </strong>{' '}
              para obter recomendações de preço.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
