'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, PackageOpen, Send } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PublishList } from '@/components/publicar/PublishList'
import { PublishReview } from '@/components/publicar/PublishReview'
import { calculateMarginForMarketplace } from '@/lib/calculations'
import { formatBRL, formatDate, formatPercent, generateId } from '@/lib/formatters'
import { resolveCommercialTerms } from '@/lib/marketplace-commercial'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useProductStore } from '@/stores/productStore'
import type { Marketplace, MarketplaceSyncStatus, Publication } from '@/types'

type ToastState = {
  visible: boolean
  successCount: number
  partialCount: number
  failedCount: number
}

function getDefaultMarketplaceIds(marketplaces: Marketplace[]): Set<string> {
  return new Set(
    marketplaces
      .filter(
        (marketplace) =>
          marketplace.active &&
          marketplace.executionMode === 'live' &&
          marketplace.capabilities.publish !== 'blocked'
      )
      .map((marketplace) => marketplace.id)
  )
}

function StatusBadge({ status }: { status: MarketplaceSyncStatus }) {
  const config: Record<
    MarketplaceSyncStatus,
    { label: string; color: string; backgroundColor: string }
  > = {
    draft: {
      label: 'Rascunho',
      color: 'var(--text-secondary)',
      backgroundColor: 'transparent',
    },
    queued: {
      label: 'Na fila',
      color: 'var(--accent-warning)',
      backgroundColor: 'rgba(245,158,11,0.12)',
    },
    syncing: {
      label: 'Sincronizando',
      color: 'var(--accent-primary)',
      backgroundColor: 'rgba(59,130,246,0.12)',
    },
    published: {
      label: 'Publicado',
      color: 'var(--accent-success)',
      backgroundColor: 'rgba(16,185,129,0.12)',
    },
    partial: {
      label: 'Parcial',
      color: 'var(--accent-warning)',
      backgroundColor: 'rgba(245,158,11,0.12)',
    },
    failed: {
      label: 'Falhou',
      color: 'var(--accent-danger)',
      backgroundColor: 'rgba(239,68,68,0.12)',
    },
  }

  const current = config[status]

  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        color: current.color,
        backgroundColor: current.backgroundColor,
        border:
          current.backgroundColor === 'transparent' ? '1px solid var(--border-color)' : 'none',
      }}
    >
      {current.label}
    </span>
  )
}

export default function PublicarPage() {
  const { products } = useProductStore()
  const { marketplaces, commissionRules } = useMarketplaceStore()
  const { publications, upsertPublications } = useAnalysisStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [marketplaceSelections, setMarketplaceSelections] = useState<Record<string, Set<string>>>({})
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [showReview, setShowReview] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    successCount: 0,
    partialCount: 0,
    failedCount: 0,
  })

  useEffect(() => {
    setPrices((current) => {
      const next = { ...current }
      for (const product of products) {
        if (next[product.id] === undefined) {
          next[product.id] = product.basePrice
        }
      }
      return next
    })
  }, [products])

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.has(product.id)),
    [products, selectedIds]
  )

  const readyPairsCount = useMemo(
    () =>
      Array.from(selectedIds).reduce((total, productId) => {
        const selectedMarketplaces = marketplaceSelections[productId]
        return total + (selectedMarketplaces ? selectedMarketplaces.size : 0)
      }, 0),
    [marketplaceSelections, selectedIds]
  )

  const handleToggle = useCallback(
    (id: string) => {
      setSelectedIds((current) => {
        const next = new Set(current)

        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
          setExpandedIds((expanded) => new Set(expanded).add(id))
          setMarketplaceSelections((selectionMap) => {
            if (selectionMap[id]?.size) return selectionMap
            return {
              ...selectionMap,
              [id]: getDefaultMarketplaceIds(marketplaces),
            }
          })
          setPrices((priceMap) => {
            if (priceMap[id] !== undefined) return priceMap
            const product = products.find((candidate) => candidate.id === id)
            return { ...priceMap, [id]: product?.basePrice ?? 0 }
          })
        }

        return next
      })
    },
    [marketplaces, products]
  )

  const handleSelectAll = useCallback(() => {
    const allSelected = products.length > 0 && selectedIds.size === products.length

    if (allSelected) {
      setSelectedIds(new Set())
      setExpandedIds(new Set())
      return
    }

    const nextSelectedIds = new Set(products.map((product) => product.id))
    const defaultMarketplaceIds = getDefaultMarketplaceIds(marketplaces)

    setSelectedIds(nextSelectedIds)
    setExpandedIds(new Set(nextSelectedIds))
    setMarketplaceSelections((current) => {
      const next = { ...current }
      for (const product of products) {
        if (!next[product.id] || next[product.id].size === 0) {
          next[product.id] = new Set(defaultMarketplaceIds)
        }
      }
      return next
    })
    setPrices((current) => {
      const next = { ...current }
      for (const product of products) {
        if (next[product.id] === undefined) {
          next[product.id] = product.basePrice
        }
      }
      return next
    })
  }, [marketplaces, products, selectedIds.size])

  const handlePriceChange = useCallback((productId: string, price: number) => {
    setPrices((current) => ({ ...current, [productId]: price }))
  }, [])

  const handleMarketplaceToggle = useCallback((productId: string, marketplaceId: string) => {
    setMarketplaceSelections((current) => {
      const nextSelection = current[productId] ? new Set(current[productId]) : new Set<string>()
      if (nextSelection.has(marketplaceId)) {
        nextSelection.delete(marketplaceId)
      } else {
        nextSelection.add(marketplaceId)
      }
      return { ...current, [productId]: nextSelection }
    })
  }, [])

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  async function handleConfirmPublish() {
    if (isPublishing) return

    setErrorMessage(null)
    setIsPublishing(true)

    const draftPublications: Publication[] = []
    const publishItems: Array<{
      publicationId: string
      productId: string
      productName: string
      sku: string
      stock: number
      channelId: string
      price: number
      productGroupId?: string
      commissionPercent: number
      fixedFeeAmount: number
      freightFixedAmount: number
      ruleType: Publication['ruleType']
      reviewStatus: Publication['reviewStatus']
      sourceType: Publication['sourceType']
    }> = []

    for (const product of selectedProducts) {
      const selectedMarketplaces = marketplaceSelections[product.id]
      if (!selectedMarketplaces || selectedMarketplaces.size === 0) continue

      const price = prices[product.id] ?? product.basePrice

      for (const marketplaceId of selectedMarketplaces) {
        const marketplace = marketplaces.find((candidate) => candidate.id === marketplaceId)
        if (!marketplace) continue

        const terms = resolveCommercialTerms(product, marketplace, commissionRules)
        const margin = calculateMarginForMarketplace(product, marketplace, commissionRules, price)
        const publicationId = generateId()

        draftPublications.push({
          id: publicationId,
          productId: product.id,
          marketplaceId: marketplace.id,
          productGroupId: margin.productGroupId,
          price,
          margin: margin.marginPercent,
          commissionPercent: terms.commissionPercent,
          fixedFeeAmount: terms.fixedFeeAmount,
          freightFixedAmount: terms.freightFixedAmount,
          totalFees: margin.totalFees,
          status: 'queued',
          ruleType: terms.ruleType,
          reviewStatus: terms.reviewStatus,
          sourceType: terms.sourceType,
        })

        publishItems.push({
          publicationId,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          stock: product.stock,
          channelId: marketplace.id,
          price,
          productGroupId: margin.productGroupId,
          commissionPercent: terms.commissionPercent,
          fixedFeeAmount: terms.fixedFeeAmount,
          freightFixedAmount: terms.freightFixedAmount,
          ruleType: terms.ruleType,
          reviewStatus: terms.reviewStatus,
          sourceType: terms.sourceType,
        })
      }
    }

    if (publishItems.length === 0) {
      setErrorMessage('Nenhum envio foi montado. Selecione pelo menos um produto e um canal.')
      setIsPublishing(false)
      return
    }

    upsertPublications(draftPublications)

    try {
      const response = await fetch('/api/marketplace-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: publishItems }),
      })

      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? 'Falha ao criar jobs de publicacao')
      }

      const resultMap = new Map(
        (payload.data as Array<{
          publicationId: string
          status: MarketplaceSyncStatus
          errorMessage?: string
          syncJobId?: string
          connectionId?: string
          remoteListingId?: string
          publishedAt?: string
          syncedAt?: string
        }>).map((item) => [item.publicationId, item])
      )

      const mergedPublications = draftPublications.map((publication) => {
        const result = resultMap.get(publication.id)
        if (!result) {
          return {
            ...publication,
            status: 'failed' as MarketplaceSyncStatus,
            errorMessage: 'Resposta do servidor nao retornou este envio.',
          }
        }

        return {
          ...publication,
          status: result.status,
          errorMessage: result.errorMessage,
          syncJobId: result.syncJobId,
          connectionId: result.connectionId,
          remoteListingId: result.remoteListingId,
          publishedAt: result.publishedAt,
          syncedAt: result.syncedAt,
        }
      })

      upsertPublications(mergedPublications)

      const successCount = mergedPublications.filter((item) => item.status === 'published').length
      const partialCount = mergedPublications.filter((item) => item.status === 'partial').length
      const failedCount = mergedPublications.filter((item) => item.status === 'failed').length

      setToast({
        visible: true,
        successCount,
        partialCount,
        failedCount,
      })
      setTimeout(
        () =>
          setToast({
            visible: false,
            successCount: 0,
            partialCount: 0,
            failedCount: 0,
          }),
        5000
      )

      setShowReview(false)
      setSelectedIds(new Set())
      setExpandedIds(new Set())
      setMarketplaceSelections({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar publicacoes'
      setErrorMessage(message)

      upsertPublications(
        draftPublications.map((publication) => ({
          ...publication,
          status: 'failed' as MarketplaceSyncStatus,
          errorMessage: message,
        }))
      )
    } finally {
      setIsPublishing(false)
    }
  }

  function getProductName(productId: string): string {
    return products.find((product) => product.id === productId)?.name ?? productId
  }

  function getMarketplaceName(marketplaceId: string): string {
    return marketplaces.find((marketplace) => marketplace.id === marketplaceId)?.name ?? marketplaceId
  }

  function getHistoryDate(publication: Publication): string | null {
    return publication.publishedAt ?? publication.syncedAt ?? null
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Publicar"
        subtitle="Selecione produtos, resolva as regras comerciais e gere jobs reais por canal"
        actions={
          products.length > 0 ? (
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{
                backgroundColor:
                  readyPairsCount > 0 ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: readyPairsCount > 0 ? '#fff' : 'var(--text-secondary)',
                fontFamily: 'var(--font-dm-sans)',
                cursor: readyPairsCount > 0 ? 'pointer' : 'not-allowed',
              }}
              disabled={readyPairsCount === 0}
              onClick={() => setShowReview(true)}
            >
              <Send size={15} />
              Revisar envio
              {readyPairsCount > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  {readyPairsCount}
                </span>
              )}
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        {toast.visible && (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
            }}
          >
            <CheckCircle2 size={18} color="var(--accent-success)" className="flex-shrink-0" />
            <p className="text-sm font-medium" style={{ color: 'var(--accent-success)', fontFamily: 'var(--font-dm-sans)' }}>
              {toast.successCount} publicado(s), {toast.partialCount} parcial(is), {toast.failedCount} falha(s).
            </p>
          </div>
        )}

        {errorMessage && (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <AlertTriangle size={18} color="var(--accent-danger)" className="flex-shrink-0" />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {errorMessage}
            </p>
          </div>
        )}

        {products.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <PackageOpen size={32} color="var(--text-secondary)" />
            </div>
            <div className="text-center">
              <p
                className="font-semibold text-base mb-1"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Nenhum produto disponivel
              </p>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Importe seus produtos no catalogo antes de publicar.
              </p>
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  fontFamily: 'var(--font-dm-sans)',
                }}
              >
                Ir para o Catalogo
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h2
                className="text-sm font-semibold mb-1"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Produtos disponiveis
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                O canal usa a mesma regra comercial do simulador. Mercado Livre, Amazon e Magalu
                executam no V1; Leroy e Madeira entram como fila planejada.
              </p>
            </div>

            <PublishList
              products={products}
              marketplaces={marketplaces}
              commissionRules={commissionRules}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              prices={prices}
              onPriceChange={handlePriceChange}
              marketplaceSelections={marketplaceSelections}
              onMarketplaceToggle={handleMarketplaceToggle}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          </>
        )}

        {publications.length > 0 && (
          <div>
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Historico de publicacoes ({publications.length})
            </h2>

            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <div
                className="grid grid-cols-5 gap-3 px-5 py-3 border-b text-xs font-medium"
                style={{
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                }}
              >
                <span>Produto</span>
                <span>Marketplace</span>
                <span className="text-right">Preco</span>
                <span className="text-right">Margem</span>
                <span className="text-right">Status / Data</span>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {[...publications].reverse().map((publication, index) => {
                  const historyDate = getHistoryDate(publication)

                  return (
                    <div
                      key={publication.id}
                      className="grid grid-cols-5 gap-3 px-5 py-3 items-center"
                      style={{
                        backgroundColor:
                          index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }}
                    >
                      <div className="min-w-0">
                        <span
                          className="text-sm block truncate"
                          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                        >
                          {getProductName(publication.productId)}
                        </span>
                        {publication.errorMessage && (
                          <span className="text-xs block mt-1" style={{ color: 'var(--accent-danger)' }}>
                            {publication.errorMessage}
                          </span>
                        )}
                      </div>

                      <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                        {getMarketplaceName(publication.marketplaceId)}
                      </span>

                      <span
                        className="text-sm text-right tabular-nums"
                        style={{
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                        }}
                      >
                        {formatBRL(publication.price)}
                      </span>

                      <span
                        className="text-sm text-right tabular-nums font-medium"
                        style={{
                          color:
                            publication.margin >= 20
                              ? 'var(--accent-success)'
                              : publication.margin >= 10
                              ? 'var(--accent-warning)'
                              : 'var(--accent-danger)',
                          fontFamily: 'var(--font-jetbrains-mono)',
                        }}
                      >
                        {formatPercent(publication.margin)}
                      </span>

                      <div className="flex flex-col items-end gap-0.5">
                        <StatusBadge status={publication.status} />
                        {historyDate && (
                          <span
                            className="text-xs"
                            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                          >
                            {formatDate(historyDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <PublishReview
        open={showReview}
        onClose={() => setShowReview(false)}
        onConfirm={handleConfirmPublish}
        selectedProducts={selectedProducts}
        marketplaces={marketplaces}
        commissionRules={commissionRules}
        prices={prices}
        marketplaceSelections={marketplaceSelections}
        isPublishing={isPublishing}
      />
    </div>
  )
}
