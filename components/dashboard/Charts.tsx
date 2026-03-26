'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import type { MarginResult, AIAnalysis, Product, Marketplace } from '@/types'
import { formatPercent } from '@/lib/formatters'

// ——— Shared tooltip style ———
const tooltipStyle = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontFamily: 'var(--font-jetbrains-mono)',
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      {label && (
        <p className="mb-1 font-medium" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', fontSize: 11 }}>
          {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <p key={i} style={{ color: 'var(--text-primary)' }}>
          {entry.name ? `${entry.name}: ` : ''}
          {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          {entry.name === 'margem' || entry.name === 'margin' ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { x: number; y: number; name: string } }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="mb-1 font-medium" style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--text-secondary)', fontSize: 11 }}>
        {d.name}
      </p>
      <p>Margem: {d.x.toFixed(1)}%</p>
      <p>Estoque: {d.y}</p>
    </div>
  )
}

// ——— 1. Bar chart: avg margin per marketplace ———
interface MarginBarChartProps {
  allMargins: MarginResult[]
  marketplaces: Marketplace[]
}

export function MarginBarChart({ allMargins, marketplaces }: MarginBarChartProps) {
  const data = marketplaces
    .filter((m) => m.active)
    .map((m) => {
      const rows = allMargins.filter((r) => r.marketplaceId === m.id)
      const avg =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.marginPercent, 0) / rows.length
          : 0
      return { name: m.name.split(' ')[0], margin: Math.round(avg * 10) / 10 }
    })

  if (data.length === 0) {
    return <ChartEmptyState message="Nenhuma margem calculada" />
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <p
        className="text-sm font-semibold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Margem Média por Marketplace
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="margin" name="margem" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.margin >= 20
                    ? 'var(--accent-success)'
                    : entry.margin >= 10
                    ? 'var(--accent-warning)'
                    : 'var(--accent-danger)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ——— 2. Scatter: margin % vs stock ———
interface MarginStockScatterProps {
  allMargins: MarginResult[]
  products: Product[]
}

export function MarginStockScatter({ allMargins, products }: MarginStockScatterProps) {
  const data = products.map((product) => {
    const margins = allMargins.filter((r) => r.productId === product.id)
    const avgMargin =
      margins.length > 0
        ? margins.reduce((s, r) => s + r.marginPercent, 0) / margins.length
        : 0
    return { x: Math.round(avgMargin * 10) / 10, y: product.stock, name: product.name }
  })

  if (data.length === 0) {
    return <ChartEmptyState message="Sem dados de margem e estoque" />
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <p
        className="text-sm font-semibold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Margem vs Estoque
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <XAxis
            dataKey="x"
            name="margin"
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            label={{
              value: 'Margem %',
              position: 'insideBottom',
              offset: -2,
              fill: 'var(--text-secondary)',
              fontSize: 10,
            }}
          />
          <YAxis
            dataKey="y"
            name="stock"
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill="var(--accent-primary)" opacity={0.8} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

// ——— 3. Pie: products by AI strategy ———
interface StrategyPieProps {
  aiAnalyses: AIAnalysis[]
}

const STRATEGY_COLORS: Record<string, string> = {
  premium: 'var(--accent-purple)',
  competitivo: 'var(--accent-success)',
  penetracao: 'var(--accent-primary)',
}

const STRATEGY_LABELS: Record<string, string> = {
  premium: 'Premium',
  competitivo: 'Competitivo',
  penetracao: 'Penetração',
}

export function StrategyPieChart({ aiAnalyses }: StrategyPieProps) {
  if (aiAnalyses.length === 0) {
    return (
      <div
        className="rounded-xl border p-5 flex flex-col"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <p
          className="text-sm font-semibold mb-4"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Estratégias de IA
        </p>
        <div className="flex-1 flex items-center justify-center py-10">
          <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Execute análise de IA para ver estratégias recomendadas
          </p>
        </div>
      </div>
    )
  }

  const counts: Record<string, number> = {}
  for (const a of aiAnalyses) {
    counts[a.strategy] = (counts[a.strategy] ?? 0) + 1
  }

  const data = Object.entries(counts).map(([strategy, value]) => ({
    name: STRATEGY_LABELS[strategy] ?? strategy,
    strategy,
    value,
  }))

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <p
        className="text-sm font-semibold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Estratégias de IA
      </p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="60%" height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={STRATEGY_COLORS[entry.strategy] ?? 'var(--accent-primary)'}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2">
          {data.map((entry) => (
            <div key={entry.strategy} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{
                  backgroundColor:
                    STRATEGY_COLORS[entry.strategy] ?? 'var(--accent-primary)',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {entry.name}
              </span>
              <span
                className="text-xs font-semibold ml-auto pl-2"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ——— 4. Heatmap: products × marketplaces ———
const HEALTH_COLORS = {
  good: 'var(--accent-success)',
  warning: 'var(--accent-warning)',
  critical: 'var(--accent-danger)',
  empty: 'var(--bg-tertiary)',
}

const HEALTH_BG = {
  good: 'rgba(16,185,129,0.2)',
  warning: 'rgba(245,158,11,0.2)',
  critical: 'rgba(239,68,68,0.2)',
  empty: 'var(--bg-tertiary)',
}

interface MarginHeatmapProps {
  allMargins: MarginResult[]
  products: Product[]
  marketplaces: Marketplace[]
}

export function MarginHeatmap({ allMargins, products, marketplaces }: MarginHeatmapProps) {
  const activeMarketplaces = marketplaces.filter((m) => m.active)
  const displayProducts = products.slice(0, 10)

  if (displayProducts.length === 0 || activeMarketplaces.length === 0) {
    return <ChartEmptyState message="Sem dados para o heatmap" />
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <p
        className="text-sm font-semibold mb-4"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
      >
        Heatmap: Margem por Produto × Marketplace
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 400 }}>
          <thead>
            <tr>
              <th
                className="text-left pb-2 pr-3"
                style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
              >
                Produto
              </th>
              {activeMarketplaces.map((m) => (
                <th
                  key={m.id}
                  className="pb-2 px-1 text-center"
                  style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
                >
                  {m.name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayProducts.map((product) => (
              <tr key={product.id}>
                <td
                  className="py-1 pr-3 text-xs truncate"
                  style={{ color: 'var(--text-primary)', maxWidth: 160 }}
                >
                  {product.name.length > 22
                    ? product.name.slice(0, 22) + '…'
                    : product.name}
                </td>
                {activeMarketplaces.map((marketplace) => {
                  const result = allMargins.find(
                    (r) =>
                      r.productId === product.id &&
                      r.marketplaceId === marketplace.id
                  )
                  const health = result?.health ?? 'empty'
                  const marginText = result
                    ? formatPercent(result.marginPercent, 0)
                    : '—'

                  return (
                    <td key={marketplace.id} className="py-1 px-1 text-center">
                      <div
                        className="mx-auto w-12 h-7 rounded flex items-center justify-center text-xs font-medium"
                        style={{
                          backgroundColor:
                            health === 'empty'
                              ? HEALTH_BG.empty
                              : HEALTH_BG[health as keyof typeof HEALTH_BG],
                          color:
                            health === 'empty'
                              ? 'var(--text-secondary)'
                              : HEALTH_COLORS[health as keyof typeof HEALTH_COLORS],
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: 11,
                        }}
                        title={`${product.name} × ${marketplace.name}: ${marginText}`}
                      >
                        {marginText}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        {(['good', 'warning', 'critical'] as const).map((h) => (
          <div key={h} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: HEALTH_BG[h] }}
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {h === 'good' ? '≥20%' : h === 'warning' ? '10–20%' : '<10%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ——— Shared empty state ———
function ChartEmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border p-8 flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
    </div>
  )
}
