'use client'

import { useState, useCallback, useEffect } from 'react'
import { Send, PackageOpen, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { PublishList } from '@/components/publicar/PublishList'
import { PublishReview } from '@/components/publicar/PublishReview'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { formatBRL, formatPercent, formatDate, generateId } from '@/lib/formatters'
import { calculateMargin } from '@/lib/calculations'

type ToastState = {
  visible: boolean
  count: number
}

export default function PublicarPage() {
  const { products } = useProductStore()
  const { marketplaces } = useMarketplaceStore()
  const { publications, addPublication, updatePublicationStatus } = useAnalysisStore()

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Price overrides: productId -> price
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const p of products) {
      init[p.id] = p.basePrice
    }
    return init
  })

  useEffect(() => {
    setPrices((prev) => {
      const next = { ...prev }
      for (const product of products) {
        if (next[product.id] === undefined) {
          next[product.id] = product.basePrice
        }
      }
      return next
    })
  }, [products])

  // Marketplace selections: productId -> Set<marketplaceId>
  const [marketplaceSelections, setMarketplaceSelections] = useState<
    Record<string, Set<string>>
  >({})

  // Modal + publishing state
  const [showReview, setShowReview] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  // Success toast
  const [toast, setToast] = useState<ToastState>({ visible: false, count: 0 })

  // --- Handlers ---

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        // Auto-expand when selecting
        setExpandedIds((exp) => new Set(exp).add(id))
        // Default: select all active marketplaces for this product
        setMarketplaceSelections((mSel) => {
          if (mSel[id] && mSel[id].size > 0) return mSel
          const activeIds = new Set(
            marketplaces.filter((m) => m.active).map((m) => m.id)
          )
          return { ...mSel, [id]: activeIds }
        })
        // Default price if not set
        setPrices((prev2) => {
          if (prev2[id] !== undefined) return prev2
          const product = products.find((p) => p.id === id)
          return { ...prev2, [id]: product?.basePrice ?? 0 }
        })
      }
      return next
    })
  }, [marketplaces, products])

  const handleSelectAll = useCallback(() => {
    const allSelected = products.length > 0 && selectedIds.size === products.length
    if (allSelected) {
      setSelectedIds(new Set())
      setExpandedIds(new Set())
    } else {
      const allIds = new Set(products.map((p) => p.id))
      setSelectedIds(allIds)
      setExpandedIds(new Set(allIds))
      // Default marketplaces + prices for all
      setMarketplaceSelections((prev) => {
        const next = { ...prev }
        for (const product of products) {
          if (!next[product.id] || next[product.id].size === 0) {
            next[product.id] = new Set(
              marketplaces.filter((m) => m.active).map((m) => m.id)
            )
          }
        }
        return next
      })
      setPrices((prev) => {
        const next = { ...prev }
        for (const product of products) {
          if (next[product.id] === undefined) {
            next[product.id] = product.basePrice
          }
        }
        return next
      })
    }
  }, [products, selectedIds, marketplaces])

  const handlePriceChange = useCallback((productId: string, price: number) => {
    setPrices((prev) => ({ ...prev, [productId]: price }))
  }, [])

  const handleMarketplaceToggle = useCallback(
    (productId: string, marketplaceId: string) => {
      setMarketplaceSelections((prev) => {
        const existing = prev[productId] ? new Set(prev[productId]) : new Set<string>()
        if (existing.has(marketplaceId)) {
          existing.delete(marketplaceId)
        } else {
          existing.add(marketplaceId)
        }
        return { ...prev, [productId]: existing }
      })
    },
    []
  )

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Count how many (product × marketplace) pairs are ready to publish
  const readyPairsCount = Array.from(selectedIds).reduce((acc, productId) => {
    const mktSel = marketplaceSelections[productId]
    return acc + (mktSel ? mktSel.size : 0)
  }, 0)

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))

  // --- Publish flow ---

  async function handleConfirmPublish() {
    if (isPublishing) return
    setIsPublishing(true)

    // Simulate network delay
    await new Promise<void>((resolve) => setTimeout(resolve, 2000))

    const now = new Date().toISOString()
    let pubCount = 0

    for (const product of selectedProducts) {
      const mktSel = marketplaceSelections[product.id]
      if (!mktSel || mktSel.size === 0) continue
      const price = prices[product.id] ?? product.basePrice

      for (const mktId of mktSel) {
        const marketplace = marketplaces.find((m) => m.id === mktId)
        if (!marketplace) continue

        const { marginPercent } = calculateMargin(
          price,
          product.cost,
          marketplace.commission,
          marketplace.fixedFee
        )

        const pubId = generateId()
        addPublication({
          id: pubId,
          productId: product.id,
          marketplaceId: mktId,
          price,
          margin: marginPercent,
          status: 'draft',
        })
        updatePublicationStatus(pubId, 'published', now)
        pubCount++
      }
    }

    setIsPublishing(false)
    setShowReview(false)

    // Clear selections
    setSelectedIds(new Set())
    setExpandedIds(new Set())
    setMarketplaceSelections({})

    // Show success toast
    setToast({ visible: true, count: pubCount })
    setTimeout(() => setToast({ visible: false, count: 0 }), 4000)
  }

  // --- History table helpers ---

  function getProductName(productId: string): string {
    return products.find((p) => p.id === productId)?.name ?? productId
  }

  function getMarketplaceName(marketplaceId: string): string {
    return marketplaces.find((m) => m.id === marketplaceId)?.name ?? marketplaceId
  }

  function StatusBadge({ status }: { status: 'draft' | 'ready' | 'published' }) {
    if (status === 'published') {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ color: 'var(--accent-success)', backgroundColor: 'rgba(16,185,129,0.12)' }}
        >
          <CheckCircle2 size={11} />
          Publicado
        </span>
      )
    }
    if (status === 'ready') {
      return (
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ color: 'var(--accent-warning)', backgroundColor: 'rgba(245,158,11,0.12)' }}
        >
          Pronto
        </span>
      )
    }
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
      >
        Rascunho
      </span>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Publicar"
        subtitle="Revise e publique seus produtos nos marketplaces"
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
              Revisar Publicação
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

        {/* Success toast */}
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
              {toast.count} publicaç{toast.count !== 1 ? 'ões realizadas' : 'ão realizada'} com sucesso!
            </p>
          </div>
        )}

        {/* Empty state — no products */}
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
                Nenhum produto disponível
              </p>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Importe seus produtos no catálogo antes de publicar.
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
                Ir para o Catálogo
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Section heading */}
            <div>
              <h2
                className="text-sm font-semibold mb-1"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Produtos disponíveis
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Selecione produtos, configure preços e marketplaces, depois clique em{' '}
                <strong style={{ color: 'var(--text-primary)' }}>Revisar Publicação</strong>.
              </p>
            </div>

            {/* Product list */}
            <PublishList
              products={products}
              marketplaces={marketplaces}
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

        {/* Publication history */}
        {publications.length > 0 && (
          <div>
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              Histórico de Publicações ({publications.length})
            </h2>

            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
              }}
            >
              {/* Table header */}
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
                <span className="text-right">Preço</span>
                <span className="text-right">Margem</span>
                <span className="text-right">Status / Data</span>
              </div>

              {/* Table rows */}
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {[...publications].reverse().map((pub, idx) => (
                  <div
                    key={pub.id}
                    className="grid grid-cols-5 gap-3 px-5 py-3 items-center"
                    style={{
                      backgroundColor:
                        idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    {/* Product */}
                    <span
                      className="text-sm truncate"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
                    >
                      {getProductName(pub.productId)}
                    </span>

                    {/* Marketplace */}
                    <span
                      className="text-sm truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {getMarketplaceName(pub.marketplaceId)}
                    </span>

                    {/* Price */}
                    <span
                      className="text-sm text-right tabular-nums"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatBRL(pub.price)}
                    </span>

                    {/* Margin */}
                    <span
                      className="text-sm text-right tabular-nums font-medium"
                      style={{
                        color:
                          pub.margin >= 20
                            ? 'var(--accent-success)'
                            : pub.margin >= 10
                            ? 'var(--accent-warning)'
                            : 'var(--accent-danger)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                      }}
                    >
                      {formatPercent(pub.margin)}
                    </span>

                    {/* Status + date */}
                    <div className="flex flex-col items-end gap-0.5">
                      <StatusBadge status={pub.status} />
                      {pub.publishedAt && (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                        >
                          {formatDate(pub.publishedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Review modal */}
      <PublishReview
        open={showReview}
        onClose={() => setShowReview(false)}
        onConfirm={handleConfirmPublish}
        selectedProducts={selectedProducts}
        marketplaces={marketplaces}
        prices={prices}
        marketplaceSelections={marketplaceSelections}
        isPublishing={isPublishing}
      />
    </div>
  )
}
