'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCcw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarketplaceBaseForm } from '@/components/marketplaces/MarketplaceBaseForm'
import { MarketplaceCard } from '@/components/marketplaces/MarketplaceCard'
import { MarketplaceProductMatrix } from '@/components/marketplaces/MarketplaceProductMatrix'
import { MarketplaceCommissionImportPanel } from '@/components/marketplaces/MarketplaceCommissionImportPanel'
import { MarketplaceConnectionForm } from '@/components/marketplaces/MarketplaceConnectionForm'
import { MarketplaceProductScopeSelector } from '@/components/marketplaces/MarketplaceProductScopeSelector'
import { useMarketplaceCommissionScope } from '@/hooks/useMarketplaceCommissionScope'
import { calculateMarginForMarketplace } from '@/lib/calculations'
import {
  getMarketplaceCompleteness,
  getMarketplaceScopedRules,
} from '@/lib/marketplace-commercial'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useProductStore } from '@/stores/productStore'
import type { MarketplaceConnection, Product } from '@/types'

export default function MarketplacesPage() {
  const products = useProductStore((state) => state.products)
  const {
    marketplaces,
    commissionRules,
    selectedMarketplaceId,
    setSelectedMarketplace,
    toggleActive,
    updateMarketplaceCommercialProfile,
    updateMarketplaceCapabilities,
    updateCommissionRule,
    applyCommissionImport,
    applyProductCommissionImport,
    addMarketplace,
    resetDefaults,
    syncConnectionStatuses,
  } = useMarketplaceStore()

  const { classifications, groups, scopedGroups, groupsLoading, groupsError } = useMarketplaceCommissionScope()

  const [connections, setConnections] = useState<MarketplaceConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'config' | 'connection' | 'matrix'>('config')

  useEffect(() => {
    if (!selectedMarketplaceId && marketplaces[0]) {
      setSelectedMarketplace(marketplaces[0].id)
    }
  }, [marketplaces, selectedMarketplaceId, setSelectedMarketplace])

  useEffect(() => {
    let active = true

    async function loadConnections() {
      setLoadingConnections(true)
      setErrorMessage(null)

      try {
        const response = await fetch('/api/marketplace-connections')
        const payload = await response.json()

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? 'Falha ao carregar conexoes')
        }

        if (!active) return
        const nextConnections = payload.data as MarketplaceConnection[]
        setConnections(nextConnections)
        syncConnectionStatuses(nextConnections)
      } catch (error) {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar conexoes')
      } finally {
        if (active) setLoadingConnections(false)
      }
    }

    void loadConnections()

    return () => {
      active = false
    }
  }, [syncConnectionStatuses])

  const averageMarginByMarketplace = useMemo(() => {
    const result = new Map<string, number | null>()

    for (const marketplace of marketplaces) {
      if (products.length === 0) {
        result.set(marketplace.id, null)
        continue
      }

      const rows = products.map((product) =>
        calculateMarginForMarketplace(product, marketplace, commissionRules)
      )
      const average =
        rows.reduce((sum, row) => sum + row.marginPercent, 0) / Math.max(rows.length, 1)
      result.set(marketplace.id, average)
    }

    return result
  }, [commissionRules, marketplaces, products])

  const selectedMarketplace =
    marketplaces.find((marketplace) => marketplace.id === selectedMarketplaceId) ?? marketplaces[0]

  const selectedCompleteness = selectedMarketplace
    ? getMarketplaceCompleteness(selectedMarketplace.id, scopedGroups, commissionRules)
    : { total: 0, validated: 0, manualAssumption: 0, missing: 0 }

  const selectedRules = selectedMarketplace
    ? getMarketplaceScopedRules(selectedMarketplace.id, scopedGroups, commissionRules)
    : []

  const scopedProducts = useMemo(() => {
    if (classifications.length === 0 || products.length === 0) return []

    const scopedProductIds = new Set(
      classifications.flatMap((classification) => classification.productIds)
    )

    return products.filter(
      (product) => scopedProductIds.has(product.id) && Boolean(product.primaryTaxonomyNodeId)
    )
  }, [classifications, products])

  // Products actually sent to the commission import — controlled by the scope selector
  const [importScopeProducts, setImportScopeProducts] = useState<Product[]>([])

  const selectedConnection = selectedMarketplace
    ? connections.find((connection) => connection.channelId === selectedMarketplace.id)
    : undefined

  async function handleSaveConnection(payload: {
    channelId: string
    displayName: string
    accountId?: string
    authStrategy: MarketplaceConnection['authStrategy']
    status: MarketplaceConnection['status']
    lastValidatedAt?: string
    lastError?: string
    secrets?: Record<string, string>
  }) {
    setSavingChannelId(payload.channelId)
    setFeedback(null)
    setErrorMessage(null)

    try {
      const response = await fetch('/api/marketplace-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? 'Falha ao salvar conexao')
      }

      const savedConnection = result.data as MarketplaceConnection
      const nextConnections = [
        ...connections.filter((connection) => connection.channelId !== savedConnection.channelId),
        savedConnection,
      ].sort((left, right) => left.channelId.localeCompare(right.channelId, 'pt-BR'))

      setConnections(nextConnections)
      syncConnectionStatuses(nextConnections)
      setFeedback(`Conexao de ${savedConnection.displayName} atualizada no servidor.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao salvar conexao')
    } finally {
      setSavingChannelId(null)
    }
  }

  function handleAddMarketplace() {
    const name = window.prompt('Nome do novo canal')
    if (!name?.trim()) return
    addMarketplace(name.trim())
  }

  const tabs: { key: 'config' | 'connection' | 'matrix'; label: string }[] = [
    { key: 'config', label: 'Configuração base' },
    { key: 'connection', label: 'Conexão' },
    { key: 'matrix', label: 'Matriz comercial' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Marketplaces"
        subtitle="Hub operacional dos canais, conexoes server-side e matriz comercial por grupo"
        actions={
          <>
            <button
              type="button"
              onClick={resetDefaults}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <RefreshCcw size={14} />
              Resetar seeds
            </button>
            <button
              type="button"
              onClick={handleAddMarketplace}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <Plus size={14} />
              Adicionar canal
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {feedback && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: 'var(--accent-success)',
            }}
          >
            {feedback}
          </div>
        )}

        {errorMessage && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--accent-danger)',
            }}
          >
            {errorMessage}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {marketplaces.map((marketplace) => {
            const completeness = getMarketplaceCompleteness(
              marketplace.id,
              scopedGroups,
              commissionRules
            )

            return (
              <MarketplaceCard
                key={marketplace.id}
                marketplace={marketplace}
                completeness={completeness}
                averageMargin={averageMarginByMarketplace.get(marketplace.id) ?? null}
                selected={marketplace.id === selectedMarketplace?.id}
                onSelect={() => setSelectedMarketplace(marketplace.id)}
              />
            )
          })}
        </div>

        {selectedMarketplace && (
          <div className="flex flex-col gap-4">
            {/* Tab bar */}
            <div style={{ borderBottom: '1px solid var(--border-color)' }}>
              <div className="flex gap-0">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      borderBottom: activeTab === tab.key
                        ? '2px solid var(--accent-primary)'
                        : '2px solid transparent',
                      color: activeTab === tab.key
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      fontFamily: 'var(--font-dm-sans)',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content panel */}
            <div>
              {activeTab === 'config' && (
                <MarketplaceBaseForm
                  marketplace={selectedMarketplace}
                  completeness={selectedCompleteness}
                  onToggleActive={() => toggleActive(selectedMarketplace.id)}
                  onCommercialProfileChange={(partial) =>
                    updateMarketplaceCommercialProfile(selectedMarketplace.id, partial)
                  }
                  onCapabilitiesChange={(partial) =>
                    updateMarketplaceCapabilities(selectedMarketplace.id, partial)
                  }
                />
              )}
              {activeTab === 'connection' && (
                <MarketplaceConnectionForm
                  marketplace={selectedMarketplace}
                  connection={selectedConnection}
                  saving={savingChannelId === selectedMarketplace.id || loadingConnections}
                  onSave={handleSaveConnection}
                  onValidate={async () => {
                    // Reload connections after validation to reflect any status changes
                    try {
                      const response = await fetch('/api/marketplace-connections')
                      const payload = await response.json()
                      if (payload?.success) {
                        const nextConnections = payload.data as MarketplaceConnection[]
                        setConnections(nextConnections)
                        syncConnectionStatuses(nextConnections)
                      }
                    } catch {
                      // non-blocking
                    }
                  }}
                />
              )}
              {activeTab === 'matrix' && (
                <div className="flex flex-col gap-4">
                  {(selectedMarketplace.id === 'mercado-livre' || selectedMarketplace.id === 'magalu' || selectedMarketplace.id === 'leroy' || selectedMarketplace.id === 'madeira') && (
                    <>
                      <MarketplaceProductScopeSelector
                        products={scopedProducts}
                        classifications={classifications}
                        groups={groups}
                        onScopeChange={setImportScopeProducts}
                      />
                      <MarketplaceCommissionImportPanel
                        channelId={selectedMarketplace.id}
                        products={importScopeProducts}
                        onApply={(groups, productPreviews) => {
                          applyCommissionImport(selectedMarketplace.id, groups)
                          applyProductCommissionImport(selectedMarketplace.id, productPreviews)
                        }}
                      />
                    </>
                  )}
                  <MarketplaceProductMatrix
                    products={importScopeProducts}
                    marketplace={selectedMarketplace}
                    rules={selectedRules}
                  />
                </div>
              )}
            </div>

            {/* Escopo comercial strip */}
            <div
              className="rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                >
                  Escopo comercial
                </span>
                <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {scopedGroups.length} grupos
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <ScopeMetric label="Classificações ativas" value={String(classifications.length)} />
                <ScopeMetric label="Grupos validados" value={String(selectedCompleteness.validated)} />
                <ScopeMetric label="Manuais" value={String(selectedCompleteness.manualAssumption)} />
                <ScopeMetric label="Faltando" value={String(selectedCompleteness.missing)} />
              </div>
              {classifications.length === 0 && (
                <span className="text-xs" style={{ color: 'var(--accent-warning)' }}>
                  Nenhuma classificação cadastrada — matriz comercial vazia.
                </span>
              )}
              {groupsLoading && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Atualizando taxonomia...
                </span>
              )}
              {groupsError && (
                <span className="text-xs" style={{ color: 'var(--accent-danger)' }}>
                  {groupsError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScopeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}>{value}</span>
    </div>
  )
}
