import { type NextRequest } from 'next/server'
import { getShopeeCommissionForPrice } from '@/lib/clients/shopee'
import type {
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionImportResult,
  Product,
} from '@/types'

const CHANNEL_ID = 'shopee'
const LISTING_TYPE_ID = 'shopee_standard'
const INVALID_GROUP_ERROR = 'Nenhum produto com grupo taxonomico valido foi enviado para importacao'
const DEFAULT_ERROR_MESSAGE = 'Falha ao importar comissoes da Shopee'
const SOURCE_REF = 'Contrato Shopee CNPJ - tabela por faixa de preco'

type ImportRequestBody = {
  products?: Product[]
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportRequestBody
    const scopedProducts = (body.products ?? []).filter(hasImportableGroup)

    if (scopedProducts.length === 0) {
      return Response.json(
        { success: false, error: INVALID_GROUP_ERROR },
        { status: 400 }
      )
    }

    const productPreviews = scopedProducts.map(buildProductPreview)
    const result = buildImportResult(productPreviews)

    return Response.json({ success: true, data: result }, { status: 200 })
  } catch (error) {
    console.error('Error importing Shopee commissions:', error)
    return Response.json(
      { success: false, error: DEFAULT_ERROR_MESSAGE },
      { status: 500 }
    )
  }
}

function hasImportableGroup(product: Product): boolean {
  return Boolean(product.primaryTaxonomyNodeId && product.primaryTaxonomyGroupName)
}

function buildProductPreview(product: Product): MarketplaceCommissionImportProductPreview {
  const base = {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    groupId: product.primaryTaxonomyNodeId!,
    groupName: product.primaryTaxonomyGroupName ?? product.category,
    basePrice: product.basePrice,
  }

  if (!Number.isFinite(product.basePrice) || product.basePrice <= 0) {
    return {
      ...base,
      status: 'missing',
      error: 'Preco base invalido para calculo de comissao',
    }
  }

  const commission = getShopeeCommissionForPrice(product.basePrice)

  return {
    ...base,
    status: 'importable',
    categoryId: product.primaryTaxonomyNodeId,
    categoryName: product.primaryTaxonomyGroupName ?? product.category,
    listingTypeId: LISTING_TYPE_ID,
    commissionPercent: commission.commissionPercent,
    fixedFeeAmount: commission.fixedFeeAmount,
    saleFeeAmount: commission.saleFeeAmount,
    sourceRef: `${SOURCE_REF} (${commission.tierLabel})`,
  }
}

function buildImportResult(
  productPreviews: MarketplaceCommissionImportProductPreview[]
): MarketplaceCommissionImportResult {
  const groups = new Map<string, MarketplaceCommissionImportProductPreview[]>()

  for (const preview of productPreviews) {
    const existing = groups.get(preview.groupId) ?? []
    existing.push(preview)
    groups.set(preview.groupId, existing)
  }

  const importedGroups: MarketplaceCommissionImportGroupPreview[] = []
  const conflictGroups: MarketplaceCommissionImportGroupPreview[] = []
  const missingGroups: MarketplaceCommissionImportGroupPreview[] = []
  const errorGroups: MarketplaceCommissionImportGroupPreview[] = []

  for (const [groupId, previews] of groups) {
    const resolved = previews.filter((p) => p.status === 'importable')
    const hasError = previews.some((p) => p.status === 'error')
    const hasMissing = previews.some((p) => p.status === 'missing')
    const sampleProducts = previews.slice(0, 5)
    const baseGroup = {
      groupId,
      groupName: previews[0]?.groupName ?? groupId,
      categoryLabel: 'Grupo',
      productCount: previews.length,
      resolvedProductCount: resolved.length,
      sampleProducts,
    }

    if (resolved.length === 0) {
      const target = hasError ? errorGroups : missingGroups
      target.push({
        ...baseGroup,
        status: hasError ? 'error' : 'missing',
        notes: buildNotes(previews),
      })
      continue
    }

    const uniqueTiers = new Set(
      resolved.map((p) => `${p.commissionPercent ?? 0}:${p.fixedFeeAmount ?? 0}`)
    )

    if (uniqueTiers.size > 1) {
      conflictGroups.push({
        ...baseGroup,
        status: 'conflict',
        listingTypeId: LISTING_TYPE_ID,
        notes: buildConflictNotes(resolved),
      })
      continue
    }

    const first = resolved[0]
    importedGroups.push({
      ...baseGroup,
      status: 'importable',
      categoryId: first.categoryId,
      categoryName: first.categoryName,
      listingTypeId: first.listingTypeId,
      commissionPercent: first.commissionPercent,
      fixedFeeAmount: first.fixedFeeAmount,
      saleFeeAmount: first.saleFeeAmount,
      sourceRef: first.sourceRef,
      notes: buildImportedGroupNotes(previews, resolved, hasMissing),
    })
  }

  const sortGroups = (items: MarketplaceCommissionImportGroupPreview[]) =>
    items.sort((left, right) => left.groupName.localeCompare(right.groupName, 'pt-BR'))

  return {
    channelId: CHANNEL_ID,
    importedGroups: sortGroups(importedGroups),
    conflictGroups: sortGroups(conflictGroups),
    missingGroups: sortGroups(missingGroups),
    errorGroups: sortGroups(errorGroups),
    productPreviews,
    generatedAt: new Date().toISOString(),
    listingTypeId: LISTING_TYPE_ID,
  }
}

function buildNotes(previews: MarketplaceCommissionImportProductPreview[]): string {
  return previews
    .map((preview) => `${preview.sku}: ${preview.error ?? preview.status}`)
    .join(' | ')
}

function buildConflictNotes(resolved: MarketplaceCommissionImportProductPreview[]): string {
  const byTier = new Map<string, string[]>()
  for (const p of resolved) {
    const rate = p.commissionPercent ?? 0
    const fixedFee = p.fixedFeeAmount ?? 0
    const tierKey = `${rate}:${fixedFee}`
    const skus = byTier.get(tierKey) ?? []
    skus.push(p.sku)
    byTier.set(tierKey, skus)
  }

  return [...byTier.entries()]
    .map(([tierKey, skus]) => {
      const [rate, fixedFee] = tierKey.split(':').map(Number)
      const feeLabel = `R$${fixedFee.toFixed(0)}`
      return `${(rate * 100).toFixed(0)}% + ${feeLabel}: ${skus.slice(0, 3).join(', ')}${
        skus.length > 3 ? ` +${skus.length - 3}` : ''
      }`
    })
    .join(' | ')
}

function buildImportedGroupNotes(
  previews: MarketplaceCommissionImportProductPreview[],
  importable: MarketplaceCommissionImportProductPreview[],
  hasMissing: boolean
): string {
  const first = importable[0]
  const rate = first?.commissionPercent ?? 0
  const sampleSkus = importable.slice(0, 5).map((p) => p.sku).join(', ')
  const base = `Importado via Shopee - ${(rate * 100).toFixed(0)}% com ${importable.length}/${previews.length} produto(s). Amostra: ${sampleSkus}`
  const missing = previews.filter((p) => p.status === 'missing')

  return hasMissing
    ? `${base} | ${missing.length} produto(s) sem preco valido (excluidos do calculo)`
    : base
}
