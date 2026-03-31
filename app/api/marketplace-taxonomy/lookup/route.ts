import { NextResponse } from 'next/server'
import { getProductTaxonomy } from '@/lib/marketplace-taxonomy-db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const marketplaceId = searchParams.get('marketplaceId') || ''
  const sku = searchParams.get('sku') || ''
  if (!marketplaceId || !sku) {
    return NextResponse.json({ error: 'marketplaceId and sku required' }, { status: 400 })
  }

  const row = await getProductTaxonomy(marketplaceId, sku)
  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({ data: row })
}
