'use client'

import { useEffect, useState } from 'react'
import type {
  FreightRule,
  Marketplace,
  MarketplaceShippingPolicy,
  MarketplaceShippingProvider,
  MarketplaceScopedGroup,
} from '@/types'

interface MarketplaceShippingPolicyPanelProps {
  marketplace: Marketplace
  scopedGroups: MarketplaceScopedGroup[]
  onUpdate: (policy: MarketplaceShippingPolicy) => void
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return digits
}

const PROVIDER_OPTIONS: { value: MarketplaceShippingProvider; label: string; description: string }[] = [
  { value: 'melhor-envio', label: 'Melhor Envios', description: 'Cota��o via integra��o ME' },
  { value: 'fixed', label: 'Valor fixo', description: 'Definir frete fixo por grupo manualmente' },
  { value: 'marketplace', label: 'Incluso pelo marketplace', description: 'Marketplace absorve o frete no contrato' },
]

export function MarketplaceShippingPolicyPanel({
  marketplace,
  scopedGroups,
  onUpdate,
}: MarketplaceShippingPolicyPanelProps) {
  const existing = marketplace.shippingPolicy

  const [provider, setProvider] = useState<MarketplaceShippingProvider>(
    existing?.provider ?? 'fixed'
  )
  const [fromCep, setFromCep] = useState(existing?.fromCep ?? '')
  const [toCep, setToCep] = useState(existing?.toCep ?? '')
  const [ruleAmounts, setRuleAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const group of scopedGroups) {
      const existing_rule = existing?.rules.find((r) => r.groupId === group.id)
      init[group.id] = existing_rule ? String(existing_rule.fixedAmount) : ''
    }
    return init
  })
  const [saved, setSaved] = useState(false)

  // Re-sync if marketplace changes
  useEffect(() => {
    const p = marketplace.shippingPolicy
    setProvider(p?.provider ?? 'fixed')
    setFromCep(p?.fromCep ?? '')
    setToCep(p?.toCep ?? '')
    setRuleAmounts(() => {
      const init: Record<string, string> = {}
      for (const group of scopedGroups) {
        const rule = p?.rules.find((r) => r.groupId === group.id)
        init[group.id] = rule ? String(rule.fixedAmount) : ''
      }
      return init
    })
    setSaved(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace.id])

  function handleSave() {
    const rules: FreightRule[] = scopedGroups
      .filter((g) => ruleAmounts[g.id] !== '' && !isNaN(Number(ruleAmounts[g.id])))
      .map((g) => ({
        groupId: g.id,
        fixedAmount: Number(ruleAmounts[g.id]),
      }))

    const policy: MarketplaceShippingPolicy = {
      provider,
      fromCep: provider !== 'marketplace' ? fromCep : undefined,
      toCep: provider !== 'marketplace' ? toCep : undefined,
      rules: provider !== 'marketplace' ? rules : [],
    }

    onUpdate(policy)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const showFreightConfig = provider !== 'marketplace'

  return (
    <div
      className="rounded-2xl border p-6 flex flex-col gap-6"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Provider selector */}
      <div className="flex flex-col gap-3">
        <label
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Provedor de frete
        </label>
        <div className="flex flex-col gap-2">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setProvider(opt.value)}
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all"
              style={{
                backgroundColor:
                  provider === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                border: `1px solid ${
                  provider === opt.value ? 'rgba(99,102,241,0.3)' : 'var(--border-color)'
                }`,
              }}
            >
              <span
                className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                style={{
                  borderColor:
                    provider === opt.value ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                {provider === opt.value && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  {opt.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {opt.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Marketplace note */}
      {!showFreightConfig && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.15)',
            color: 'var(--text-secondary)',
          }}
        >
          O marketplace inclui o frete no contrato — nenhum custo adicional � calculado.
        </div>
      )}

      {/* CEP config + rules table */}
      {showFreightConfig && (
        <>
          {/* CEP inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                CEP de Origem (armaz�m)
              </label>
              <input
                type="text"
                placeholder="00000-000"
                value={fromCep}
                onChange={(e) => setFromCep(formatCep(e.target.value))}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                CEP de Destino (simula��o)
              </label>
              <input
                type="text"
                placeholder="00000-000"
                value={toCep}
                onChange={(e) => setToCep(formatCep(e.target.value))}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              />
            </div>
          </div>

          {/* Per-group freight amounts */}
          {scopedGroups.length > 0 ? (
            <div className="flex flex-col gap-3">
              <label
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Frete por grupo de produtos
              </label>
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                      <th
                        className="px-4 py-2 text-left font-medium"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
                      >
                        Grupo
                      </th>
                      <th
                        className="px-4 py-2 text-right font-medium w-40"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
                      >
                        Frete (R$)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedGroups.map((group, index) => (
                      <tr
                        key={group.id}
                        style={{
                          borderBottom:
                            index < scopedGroups.length - 1
                              ? '1px solid var(--border-color)'
                              : undefined,
                        }}
                      >
                        <td
                          className="px-4 py-2"
                          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                        >
                          {group.name}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>R$</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="0,00"
                              value={ruleAmounts[group.id] ?? ''}
                              onChange={(e) =>
                                setRuleAmounts((prev) => ({
                                  ...prev,
                                  [group.id]: e.target.value,
                                }))
                              }
                              className="rounded-lg px-2 py-1 text-sm outline-none text-right w-28"
                              style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-jetbrains-mono)',
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhum grupo configurado. Importe comiss�es na aba Matriz comercial para criar grupos.
            </p>
          )}
        </>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          Salvar pol�tica de frete
        </button>
        {saved && (
          <span className="text-sm" style={{ color: 'var(--accent-success)' }}>
            Salvo!
          </span>
        )}
      </div>
    </div>
  )
}
