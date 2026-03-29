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
const ALLOWED_LISTING_TYPES = ['gold_special', 'gold_pro'] as const
type MeLiListingTypeId = (typeof ALLOWED_LISTING_TYPES)[number]

type ImportRequestBody = {
  products?: Product[]
  /**
   * Listing type to use for commission calculation.
   * gold_special = Clássico Full (~11-14% depending on category)
   * gold_pro     = Premium (~16-17%)
   * Defaults to 'gold_special' when omitted.
   */
  listingTypeId?: MeLiListingTypeId
  /**
   * Optional default dimensions for shipping cost calculation.
   * Format: "HxWxL,weight_grams" — e.g. "10x60x60,25000" for a 25 kg tile.
   * When provided, ML's /shipping_options/free is called per product to populate freightFixedAmount.
   */
  dimensions?: string
  /**
   * Per-product dimensions from the local store (productDimensionsStore).
   * Map of productId → "HxWxL,weight_grams" string.
   * Takes precedence over global `dimensions` and ML catalog lookup.
   */
  productDimensions?: Record<string, string>
  /**
   * Per-product ML category overrides from the local store (productCategoryStore).
   * Map of productId → { categoryId, categoryName }.
   * When present, skips domain_discovery entirely for that product.
   */
  productCategories?: Record<string, { categoryId: string; categoryName?: string }>
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as ImportRequestBody
    const scopedProducts = (body.products ?? []).filter(hasImportableGroup)
    const dimensions = body.dimensions?.trim() || undefined
    const productDimensions = body.productDimensions ?? {}
    const productCategories = body.productCategories ?? {}
    const listingTypeId: MeLiListingTypeId =
      body.listingTypeId && ALLOWED_LISTING_TYPES.includes(body.listingTypeId)
        ? body.listingTypeId
        : 'gold_special'

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
      const perProductDims = productDimensions[product.id] || undefined
      const categoryOverride = productCategories[product.id] || undefined
      const preview = await buildProductPreview(client, product, perProductDims ?? dimensions, listingTypeId, categoryOverride)
      productPreviews.push(preview)
    }

    const result = buildImportResult(productPreviews, listingTypeId)

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
  dimensions?: string,
  listingTypeId: MeLiListingTypeId = 'gold_special',
  categoryOverride?: { categoryId: string; categoryName?: string }
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

  // Use stored category override if available, otherwise call domain_discovery
  let suggestion: { categoryId: string; categoryName?: string } | null = categoryOverride ?? null
  let catalogDimensions: string | null = null
  let usedOverride = !!categoryOverride

  if (!suggestion) {
    const [discovered, catDims] = await Promise.all([
      client.suggestCategoryDetailed(product.name),
      !dimensions && product.ean
        ? client.getCatalogDimensions(product.ean)
        : Promise.resolve(null),
    ])
    suggestion = discovered
    catalogDimensions = catDims
  }

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
        listingTypeId,
      }),
      effectiveDimensions
        ? client.getSellerShippingCost({ dimensions: effectiveDimensions, itemPrice: product.basePrice, listingTypeId })
        : Promise.resolve(null),
    ])

    const freteSource = freightCost !== null
      ? (catalogDimensions ? ' +frete/catálogo' : ' +frete/manual')
      : ''

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
      sourceRef: listingPrice.sourceRef + (usedOverride ? ' (cat/cache)' : '') + freteSource,
    }
  } catch (error) {
    return {
      ...base,
      status: 'error',
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      listingTypeId,
      error: error instanceof Error ? error.message : 'Falha ao consultar listing_prices',
    }
  }
}

function buildImportResult(
  productPreviews: MarketplaceCommissionImportProductPreview[],
  listingTypeId: MeLiListingTypeId = 'gold_special'
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

    if (resolved.length === 0) {
      const target = hasError ? errorGroups : missingGroups
      target.push({
        ...baseGroup,
        status: hasError ? 'error' : 'missing',
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
      notes: buildImportedGroupNotes(previews, first, hasMissing),
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
    listingTypeId,
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
  imported: MarketplaceCommissionImportProductPreview,
  hasMissing: boolean
): string {
  const importable = previews.filter((preview) => preview.status === 'importable')
  const missing = previews.filter((preview) => preview.status === 'missing')
  const sampleSkus = importable.slice(0, 5).map((preview) => preview.sku).join(', ')

  const base = `Importado via listing_prices em ${imported.categoryId} com ${importable.length}/${previews.length} produto(s). Amostra: ${sampleSkus}`
  return hasMissing
    ? `${base} | ${missing.length} produto(s) sem categoria (excluídos do cálculo)`
    : base
}
