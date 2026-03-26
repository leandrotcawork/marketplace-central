import { NextRequest, NextResponse } from 'next/server'
import { fetchAllProducts, searchProducts, fetchProductsByIds } from '@/lib/metalshopping-client'
import { mapProductsFromDatabase } from '@/lib/product-mapper'

/**
 * GET /api/products
 *
 * Query parameters:
 * - search: search term (by name, SKU, referencia, EAN)
 * - ids: comma-separated product IDs
 * - tenantId: override default tenant ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const idsParam = searchParams.get('ids')
    const tenantId = searchParams.get('tenantId')

    let products

    if (idsParam) {
      // Fetch specific products by IDs
      const ids = idsParam.split(',').filter(Boolean)
      products = await fetchProductsByIds(ids, tenantId || undefined)
    } else if (search) {
      // Search products
      products = await searchProducts(search, tenantId || undefined)
    } else {
      // Fetch all products
      products = await fetchAllProducts(tenantId || undefined)
    }

    const mapped = mapProductsFromDatabase(products)

    return NextResponse.json(
      {
        success: true,
        data: mapped,
        count: mapped.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching products:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch products',
      },
      { status: 500 }
    )
  }
}
