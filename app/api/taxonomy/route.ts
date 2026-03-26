import { NextRequest, NextResponse } from 'next/server'
import { fetchTaxonomyGroups } from '@/lib/metalshopping-client'
import type { Group } from '@/types'

/**
 * GET /api/taxonomy
 *
 * Returns taxonomy nodes from MetalShopping as Group objects.
 *
 * Query parameters:
 * - tenantId: override default tenant ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId')

    const rows = await fetchTaxonomyGroups(tenantId || undefined)

    const syncedAt = new Date().toISOString()

    const groups: Group[] = rows.map((row) => ({
      id: row.taxonomy_node_id,
      name: row.name,
      level: row.level,
      levelLabel: row.level_label,
      productIds: Array.isArray(row.product_ids) ? row.product_ids : [],
      syncedAt,
    }))

    return NextResponse.json(
      {
        success: true,
        data: groups,
        count: groups.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching taxonomy groups:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch taxonomy groups',
      },
      { status: 500 }
    )
  }
}
