import { NextResponse, type NextRequest } from 'next/server'
import { fetchPriceSuggestionsBySKUs } from '@/lib/metalshopping-client'
import type { MetalshoppingPriceSuggestion } from '@/types'

type RouteContext = { params: Promise<{ sku: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { sku } = await context.params
    const normalized = String(sku || '').trim()
    if (!normalized) {
      return NextResponse.json(
        { success: false, error: 'SKU param is required' },
        { status: 400 }
      )
    }

    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const rows = await fetchPriceSuggestionsBySKUs([normalized], tenantId)
    const first = rows[0]

    if (!first) {
      return NextResponse.json({ success: true, data: null })
    }

    const data: MetalshoppingPriceSuggestion = {
      sku: String(first.sku),
      minPrice: Number(first.min_price),
      ...(first.observed_at ? { observedAt: String(first.observed_at) } : {}),
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
