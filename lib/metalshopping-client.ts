import { query } from './db'

export interface RawProductRow {
  product_id: string
  sku: string
  name: string
  status: string
  cost?: number
  base_price?: number
  stock?: number
  referencia?: string
  ean?: string
}

const BASE_SELECT = `
  SELECT
    cp.product_id,
    cp.sku,
    cp.name,
    cp.status,
    COALESCE(ppp.replacement_cost_amount, ppp.average_cost_amount, 0) as cost,
    COALESCE(ppp.price_amount, 0) as base_price,
    COALESCE(ipp.on_hand_quantity, 0) as stock,
    MAX(CASE WHEN pi.identifier_type = 'reference' THEN pi.identifier_value END) as referencia,
    MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean
  FROM catalog_products cp
  LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
    AND ppp.pricing_status = 'active'
    AND ppp.effective_to IS NULL
  LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
    AND ipp.position_status = 'active'
    AND ipp.effective_to IS NULL
  LEFT JOIN catalog_product_identifiers pi ON cp.product_id = pi.product_id
`

const BASE_GROUP_BY = `
  GROUP BY
    cp.product_id,
    cp.sku,
    cp.name,
    cp.status,
    ppp.replacement_cost_amount,
    ppp.average_cost_amount,
    ppp.price_amount,
    ipp.on_hand_quantity
`

/**
 * Fetch all active products from MetalShopping catalog
 */
export async function fetchAllProducts(tenantId?: string): Promise<RawProductRow[]> {
  const sql = `
    ${BASE_SELECT}
    WHERE cp.status = 'active'
    ${BASE_GROUP_BY}
    ORDER BY cp.name, cp.sku
  `
  const result = await query(sql, [], tenantId)
  return result.rows as RawProductRow[]
}

/**
 * Fetch a single product by ID
 */
export async function fetchProductById(
  productId: string,
  tenantId?: string
): Promise<RawProductRow | null> {
  const sql = `
    ${BASE_SELECT}
    WHERE cp.product_id = $1
    ${BASE_GROUP_BY}
  `
  const result = await query(sql, [productId], tenantId)
  return (result.rows[0] || null) as RawProductRow | null
}

/**
 * Search products by name, SKU, referencia, or EAN
 */
export async function searchProducts(
  searchTerm: string,
  tenantId?: string
): Promise<RawProductRow[]> {
  const searchPattern = `%${searchTerm}%`

  const sql = `
    ${BASE_SELECT}
    WHERE cp.status = 'active' AND (
      cp.name ILIKE $1
      OR cp.sku ILIKE $1
      OR pi.identifier_value ILIKE $1
    )
    ${BASE_GROUP_BY}
    ORDER BY cp.name, cp.sku
  `
  const result = await query(sql, [searchPattern], tenantId)
  return result.rows as RawProductRow[]
}

/**
 * Fetch products by specific product IDs
 */
export async function fetchProductsByIds(
  productIds: string[],
  tenantId?: string
): Promise<RawProductRow[]> {
  if (productIds.length === 0) return []

  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',')

  const sql = `
    ${BASE_SELECT}
    WHERE cp.product_id IN (${placeholders})
    ${BASE_GROUP_BY}
    ORDER BY cp.name, cp.sku
  `
  const result = await query(sql, productIds, tenantId)
  return result.rows as RawProductRow[]
}
