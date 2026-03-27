import { type NextRequest } from 'next/server'
import { fetchGroupRepresentativesWithEan } from '@/lib/metalshopping-client'

/**
 * GET /api/products/group-representatives?productIds=id1,id2,...
 *
 * Returns one product per taxonomy group (level 0) that has an EAN available,
 * filtered to only products within the given set (classification scope).
 *
 * Query parameters:
 * - productIds: comma-separated product IDs (required)
 * - tenantId: override default tenant ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const productIdsParam = searchParams.get('productIds')
    const tenantId = searchParams.get('tenantId') || undefined

    if (!productIdsParam) {
      return Response.json(
        { success: false, error: 'productIds query parameter is required' },
        { status: 400 }
      )
    }

    const productIds = productIdsParam.split(',').filter(Boolean)

    if (productIds.length === 0) {
      return Response.json(
        { success: false, error: 'productIds must contain at least one ID' },
        { status: 400 }
      )
    }

    const rows = await fetchGroupRepresentativesWithEan(productIds, tenantId)

    const representatives = rows.map((row) => ({
      grupo: row.taxonomy_group,
      pn: row.sku,
      ean: row.ean,
      referencia: row.referencia ?? null,
      productId: row.product_id,
      name: row.name,
      cost: row.cost,
      basePrice: row.base_price,
      stock: row.stock,
    }))

    return Response.json(
      {
        success: true,
        data: representatives,
        count: representatives.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching group representatives:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch group representatives',
      },
      { status: 500 }
    )
  }
}
