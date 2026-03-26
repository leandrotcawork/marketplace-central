'use client'

import { formatBRL, formatPercent } from '@/lib/formatters'
import { getCommercialReviewColor } from '@/lib/marketplace-commercial'
import type {
  Marketplace,
  MarketplaceCommissionRule,
  MarketplaceReviewStatus,
  MarketplaceRuleSourceType,
  MarketplaceRuleType,
} from '@/types'

interface MarketplaceCommercialMatrixProps {
  marketplace: Marketplace
  rules: MarketplaceCommissionRule[]
  averageMargin?: number | null
  onRuleChange: (id: string, partial: Partial<MarketplaceCommissionRule>) => void
}

const sourceTypeLabels: Record<MarketplaceRuleSourceType, string> = {
  official_doc: 'Doc oficial',
  seller_portal: 'Portal seller',
  contract: 'Contrato',
  manual_assumption: 'Manual',
  pending_doc: 'Pendente',
}

const reviewLabels: Record<MarketplaceReviewStatus, string> = {
  validated: 'Validado',
  manual_assumption: 'Manual',
  missing: 'Faltando',
}

function parseCurrency(value: string): number {
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function patchRule(
  rule: MarketplaceCommissionRule,
  onRuleChange: (id: string, partial: Partial<MarketplaceCommissionRule>) => void,
  partial: Partial<MarketplaceCommissionRule>,
  numericOverride = false
) {
  const shouldPromoteOverride = numericOverride && rule.ruleType === 'base'

  onRuleChange(rule.id, {
    ...(shouldPromoteOverride ? { ruleType: 'group_override' as MarketplaceRuleType } : {}),
    ...partial,
  })
}

export function MarketplaceCommercialMatrix({
  marketplace,
  rules,
  averageMargin,
  onRuleChange,
}: MarketplaceCommercialMatrixProps) {
  return (
    <div
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Matriz comercial por grupo
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Precedencia: excecao por grupo, depois base do canal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {rules.length} grupos no escopo
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              backgroundColor: averageMargin == null ? 'var(--bg-tertiary)' : 'rgba(59,130,246,0.1)',
              color: averageMargin == null ? 'var(--text-secondary)' : 'var(--accent-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {averageMargin == null ? 'Sem impacto calculado' : `Margem media ${formatPercent(averageMargin)}`}
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              backgroundColor: 'rgba(245,158,11,0.12)',
              color: 'var(--accent-warning)',
            }}
          >
            Base {formatPercent(marketplace.commercialProfile.commissionPercent * 100, 0)} /{' '}
            {formatBRL(marketplace.commercialProfile.fixedFeeAmount)}
          </span>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="px-5 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nenhum grupo foi puxado para o escopo comercial ainda. Crie classificacoes com produtos
          vinculados para materializar a matriz deste canal.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Grupo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Categoria
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Regra
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Comissao
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Taxa fixa
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Frete fixo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Revisao
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Origem
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={headerStyle}>
                  Referencia
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr
                  key={rule.id}
                  style={{
                    backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <div>
                      <p style={{ color: 'var(--text-primary)' }}>{rule.groupName}</p>
                      <p
                        className="mt-1 text-xs"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                      >
                        {rule.groupId}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <span style={{ color: 'var(--text-secondary)' }}>{rule.categoryLabel}</span>
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <select
                      value={rule.ruleType}
                      onChange={(event) =>
                        onRuleChange(rule.id, {
                          ruleType: event.target.value as MarketplaceRuleType,
                        })
                      }
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      style={inputStyle}
                    >
                      <option value="base">Base</option>
                      <option value="group_override">Excecao</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <input
                      type="number"
                      step="0.1"
                      value={(rule.commissionPercent * 100).toFixed(1)}
                      onChange={(event) =>
                        patchRule(rule, onRuleChange, {
                          commissionPercent: parseCurrency(event.target.value) / 100,
                        }, true)
                      }
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <input
                      type="number"
                      step="0.01"
                      value={rule.fixedFeeAmount.toFixed(2)}
                      onChange={(event) =>
                        patchRule(rule, onRuleChange, {
                          fixedFeeAmount: parseCurrency(event.target.value),
                        }, true)
                      }
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <input
                      type="number"
                      step="0.01"
                      value={rule.freightFixedAmount.toFixed(2)}
                      onChange={(event) =>
                        patchRule(rule, onRuleChange, {
                          freightFixedAmount: parseCurrency(event.target.value),
                        }, true)
                      }
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <div className="flex flex-col gap-2">
                      <select
                        value={rule.reviewStatus}
                        onChange={(event) =>
                          onRuleChange(rule.id, {
                            reviewStatus: event.target.value as MarketplaceReviewStatus,
                          })
                        }
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={inputStyle}
                      >
                        <option value="validated">Validado</option>
                        <option value="manual_assumption">Manual</option>
                        <option value="missing">Faltando</option>
                      </select>
                      <span
                        className="rounded-full px-2 py-1 text-[11px]"
                        style={{
                          backgroundColor: `${getCommercialReviewColor(rule.reviewStatus)}20`,
                          color: getCommercialReviewColor(rule.reviewStatus),
                        }}
                      >
                        {reviewLabels[rule.reviewStatus]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <select
                      value={rule.sourceType}
                      onChange={(event) =>
                        onRuleChange(rule.id, {
                          sourceType: event.target.value as MarketplaceRuleSourceType,
                        })
                      }
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      style={inputStyle}
                    >
                      <option value="official_doc">Doc oficial</option>
                      <option value="seller_portal">Portal seller</option>
                      <option value="contract">Contrato</option>
                      <option value="manual_assumption">Manual</option>
                      <option value="pending_doc">Pendente</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top" style={cellStyle}>
                    <div className="flex flex-col gap-2">
                      <input
                        value={rule.sourceRef ?? ''}
                        onChange={(event) =>
                          onRuleChange(rule.id, { sourceRef: event.target.value })
                        }
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={inputStyle}
                        placeholder={sourceTypeLabels[rule.sourceType]}
                      />
                      <input
                        type="date"
                        value={rule.evidenceDate?.slice(0, 10) ?? ''}
                        onChange={(event) =>
                          onRuleChange(rule.id, { evidenceDate: event.target.value || undefined })
                        }
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={inputStyle}
                      />
                    </div>
                  </td>
                </tr>
              ))}
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

const cellStyle = {
  borderBottom: '1px solid var(--border-color)',
} as const

const inputStyle = {
  borderColor: 'var(--border-color)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
} as const
