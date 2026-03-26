import { query } from './db'
import type { Product } from '@/types'

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

/**
 * Fetch all products from MetalShopping catalog with pricing and inventory
 * Includes referencia and EAN from product_identifiers
 */
export async function fetchAllProducts(tenantId?: string): Promise<RawProductRow[]> {
  const sql = `
    SELECT DISTINCT
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      COALESCE(ppp.price, 0) as cost,
      COALESCE(ppp.price, 0) as base_price,
      COALESCE(SUM(ipp.quantity), 0) as stock,
      MAX(CASE WHEN pi.identifier_type = 'referencia' THEN pi.identifier_value END) as referencia,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean
    FROM catalog_products cp
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.is_active = true
      AND ppp.deleted_at IS NULL
    LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
      AND ipp.deleted_at IS NULL
    LEFT JOIN product_identifiers pi ON cp.product_id = pi.product_id
      AND pi.deleted_at IS NULL
    WHERE cp.deleted_at IS NULL
    GROUP BY
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      ppp.price
    ORDER BY cp.name, cp.sku
  `

  const result = await query(sql, [], tenantId)
  return result.rows as RawProductRow[]
}

/**
 * Fetch a single product by ID with all related data
 */
export async function fetchProductById(
  productId: string,
  tenantId?: string
): Promise<RawProductRow | null> {
  const sql = `
    SELECT DISTINCT
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      COALESCE(ppp.price, 0) as cost,
      COALESCE(ppp.price, 0) as base_price,
      COALESCE(SUM(ipp.quantity), 0) as stock,
      MAX(CASE WHEN pi.identifier_type = 'referencia' THEN pi.identifier_value END) as referencia,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean
    FROM catalog_products cp
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.is_active = true
      AND ppp.deleted_at IS NULL
    LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
      AND ipp.deleted_at IS NULL
    LEFT JOIN product_identifiers pi ON cp.product_id = pi.product_id
      AND pi.deleted_at IS NULL
    WHERE cp.product_id = $1 AND cp.deleted_at IS NULL
    GROUP BY
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      ppp.price
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
    SELECT DISTINCT
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      COALESCE(ppp.price, 0) as cost,
      COALESCE(ppp.price, 0) as base_price,
      COALESCE(SUM(ipp.quantity), 0) as stock,
      MAX(CASE WHEN pi.identifier_type = 'referencia' THEN pi.identifier_value END) as referencia,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean
    FROM catalog_products cp
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.is_active = true
      AND ppp.deleted_at IS NULL
    LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
      AND ipp.deleted_at IS NULL
    LEFT JOIN product_identifiers pi ON cp.product_id = pi.product_id
      AND pi.deleted_at IS NULL
    WHERE cp.deleted_at IS NULL AND (
      cp.name ILIKE $1
      OR cp.sku ILIKE $1
      OR pi.identifier_value ILIKE $1
    )
    GROUP BY
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      ppp.price
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
  if (productIds.length === 0) {
    return []
  }

  // Create $1, $2, $3... placeholders
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',')

  const sql = `
    SELECT DISTINCT
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      COALESCE(ppp.price, 0) as cost,
      COALESCE(ppp.price, 0) as base_price,
      COALESCE(SUM(ipp.quantity), 0) as stock,
      MAX(CASE WHEN pi.identifier_type = 'referencia' THEN pi.identifier_value END) as referencia,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean
    FROM catalog_products cp
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.is_active = true
      AND ppp.deleted_at IS NULL
    LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
      AND ipp.deleted_at IS NULL
    LEFT JOIN product_identifiers pi ON cp.product_id = pi.product_id
      AND pi.deleted_at IS NULL
    WHERE cp.product_id IN (${placeholders}) AND cp.deleted_at IS NULL
    GROUP BY
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      ppp.price
    ORDER BY cp.name, cp.sku
  `

  const result = await query(sql, productIds, tenantId)
  return result.rows as RawProductRow[]
}
