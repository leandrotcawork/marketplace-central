'use client'

import { useMemo } from 'react'
import { calculateMargin, calculateMarginForMarketplace } from '@/lib/calculations'
import { formatBRL, formatPercent } from '@/lib/formatters'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import type { Marketplace, MarketplaceCommissionRule, Product } from '@/types'

interface MarketplaceProductMatrixProps {
  products: Product[]
  marketplace: Marketplace
  rules: MarketplaceCommissionRule[]
}

export function MarketplaceProductMatrix({
  products,
  marketplace,
  rules,
}: MarketplaceProductMatrixProps) {
  const productImportOverrides = useMarketplaceStore((s) => s.productImportOverrides)

  const rows = useMemo(
    () => {
      const channelOverrides = productImportOverrides[marketplace.id] ?? {}
      return products.map((p) => {
        const override = channelOverrides[p.id]
        if (override) {
          if (override.status === 'importable') {
            const base = calculateMargin(
              p.basePrice,
              p.cost,
              override.commissionPercent ?? 0,
              override.fixedFeeAmount ?? 0,
              override.freightFixedAmount ?? 0
            )
            return {
              product: p,
              margin: {
                ...base,
                productId: p.id,
                productGroupId: p.primaryTaxonomyNodeId,
                marketplaceId: marketplace.id,
                sellingPrice: p.basePrice,
                ruleType: 'group_override' as const,
                reviewStatus: 'validated' as const,
              },
              importStatus: 'importable' as const,
            }
          }
          return { product: p, margin: null, importStatus: override.status }
        }
        return {
          product: p,
          margin: calculateMarginForMarketplace(p, marketplace, rules),
          importStatus: null,
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, marketplace, rules, productImportOverrides]
  )

  const avgMargin = useMemo(() => {
    const withMargin = rows.filter((r) => r.margin !== null)
    if (withMargin.length === 0) return null
    return withMargin.reduce((sum, r) => sum + r.margin!.marginPercent, 0) / withMargin.length
  }, [rows])

  return (
    <div
      className="rounded-2xl border"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Produtos no escopo
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Margem calculada com as regras comerciais vigentes deste canal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {rows.length} produto{rows.length !== 1 ? 's' : ''}
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              backgroundColor: avgMargin == null ? 'var(--bg-tertiary)' : 'rgba(59,130,246,0.1)',
              color: avgMargin == null ? 'var(--text-secondary)' : 'var(--accent-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {avgMargin == null
              ? 'Sem produtos selecionados'
              : `Margem media ${formatPercent(avgMargin)}`}
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--accent-warning)' }}
          >
            Base {formatPercent(marketplace.commercialProfile.commissionPercent * 100, 0)} /{' '}
            {formatBRL(marketplace.commercialProfile.fixedFeeAmount)}
          </span>
        </div>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nenhum produto selecionado no escopo. Escolha classificações, grupos ou produtos
          individuais no seletor acima.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Grupo
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Preço base
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Custo
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Comissão
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Frete
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Margem
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium" style={headerStyle}>
                  Preço Sugerido
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, margin, importStatus }, index) => {
                const healthStyle = margin ? healthStyles[margin.health] : null
                const isNotFound = importStatus === 'missing' || importStatus === 'error'
                return (
                  <tr
                    key={product.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      opacity: isNotFound ? 0.55 : 1,
                    }}
                  >
                    <td
                      className="px-4 py-3 align-middle"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {product.sku}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-4 py-3 align-middle"
                      style={{
                        color: 'var(--text-primary)',
                        borderBottom: '1px solid var(--border-color)',
                        fontFamily: 'var(--font-dm-sans)',
                      }}
                    >
                      {product.name}
                    </td>
                    <td
                      className="px-4 py-3 align-middle"
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      <div>
                        <div
                          className="text-xs"
                          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                        >
                          {product.primaryTaxonomyGroupName ?? '—'}
                        </div>
                        {product.primaryTaxonomyNodeId && (
                          <div
                            className="mt-0.5 text-[10px]"
                            style={{
                              color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-jetbrains-mono)',
                            }}
                          >
                            {product.primaryTaxonomyNodeId}
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatBRL(product.basePrice)}
                    </td>
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatBRL(product.cost)}
                    </td>
                    {/* Comissão: R$ + (%) */}
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {margin ? (
                        <>
                          <span style={{ color: 'var(--text-primary)' }}>{formatBRL(margin.commissionAmount)}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '10px', marginLeft: '4px' }}>
                            ({formatPercent(margin.commission * 100, 1)})
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    {/* Frete */}
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        color: margin && margin.freightFixedAmount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {margin ? formatBRL(margin.freightFixedAmount) : '—'}
                    </td>
                    {/* Margem: R$ + (%) */}
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {margin ? (
                        <>
                          <span style={{ color: margin.margin >= 0 ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                            {formatBRL(margin.margin)}
                          </span>
                          <span style={{ color: healthStyle?.color ?? 'var(--text-secondary)', fontSize: '10px', marginLeft: '4px' }}>
                            ({formatPercent(margin.marginPercent)})
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    {/* Preço Sugerido (empty for now) */}
                    <td
                      className="px-4 py-3 text-right align-middle"
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      —
                    </td>
                    <td
                      className="px-4 py-3 align-middle"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      {importStatus === 'missing' ? (
                        <span
                          className="rounded-full px-2 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: 'rgba(156,163,175,0.15)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Não encontrado
                        </span>
                      ) : importStatus === 'error' ? (
                        <span
                          className="rounded-full px-2 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            color: 'var(--accent-danger)',
                          }}
                        >
                          Erro ML
                        </span>
                      ) : importStatus === 'importable' ? (
                        <span
                          className="rounded-full px-2 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: 'rgba(59,130,246,0.12)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          {healthStyle?.label ?? '—'}
                        </span>
                      ) : healthStyle ? (
                        <span
                          className="rounded-full px-2 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: healthStyle.background,
                            color: healthStyle.color,
                          }}
                        >
                          {healthStyle.label}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const headerStyle = {
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-color)',
} as const

const healthStyles = {
  good: {
    background: 'rgba(16,185,129,0.12)',
    color: 'var(--accent-success)',
    label: 'Boa',
  },
  warning: {
    background: 'rgba(245,158,11,0.12)',
    color: 'var(--accent-warning)',
    label: 'Atenção',
  },
  critical: {
    background: 'rgba(239,68,68,0.12)',
    color: 'var(--accent-danger)',
    label: 'Crítica',
  },
} as const
