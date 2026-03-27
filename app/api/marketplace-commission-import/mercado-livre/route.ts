import { type NextRequest } from 'next/server'
import { MercadoLivreClient } from '@/lib/clients/mercado-livre'
import { createMarketplaceClient } from '@/lib/marketplace-client-factory'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'
import type {
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionImportResult,
  Product,
} from '@/types'

const CHANNEL_ID = 'mercado-livre'
const LISTING_TYPE_ID = 'gold_special'

type ImportRequestBody = {
  products?: Product[]
  /**
   * Optional default dimensions for shipping cost calculation.
   * Format: "HxWxL,weight_grams" — e.g. "10x60x60,25000" for a 25 kg tile.
   * When provided, ML's /shipping_options/free is called per product to populate freightFixedAmount.
   */
  dimensions?: string
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as ImportRequestBody
    const scopedProducts = (body.products ?? []).filter(hasImportableGroup)
    const dimensions = body.dimensions?.trim() || undefined

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
        { success: false, error: 'Falha ao descriptografar credenciais do Mercado Livre' },
        { status: 500 }
      )
    }

    const client = createMarketplaceClient(CHANNEL_ID, secrets ?? {})

    if (!(client instanceof MercadoLivreClient)) {
      return Response.json(
        { success: false, error: 'Cliente do Mercado Livre indisponivel' },
        { status: 500 }
      )
    }

    const productPreviews: MarketplaceCommissionImportProductPreview[] = []

    for (const product of scopedProducts) {
      const preview = await buildProductPreview(client, product, dimensions)
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
    console.error('Error importing Mercado Livre commissions:', error)
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao importar comissoes do Mercado Livre',
      },
      { status: 500 }
    )
  }
}

function hasImportableGroup(product: Product): boolean {
  return Boolean(product.primaryTaxonomyNodeId && product.primaryTaxonomyGroupName)
}

async function buildProductPreview(
  client: MercadoLivreClient,
  product: Product,
  dimensions?: string
): Promise<MarketplaceCommissionImportProductPreview> {
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
      error: 'Preco base invalido para consultar listing_prices',
    }
  }

  // Fetch category suggestion and catalog dimensions (from EAN) in parallel
  const [suggestion, catalogDimensions] = await Promise.all([
    client.suggestCategoryDetailed(product.name),
    !dimensions && product.ean
      ? client.getCatalogDimensions(product.ean)
      : Promise.resolve(null),
  ])

  if (!suggestion?.categoryId) {
    return {
      ...base,
      status: 'missing',
      error: 'Sem categoria sugerida pelo domain_discovery',
    }
  }

  // Manual dimensions take precedence; EAN catalog lookup is the automatic fallback
  const effectiveDimensions = dimensions ?? catalogDimensions ?? undefined

  try {
    const [listingPrice, freightCost] = await Promise.all([
      client.getListingPrice({
        price: product.basePrice,
        categoryId: suggestion.categoryId,
        categoryName: suggestion.categoryName,
        listingTypeId: LISTING_TYPE_ID,
      }),
      effectiveDimensions
        ? client.getSellerShippingCost({ dimensions: effectiveDimensions, itemPrice: product.basePrice })
        : Promise.resolve(null),
    ])

    return {
      ...base,
      status: 'importable',
      categoryId: listingPrice.categoryId,
      categoryName: listingPrice.categoryName,
      listingTypeId: listingPrice.listingTypeId,
      commissionPercent: listingPrice.commissionPercent,
      fixedFeeAmount: listingPrice.fixedFeeAmount,
      saleFeeAmount: listingPrice.saleFeeAmount,
      freightFixedAmount: freightCost ?? undefined,
      sourceRef: listingPrice.sourceRef +
        (freightCost !== null && catalogDimensions ? ' +frete/catálogo' : freightCost !== null ? ' +frete/manual' : ''),
    }
  } catch (error) {
    return {
      ...base,
      status: 'error',
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      listingTypeId: LISTING_TYPE_ID,
      error: error instanceof Error ? error.message : 'Falha ao consultar listing_prices',
    }
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
    const resolved = previews.filter((preview) => preview.status === 'importable')
    const hasError = previews.some((preview) => preview.status === 'error')
    const hasMissing = previews.some((preview) => preview.status === 'missing')
    const sampleProducts = previews.slice(0, 5)
    const baseGroup = {
      groupId,
      groupName: previews[0]?.groupName ?? groupId,
      categoryLabel: 'Grupo',
      productCount: previews.length,
      resolvedProductCount: resolved.length,
      sampleProducts,
    }

    if (hasError || resolved.length === 0) {
      const target = hasError ? errorGroups : missingGroups
      target.push({
        ...baseGroup,
        status: hasError ? 'error' : 'missing',
        notes: buildNotes(previews),
      })
      continue
    }

    if (hasMissing) {
      missingGroups.push({
        ...baseGroup,
        status: 'missing',
        notes: buildNotes(previews),
      })
      continue
    }

    const signatureSet = new Set(
      resolved.map((preview) =>
        [
          preview.categoryId ?? '',
          preview.listingTypeId ?? '',
          (preview.commissionPercent ?? 0).toFixed(6),
          (preview.fixedFeeAmount ?? 0).toFixed(2),
        ].join('|')
      )
    )

    if (signatureSet.size > 1) {
      conflictGroups.push({
        ...baseGroup,
        status: 'conflict',
        notes: buildNotes(previews),
      })
      continue
    }

    const first = resolved[0]
    const freightAmounts = resolved
      .map((p) => p.freightFixedAmount)
      .filter((v): v is number => v !== undefined)
    const avgFreight =
      freightAmounts.length > 0
        ? freightAmounts.reduce((sum, v) => sum + v, 0) / freightAmounts.length
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
      notes: buildImportedGroupNotes(previews, first),
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
    .map((preview) => {
      const category = preview.categoryId ? `${preview.categoryId}` : 'sem categoria'
      const statusDetail = preview.error ?? preview.status
      return `${preview.sku}: ${category} (${statusDetail})`
    })
    .join(' | ')
}

function buildImportedGroupNotes(
  previews: MarketplaceCommissionImportProductPreview[],
  imported: MarketplaceCommissionImportProductPreview
): string {
  const sampleSkus = previews
    .filter((preview) => preview.status === 'importable')
    .slice(0, 5)
    .map((preview) => preview.sku)
    .join(', ')

  return `Importado via listing_prices em ${imported.categoryId} com ${previews.length} produto(s). Amostra: ${sampleSkus}`
}
