import { NextResponse, type NextRequest } from 'next/server'
import { fetchPriceSuggestionsBySKUs } from '@/lib/metalshopping-client'
import type { MetalshoppingPriceSuggestion } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as { skus?: unknown }

    if (!Array.isArray(body.skus) || body.skus.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Body must include a non-empty skus array' },
        { status: 400 }
      )
    }

    const skus = (body.skus as unknown[])
      .map(String)
      .filter((s) => s.length > 0)
      .slice(0, 500)

    const rows = await fetchPriceSuggestionsBySKUs(skus, tenantId)

    const data: MetalshoppingPriceSuggestion[] = rows.map((row) => ({
      sku: row.sku,
      minPrice: Number(row.min_price),
      ...(row.observed_at ? { observedAt: String(row.observed_at) } : {}),
    }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
