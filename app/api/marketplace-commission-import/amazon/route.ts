import { type NextRequest } from 'next/server'
import { AmazonClient } from '@/lib/clients/amazon'
import { createMarketplaceClient } from '@/lib/marketplace-client-factory'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'
import type {
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionImportResult,
  Product,
} from '@/types'

const CHANNEL_ID = 'amazon'

type ImportRequestBody = {
  products?: Product[]
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as ImportRequestBody
    const scopedProducts = (body.products ?? []).filter(hasImportableGroup)

    if (scopedProducts.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'Nenhum produto com grupo taxonomico valido foi enviado para importacao',
        },
        { status: 400 }
      )
    }

    const connection = await getConnectionByChannelId(CHANNEL_ID, tenantId)
    const secrets =
      connection?.hasStoredSecret && connection.connectionId
        ? await getDecryptedConnectionSecrets(connection.connectionId, tenantId)
        : {}

    if (connection?.hasStoredSecret && !secrets) {
      return Response.json(
        { success: false, error: 'Falha ao descriptografar credenciais da Amazon' },
        { status: 500 }
      )
    }

    const client = createMarketplaceClient(CHANNEL_ID, secrets ?? {})

    if (!(client instanceof AmazonClient)) {
      return Response.json(
        { success: false, error: 'Cliente da Amazon indisponivel' },
        { status: 500 }
      )
    }

    const productPreviews: MarketplaceCommissionImportProductPreview[] = []

    for (const product of scopedProducts) {
      const preview = buildProductPreview(product)
      productPreviews.push(preview)
    }

    const result = buildImportResult(productPreviews)

    return Response.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error importing Amazon commissions:', error)
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao importar comissoes da Amazon',
      },
      { status: 500 }
    )
  }
}

function hasImportableGroup(product: Product): boolean {
  return Boolean(product.primaryTaxonomyNodeId && product.primaryTaxonomyGroupName)
}

function buildProductPreview(
  product: Product
): MarketplaceCommissionImportProductPreview {
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

  const commission = AmazonClient.getCommissionForProduct(
    product.basePrice,
    product.primaryTaxonomyGroupName
  )

  return {
    ...base,
    status: 'importable',
    categoryId: commission.categoryName,
    categoryName: commission.categoryName,
    listingTypeId: 'amazon_standard',
    commissionPercent: commission.commissionPercent,
    fixedFeeAmount: commission.fixedFeeAmount,
    saleFeeAmount: commission.saleFeeAmount,
    sourceRef: `Amazon BR — ${commission.categoryName} ${(commission.commissionPercent * 100).toFixed(0)}%`,
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

    // Amazon: same taxonomy group may map to different Amazon categories
    // (e.g., a group with mixed product types). Detect commission divergence.
    const uniqueRates = new Set(resolved.map((p) => p.commissionPercent))
    const uniqueCategories = new Set(resolved.map((p) => p.categoryId))

    if (uniqueRates.size > 1) {
      // Conflict: products in the same taxonomy group resolved to different Amazon rates
      conflictGroups.push({
        ...baseGroup,
        status: 'conflict',
        categoryId: [...uniqueCategories].join(' / '),
        categoryName: [...uniqueCategories].join(' / '),
        listingTypeId: 'amazon_standard',
        notes: buildConflictNotes(resolved),
      })
      continue
    }

    // All resolved products have the same rate — safe to import
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
    listingTypeId: 'amazon_standard',
  }
}

function buildNotes(previews: MarketplaceCommissionImportProductPreview[]): string {
  return previews
    .map((preview) => {
      const statusDetail = preview.error ?? preview.status
      return `${preview.sku}: ${statusDetail}`
    })
    .join(' | ')
}

function buildConflictNotes(
  resolved: MarketplaceCommissionImportProductPreview[]
): string {
  const byRate = new Map<number, string[]>()
  for (const p of resolved) {
    const rate = p.commissionPercent ?? 0
    const skus = byRate.get(rate) ?? []
    skus.push(p.sku)
    byRate.set(rate, skus)
  }
  return [...byRate.entries()]
    .map(([rate, skus]) => `${(rate * 100).toFixed(0)}%: ${skus.slice(0, 3).join(', ')}${skus.length > 3 ? ` +${skus.length - 3}` : ''}`)
    .join(' | ')
}

function buildImportedGroupNotes(
  previews: MarketplaceCommissionImportProductPreview[],
  importable: MarketplaceCommissionImportProductPreview[],
  hasMissing: boolean
): string {
  const first = importable[0]
  const rate = first?.commissionPercent ?? 0
  const category = first?.categoryName ?? 'Demais categorias'
  const sampleSkus = importable.slice(0, 5).map((p) => p.sku).join(', ')
  const base = `Importado via Amazon BR — ${category} ${(rate * 100).toFixed(0)}% com ${importable.length}/${previews.length} produto(s). Amostra: ${sampleSkus}`
  const missing = previews.filter((p) => p.status === 'missing')
  return hasMissing
    ? `${base} | ${missing.length} produto(s) sem preco valido (excluidos do calculo)`
    : base
}
