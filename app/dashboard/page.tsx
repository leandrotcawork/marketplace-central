'use client'

import { useMemo } from 'react'
import {
  Package,
  TrendingUp,
  Star,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { KPICard } from '@/components/dashboard/KPICard'
import {
  MarginBarChart,
  MarginStockScatter,
  StrategyPieChart,
  MarginHeatmap,
} from '@/components/dashboard/Charts'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { calculateAllMargins } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'

export default function DashboardPage() {
  const { products } = useProductStore()
  const { marketplaces, commissionRules } = useMarketplaceStore()
  const { aiAnalyses } = useAnalysisStore()

  const activeMarketplaces = useMemo(
    () => marketplaces.filter((m) => m.active),
    [marketplaces]
  )
  const allMargins = useMemo(
    () => calculateAllMargins(products, marketplaces, commissionRules),
    [products, marketplaces, commissionRules]
  )

  // ——— KPI: average margin ———
  const avgMargin = useMemo(
    () =>
      allMargins.length > 0
        ? allMargins.reduce((s, r) => s + r.marginPercent, 0) / allMargins.length
        : 0,
    [allMargins]
  )

  // ——— KPI: best marketplace ———
  const marketplaceAvgMargins = useMemo(
    () =>
      activeMarketplaces.map((m) => {
        const rows = allMargins.filter((r) => r.marketplaceId === m.id)
        const avg =
          rows.length > 0 ? rows.reduce((s, r) => s + r.marginPercent, 0) / rows.length : 0
        return { marketplace: m, avg }
      }),
    [activeMarketplaces, allMargins]
  )
  const bestMarketplace = useMemo(
    () =>
      marketplaceAvgMargins.length > 0
        ? marketplaceAvgMargins.reduce((best, cur) => (cur.avg > best.avg ? cur : best))
        : null,
    [marketplaceAvgMargins]
  )

  // ——— KPI: at-risk products (any active marketplace with margin < 10%) ———
  const atRiskProductIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of allMargins) {
      if (r.marginPercent < 10) ids.add(r.productId)
    }
    return ids
  }, [allMargins])

  // ——— KPI: AI opportunities (recommended price > current by >5%) ———
  const aiOpportunities = useMemo(
    () =>
      aiAnalyses.filter((a) => {
        const product = products.find((p) => p.id === a.productId)
        if (!product) return false
        const recs = Object.values(a.recommendations)
        if (recs.length === 0) return false
        const avgRec = recs.reduce((s, v) => s + v, 0) / recs.length
        return avgRec > product.basePrice * 1.05
      }),
    [aiAnalyses, products]
  )

  // ——— Opportunities table ———
  interface OpportunityRow {
    productId: string
    name: string
    currentPrice: number
    aiAvgPrice: number
    delta: number
    deltaPercent: number
    bestMarketplaceName: string
  }

  const opportunityRows: OpportunityRow[] = useMemo(
    () =>
      products
        .map((product) => {
          const analysis = aiAnalyses.find((a) => a.productId === product.id)
          if (!analysis) return null

          const recs = Object.entries(analysis.recommendations)
          if (recs.length === 0) return null

          const aiAvgPrice =
            recs.reduce((s, [, v]) => s + v, 0) / recs.length

          const delta = aiAvgPrice - product.basePrice
          const deltaPercent =
            product.basePrice > 0 ? (delta / product.basePrice) * 100 : 0

          // Best marketplace = highest viability score
          const viabilityEntries = Object.entries(analysis.viability)
          const bestMp =
            viabilityEntries.length > 0
              ? viabilityEntries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
              : null
          const bestMpName = bestMp
            ? (marketplaces.find((m) => m.id === bestMp[0])?.name ?? bestMp[0])
            : '—'

          return {
            productId: product.id,
            name: product.name,
            currentPrice: product.basePrice,
            aiAvgPrice: Math.round(aiAvgPrice * 100) / 100,
            delta: Math.round(delta * 100) / 100,
            deltaPercent: Math.round(deltaPercent * 10) / 10,
            bestMarketplaceName: bestMpName,
          } satisfies OpportunityRow
        })
        .filter((r): r is OpportunityRow => r !== null)
        .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent))
        .slice(0, 10),
    [products, aiAnalyses, marketplaces]
  )

  const hasData = products.length > 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral de performance por marketplace"
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {/* Empty state */}
        {!hasData && (
          <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <TrendingUp size={32} color="var(--text-secondary)" />
            </div>
            <div className="text-center">
              <p
                className="font-semibold text-base mb-1"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Sem dados ainda
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Importe produtos e configure marketplaces para ver o dashboard.
              </p>
            </div>
          </div>
        )}

        {hasData && (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <KPICard
                title="Total de Produtos"
                value={products.length}
                subtitle={`${activeMarketplaces.length} marketplace${activeMarketplaces.length !== 1 ? 's' : ''} ativo${activeMarketplaces.length !== 1 ? 's' : ''}`}
                icon={Package}
                trend="neutral"
                accentColor="var(--accent-primary)"
              />
              <KPICard
                title="Margem Média"
                value={formatPercent(avgMargin)}
                subtitle="Todos os marketplaces"
                icon={TrendingUp}
                trend={avgMargin >= 20 ? 'up' : avgMargin >= 10 ? 'neutral' : 'down'}
                accentColor={
                  avgMargin >= 20
                    ? 'var(--accent-success)'
                    : avgMargin >= 10
                    ? 'var(--accent-warning)'
                    : 'var(--accent-danger)'
                }
              />
              <KPICard
                title="Melhor Marketplace"
                value={bestMarketplace?.marketplace.name.split(' ')[0] ?? '—'}
                subtitle={
                  bestMarketplace
                    ? `Margem média ${formatPercent(bestMarketplace.avg)}`
                    : 'Sem dados'
                }
                icon={Star}
                trend="up"
                accentColor="var(--accent-warning)"
              />
              <KPICard
                title="Produtos em Risco"
                value={atRiskProductIds.size}
                subtitle="Com margem abaixo de 10%"
                icon={AlertTriangle}
                trend={atRiskProductIds.size === 0 ? 'up' : 'down'}
                accentColor={
                  atRiskProductIds.size === 0
                    ? 'var(--accent-success)'
                    : 'var(--accent-danger)'
                }
              />
              <KPICard
                title="Oportunidades IA"
                value={aiOpportunities.length}
                subtitle="Preço sugerido >5% acima do atual"
                icon={Sparkles}
                trend={aiOpportunities.length > 0 ? 'up' : 'neutral'}
                accentColor="var(--accent-purple)"
              />
            </div>

            {/* Charts grid */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MarginBarChart allMargins={allMargins} marketplaces={marketplaces} />
              <MarginStockScatter allMargins={allMargins} products={products} />
              <StrategyPieChart aiAnalyses={aiAnalyses} />
              <MarginHeatmap
                allMargins={allMargins}
                products={products}
                marketplaces={marketplaces}
              />
            </div>

            {/* Opportunities table */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div
                className="px-5 py-4 border-b"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <h2
                  className="text-sm font-semibold"
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-dm-sans)',
                  }}
                >
                  Top Oportunidades
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Produtos com maior diferença entre preço atual e sugestão de IA
                </p>
              </div>

              {opportunityRows.length === 0 ? (
                <div className="px-5 py-10 flex items-center justify-center">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Execute análise de IA para ver oportunidades de precificação.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr
                        className="border-b"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        {[
                          'Produto',
                          'Preço Atual',
                          'Sugestão IA',
                          'Delta',
                          'Melhor Marketplace',
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {opportunityRows.map((row, i) => {
                        const isUp = row.delta > 0
                        const isDown = row.delta < 0

                        return (
                          <tr
                            key={row.productId}
                            className="border-b transition-colors"
                            style={{
                              borderColor: 'var(--border-color)',
                              backgroundColor:
                                i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                            }}
                          >
                            <td className="px-5 py-3">
                              <span
                                className="text-sm font-medium"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {row.name}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className="text-sm"
                                style={{
                                  color: 'var(--text-primary)',
                                  fontFamily: 'var(--font-jetbrains-mono)',
                                }}
                              >
                                {formatBRL(row.currentPrice)}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className="text-sm font-semibold"
                                style={{
                                  color: 'var(--text-primary)',
                                  fontFamily: 'var(--font-jetbrains-mono)',
                                }}
                              >
                                {formatBRL(row.aiAvgPrice)}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                {isUp && (
                                  <ArrowUpRight
                                    size={14}
                                    color="var(--accent-success)"
                                  />
                                )}
                                {isDown && (
                                  <ArrowDownRight
                                    size={14}
                                    color="var(--accent-danger)"
                                  />
                                )}
                                {!isUp && !isDown && (
                                  <Minus size={14} color="var(--text-secondary)" />
                                )}
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color: isUp
                                      ? 'var(--accent-success)'
                                      : isDown
                                      ? 'var(--accent-danger)'
                                      : 'var(--text-secondary)',
                                    fontFamily: 'var(--font-jetbrains-mono)',
                                  }}
                                >
                                  {isUp ? '+' : ''}
                                  {formatBRL(row.delta)} ({isUp ? '+' : ''}
                                  {row.deltaPercent.toFixed(1)}%)
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className="text-xs px-2 py-1 rounded-full"
                                style={{
                                  color: 'var(--accent-primary)',
                                  backgroundColor: 'rgba(59,130,246,0.12)',
                                }}
                              >
                                {row.bestMarketplaceName}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
