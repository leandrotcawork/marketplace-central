import { type NextRequest } from 'next/server'
import { MagaluClient } from '@/lib/clients/magalu'
import { createMarketplaceClient } from '@/lib/marketplace-client-factory'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'
import type {
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionImportResult,
  Product,
} from '@/types'

const CHANNEL_ID = 'magalu'

type ImportRequestBody = {
  products?: Product[]
  /**
   * Optional default dimensions for shipping cost calculation.
   * Format: "HxWxL,weight_grams" — e.g. "10x60x60,25000" for a 25 kg product.
   * H/W/L in cm, weight in grams.
   */
  dimensions?: string
  /**
   * Per-product dimensions from the local store (productDimensionsStore).
   * Map of productId → "HxWxL,weight_grams" string.
   * Takes precedence over global `dimensions`.
   */
  productDimensions?: Record<string, string>
  /**
   * Seller performance discount tier for Magalu Entregas co-participation.
   * Based on on-time dispatch rate:
   *   'none' = < 87% on-time (full price)
   *   '25'   = 87-97% on-time (25% discount)
   *   '50'   = > 97% on-time (50% discount)
   * Defaults to 'none'.
   */
  discountTier?: 'none' | '25' | '50'
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as ImportRequestBody
    const scopedProducts = (body.products ?? []).filter(hasImportableGroup)
    const dimensions = body.dimensions?.trim() || undefined
    const productDimensions = body.productDimensions ?? {}
    const discountTier = body.discountTier ?? 'none'

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
        { success: false, error: 'Falha ao descriptografar credenciais do Magalu' },
        { status: 500 }
      )
    }

    const client = createMarketplaceClient(CHANNEL_ID, secrets ?? {})

    if (!(client instanceof MagaluClient)) {
      return Response.json(
        { success: false, error: 'Cliente do Magalu indisponivel' },
        { status: 500 }
      )
    }

    const productPreviews: MarketplaceCommissionImportProductPreview[] = []

    for (const product of scopedProducts) {
      const perProductDims = productDimensions[product.id] || undefined
      const preview = buildProductPreview(client, product, perProductDims ?? dimensions, discountTier)
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
    console.error('Error importing Magalu commissions:', error)
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao importar comissoes do Magalu',
      },
      { status: 500 }
    )
  }
}

function hasImportableGroup(product: Product): boolean {
  return Boolean(product.primaryTaxonomyNodeId && product.primaryTaxonomyGroupName)
}

function buildProductPreview(
  client: MagaluClient,
  product: Product,
  dimensions?: string,
  discountTier: 'none' | '25' | '50' = 'none'
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

  const commission = client.getCommissionForProduct(product.basePrice)

  // Simulate freight cost if dimensions are available
  let freightFixedAmount: number | undefined
  let freteSource = ''

  if (dimensions) {
    const freightCost = MagaluClient.simulateShippingCost(dimensions, discountTier)
    if (freightCost !== null) {
      freightFixedAmount = freightCost
      const tierLabel = discountTier === '50' ? ' (50% desc)' : discountTier === '25' ? ' (25% desc)' : ''
      freteSource = ` +frete/tabela${tierLabel}`
    }
  }

  return {
    ...base,
    status: 'importable',
    categoryId: product.primaryTaxonomyNodeId,
    categoryName: product.primaryTaxonomyGroupName ?? product.category,
    listingTypeId: 'magalu_standard',
    commissionPercent: commission.commissionPercent,
    fixedFeeAmount: commission.fixedFeeAmount,
    saleFeeAmount: commission.saleFeeAmount,
    freightFixedAmount,
    sourceRef: `Magalu flat 16%${freteSource}`,
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

    // Magalu has flat commission — no conflict possible across products in same group
    const first = resolved[0]
    const freightAmounts = resolved
      .map((p) => p.freightFixedAmount)
      .filter((v): v is number => v !== undefined)
    const avgFreight =
      freightAmounts.length > 0
        ? Math.round((freightAmounts.reduce((sum, v) => sum + v, 0) / freightAmounts.length) * 100) / 100
        : undefined

    importedGroups.push({
      ...baseGroup,
      status: 'importable',
      categoryId: first.categoryId,
      categoryName: first.categoryName,
      listingTypeId: first.listingTypeId,
      commissionPercent: first.commissionPercent,
      fixedFeeAmount: first.fixedFeeAmount,
      saleFeeAmount: first.saleFeeAmount,
      freightFixedAmount: avgFreight,
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
    listingTypeId: 'magalu_standard',
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

function buildImportedGroupNotes(
  previews: MarketplaceCommissionImportProductPreview[],
  importable: MarketplaceCommissionImportProductPreview[],
  hasMissing: boolean
): string {
  const sampleSkus = importable.slice(0, 5).map((p) => p.sku).join(', ')
  const base = `Importado via comissao fixa 16% com ${importable.length}/${previews.length} produto(s). Amostra: ${sampleSkus}`
  const missing = previews.filter((p) => p.status === 'missing')
  return hasMissing
    ? `${base} | ${missing.length} produto(s) sem preco valido (excluidos do calculo)`
    : base
}
