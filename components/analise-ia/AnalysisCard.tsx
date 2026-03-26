'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react'
import type { AIAnalysis, Product } from '@/types'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useProductStore } from '@/stores/productStore'
import { formatBRL } from '@/lib/formatters'
import { ViabilityGauge } from './ViabilityGauge'

interface AnalysisCardProps {
  analysis: AIAnalysis
  product: Product
}

const STRATEGY_STYLES: Record<
  AIAnalysis['strategy'],
  { label: string; color: string; bg: string }
> = {
  penetracao: {
    label: 'Penetração',
    color: 'var(--accent-primary)',
    bg: 'rgba(59,130,246,0.15)',
  },
  premium: {
    label: 'Premium',
    color: 'var(--accent-purple)',
    bg: 'rgba(139,92,246,0.15)',
  },
  competitivo: {
    label: 'Competitivo',
    color: 'var(--accent-success)',
    bg: 'rgba(16,185,129,0.15)',
  },
}

export function AnalysisCard({ analysis, product }: AnalysisCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { marketplaces } = useMarketplaceStore()
  const { updateProduct } = useProductStore()

  const strategyStyle = STRATEGY_STYLES[analysis.strategy] ?? STRATEGY_STYLES.competitivo
  const activeMarketplaces = marketplaces.filter((m) => m.active)

  function handleApplySuggestion() {
    const prices = Object.values(analysis.recommendations)
    if (prices.length === 0) return
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length
    updateProduct(product.id, { basePrice: Math.round(avg * 100) / 100 })
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            {product.name}
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            SKU: {product.sku}
          </span>
        </div>
        <span
          className="ml-3 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
          style={{
            color: strategyStyle.color,
            backgroundColor: strategyStyle.bg,
          }}
        >
          {strategyStyle.label}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Price section */}
        {activeMarketplaces.length > 0 && Object.keys(analysis.recommendations).length > 0 && (
          <div>
            <p
              className="text-xs font-medium mb-3 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Preços por Marketplace
            </p>
            <div className="flex flex-col gap-2">
              {activeMarketplaces
                .filter((m) => analysis.recommendations[m.id] !== undefined)
                .map((marketplace) => {
                  const suggested = analysis.recommendations[marketplace.id]
                  const current = product.basePrice
                  const delta = suggested - current
                  const deltaPercent = current > 0 ? (delta / current) * 100 : 0
                  const isIncrease = delta > 0

                  return (
                    <div
                      key={marketplace.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg"
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {marketplace.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs line-through"
                          style={{
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-jetbrains-mono)',
                          }}
                        >
                          {formatBRL(current)}
                        </span>
                        <span
                          className="text-sm font-semibold"
                          style={{
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-jetbrains-mono)',
                          }}
                        >
                          {formatBRL(suggested)}
                        </span>
                        <span
                          className="flex items-center gap-0.5 text-xs font-medium"
                          style={{
                            color: isIncrease
                              ? 'var(--accent-success)'
                              : delta < 0
                              ? 'var(--accent-danger)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {delta !== 0 &&
                            (isIncrease ? (
                              <TrendingUp size={12} />
                            ) : (
                              <TrendingDown size={12} />
                            ))}
                          {delta !== 0 && (
                            <span>
                              {isIncrease ? '+' : ''}
                              {deltaPercent.toFixed(1)}%
                            </span>
                          )}
                          {delta === 0 && <span>—</span>}
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Viability section */}
        {Object.keys(analysis.viability).length > 0 && (
          <div>
            <p
              className="text-xs font-medium mb-3 uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              Viabilidade por Marketplace
            </p>
            <div className="flex flex-col gap-3">
              {activeMarketplaces
                .filter((m) => analysis.viability[m.id] !== undefined)
                .map((marketplace) => (
                  <ViabilityGauge
                    key={marketplace.id}
                    score={analysis.viability[marketplace.id]}
                    marketplaceName={marketplace.name}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Alerts section */}
        {analysis.alerts.length > 0 && (
          <div
            className="rounded-lg p-3 flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} color="var(--accent-warning)" />
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--accent-warning)' }}
              >
                Alertas
              </span>
            </div>
            {analysis.alerts.map((alert, i) => (
              <p
                key={i}
                className="text-xs pl-5"
                style={{ color: 'var(--text-secondary)' }}
              >
                • {alert}
              </p>
            ))}
          </div>
        )}

        {/* Justification */}
        {analysis.justification && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium mb-2 cursor-pointer"
              style={{ color: 'var(--accent-primary)' }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Ocultar justificativa' : 'Ver justificativa'}
            </button>
            {expanded && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {analysis.justification}
              </p>
            )}
          </div>
        )}

        {/* Apply suggestion button */}
        <button
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
          onClick={handleApplySuggestion}
        >
          Aplicar Sugestão
        </button>
      </div>
    </div>
  )
}
