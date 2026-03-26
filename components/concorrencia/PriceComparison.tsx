'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { formatBRL, formatPercent, formatDate } from '@/lib/formatters'
import type { CompetitorPrice } from '@/types'

interface PriceComparisonProps {
  productId: string
}

function PositioningLabel({ position }: { position: 'cheaper' | 'average' | 'expensive' }) {
  const config = {
    cheaper: { label: 'Mais barato', color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.12)' },
    average: { label: 'Na média', color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.12)' },
    expensive: { label: 'Mais caro', color: 'var(--accent-danger)', bg: 'rgba(239,68,68,0.12)' },
  }
  const c = config[position]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border"
      style={{
        color: c.color,
        backgroundColor: c.bg,
        borderColor: c.color,
        fontFamily: 'var(--font-jetbrains-mono)',
      }}
    >
      {c.label}
    </span>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-1"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span
        className="text-xl font-semibold"
        style={{
          color: color ?? 'var(--text-primary)',
          fontFamily: 'var(--font-jetbrains-mono)',
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

type CustomTooltipProps = {
  active?: boolean
  payload?: Array<{ value: number; name: string; payload: { name: string; price: number; marketplace: string } }>
  label?: string
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0]
  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-primary)',
      }}
    >
      <p className="font-medium mb-1">{entry.payload.name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>
        Marketplace: <span style={{ color: 'var(--text-primary)' }}>{entry.payload.marketplace}</span>
      </p>
      <p style={{ color: 'var(--text-secondary)' }}>
        Preço:{' '}
        <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
          {formatBRL(entry.payload.price)}
        </span>
      </p>
    </div>
  )
}

export function PriceComparison({ productId }: PriceComparisonProps) {
  const product = useProductStore((s) => s.products.find((p) => p.id === productId))
  const marketplaces = useMarketplaceStore((s) => s.marketplaces)
  const competitorPrices = useAnalysisStore((s) => s.competitorPrices)

  const entries: CompetitorPrice[] = useMemo(
    () => competitorPrices.filter((c) => c.productId === productId),
    [competitorPrices, productId]
  )

  const stats = useMemo(() => {
    if (!product || entries.length === 0) return null

    const prices = entries.map((e) => e.price)
    const minPrice = Math.min(...prices)
    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length
    const myPrice = product.basePrice

    let position: 'cheaper' | 'average' | 'expensive'
    const diffFromAvg = ((myPrice - avgPrice) / avgPrice) * 100
    if (diffFromAvg < -5) position = 'cheaper'
    else if (diffFromAvg > 5) position = 'expensive'
    else position = 'average'

    return { minPrice, avgPrice, myPrice, position, diffFromAvg }
  }, [product, entries])

  // Chart data: one bar per competitor entry (deduplicated by competitor+marketplace)
  const chartData = useMemo(() => {
    return entries.map((e) => {
      const mpName = marketplaces.find((m) => m.id === e.marketplace)?.name ?? e.marketplace
      return {
        name: e.competitorName,
        price: e.price,
        marketplace: mpName,
      }
    })
  }, [entries, marketplaces])

  if (!product) return null

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-40 gap-2 rounded-lg border"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-secondary)',
        }}
      >
        <p className="text-sm">Nenhum dado de concorrentes encontrado para este produto.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Seu Preço"
          value={formatBRL(product.basePrice)}
          sub={product.sku}
          color="var(--accent-primary)"
        />
        <SummaryCard
          label="Menor Concorrente"
          value={stats ? formatBRL(stats.minPrice) : '—'}
          sub={
            stats
              ? stats.myPrice <= stats.minPrice
                ? 'Você é o mais barato'
                : `${formatPercent(((stats.minPrice - product.basePrice) / product.basePrice) * 100)} vs. você`
              : undefined
          }
          color="var(--accent-success)"
        />
        <SummaryCard
          label="Preço Médio"
          value={stats ? formatBRL(stats.avgPrice) : '—'}
          sub={
            stats
              ? `${stats.diffFromAvg >= 0 ? '+' : ''}${formatPercent(stats.diffFromAvg)} vs. média`
              : undefined
          }
        />
        <div
          className="rounded-lg border p-4 flex flex-col gap-2 justify-center"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Posicionamento
          </span>
          {stats && <PositioningLabel position={stats.position} />}
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {entries.length} concorrente{entries.length !== 1 ? 's' : ''} encontrado{entries.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div
        className="rounded-lg border p-5"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Comparação de Preços
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 60, bottom: 4, left: 110 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="var(--border-color)"
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              dataKey="price"
              tickFormatter={(v: number) => formatBRL(v)}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono)' }}
              axisLine={{ stroke: 'var(--border-color)' }}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={108}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar
              dataKey="price"
              fill="var(--accent-primary)"
              radius={[0, 4, 4, 0]}
              opacity={0.85}
            />
            {product && (
              <ReferenceLine
                x={product.basePrice}
                stroke="var(--accent-success)"
                strokeDasharray="5 3"
                strokeWidth={2}
                label={{
                  value: 'Seu preço',
                  position: 'insideTopRight',
                  fill: 'var(--accent-success)',
                  fontSize: 11,
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Results table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}
        >
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Detalhes dos Concorrentes
          </h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                {(['Concorrente', 'Marketplace', 'Preço', 'Diferença', 'Data'] as const).map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-medium border-b"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const mpName = marketplaces.find((m) => m.id === entry.marketplace)?.name ?? entry.marketplace
                const isNegativeDiff = entry.diff < 0
                return (
                  <tr
                    key={idx}
                    className="border-b hover:opacity-90 transition-opacity"
                    style={{
                      borderColor: 'var(--border-color)',
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    }}
                  >
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>
                      {entry.competitorName}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                      {mpName}
                    </td>
                    <td
                      className="px-4 py-2.5 font-medium"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatBRL(entry.price)}
                    </td>
                    <td
                      className="px-4 py-2.5 font-medium"
                      style={{
                        color: isNegativeDiff ? 'var(--accent-success)' : 'var(--accent-danger)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {entry.diff >= 0 ? '+' : ''}{formatPercent(entry.diff)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(entry.scrapedAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
