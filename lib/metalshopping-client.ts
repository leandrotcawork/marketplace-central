import { query } from './db'

export interface RawPriceSuggestionRow {
  sku: string
  min_price: number
  observed_at?: string
}

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
  primary_taxonomy_node_id?: string
  taxonomy_group?: string
}

export interface RawTaxonomyGroupRow {
  taxonomy_node_id: string
  name: string
  level: number
  level_label: string
  product_ids: string[]
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
    MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean,
    cp.primary_taxonomy_node_id,
    ctn.name as taxonomy_group
  FROM catalog_products cp
  LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
    AND ppp.pricing_status = 'active'
    AND ppp.effective_to IS NULL
  LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
    AND ipp.position_status = 'active'
    AND ipp.effective_to IS NULL
  LEFT JOIN catalog_product_identifiers pi ON cp.product_id = pi.product_id
  LEFT JOIN catalog_taxonomy_nodes ctn ON cp.primary_taxonomy_node_id = ctn.taxonomy_node_id
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
    ipp.on_hand_quantity,
    cp.primary_taxonomy_node_id,
    ctn.name
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

/**
 * Fetch one representative product per taxonomy group (level 0) that has an EAN,
 * filtered to only products whose IDs are in the given set (classification scope).
 */
export async function fetchGroupRepresentativesWithEan(
  productIds: string[],
  tenantId?: string
): Promise<RawProductRow[]> {
  if (productIds.length === 0) return []

  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',')

  const sql = `
    SELECT DISTINCT ON (ctn.name)
      cp.product_id,
      cp.sku,
      cp.name,
      cp.status,
      COALESCE(ppp.replacement_cost_amount, ppp.average_cost_amount, 0) as cost,
      COALESCE(ppp.price_amount, 0) as base_price,
      COALESCE(ipp.on_hand_quantity, 0) as stock,
      MAX(CASE WHEN pi.identifier_type = 'reference' THEN pi.identifier_value END)
        OVER (PARTITION BY cp.product_id) as referencia,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END)
        OVER (PARTITION BY cp.product_id) as ean,
      cp.primary_taxonomy_node_id,
      ctn.name as taxonomy_group
    FROM catalog_products cp
    JOIN catalog_taxonomy_nodes ctn
      ON ctn.taxonomy_node_id = cp.primary_taxonomy_node_id
      AND ctn.level = 0
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.pricing_status = 'active'
      AND ppp.effective_to IS NULL
    LEFT JOIN inventory_product_positions ipp ON cp.product_id = ipp.product_id
      AND ipp.position_status = 'active'
      AND ipp.effective_to IS NULL
    LEFT JOIN catalog_product_identifiers pi ON cp.product_id = pi.product_id
    WHERE cp.product_id IN (${placeholders})
      AND cp.status = 'active'
      AND EXISTS (
        SELECT 1 FROM catalog_product_identifiers ean_check
        WHERE ean_check.product_id = cp.product_id
          AND ean_check.identifier_type = 'ean'
          AND ean_check.identifier_value IS NOT NULL
          AND ean_check.identifier_value <> ''
      )
    ORDER BY ctn.name, cp.sku
  `
  const result = await query(sql, productIds, tenantId)
  return result.rows as RawProductRow[]
}

/**
 * Fetch all taxonomy nodes with product counts from MetalShopping
 */
export async function fetchTaxonomyGroups(tenantId?: string): Promise<RawTaxonomyGroupRow[]> {
  const sql = `
    SELECT
      ctn.taxonomy_node_id,
      ctn.name,
      ctn.level,
      COALESCE(ctld.label, 'Grupo') as level_label,
      COALESCE(
        array_agg(cp.product_id ORDER BY cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL),
        '{}'
      ) as product_ids
    FROM catalog_taxonomy_nodes ctn
    LEFT JOIN catalog_taxonomy_level_defs ctld ON ctn.level = ctld.level
    LEFT JOIN catalog_products cp
      ON cp.primary_taxonomy_node_id = ctn.taxonomy_node_id
      AND cp.status = 'active'
    WHERE ctn.is_active = true
    GROUP BY ctn.taxonomy_node_id, ctn.name, ctn.level, ctld.label
    ORDER BY ctn.level, ctn.name
  `
  const result = await query(sql, [], tenantId)
  return result.rows as RawTaxonomyGroupRow[]
}

/**
 * Fetch minimum observed competitor prices for a list of SKUs.
 * Joins catalog_products (by sku) → shopping_price_latest_snapshot (by product_id)
 * and returns MIN(observed_price) per SKU.
 */
export async function fetchPriceSuggestionsBySKUs(
  skus: string[],
  tenantId?: string
): Promise<RawPriceSuggestionRow[]> {
  if (skus.length === 0) return []

  const placeholders = skus.map((_, i) => `$${i + 1}`).join(', ')

  const sql = `
    SELECT
      cp.sku,
      MIN(spls.observed_price) AS min_price,
      MAX(spls.observed_at) AS observed_at
    FROM catalog_products cp
    JOIN shopping_price_latest_snapshot spls ON spls.product_id = cp.product_id
    WHERE cp.sku IN (${placeholders})
      AND spls.observed_price IS NOT NULL
      AND spls.observed_price > 0
    GROUP BY cp.sku
  `
  const result = await query(sql, skus, tenantId)
  return result.rows as RawPriceSuggestionRow[]
}
