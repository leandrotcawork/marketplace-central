import type { Product } from '@/types'
import type { RawProductRow } from './metalshopping-client'

/**
 * Transform MetalShopping database rows into marketplace-central Product objects
 * Handles null/missing values gracefully
 */
export function mapProductFromDatabase(row: RawProductRow): Product {
  return {
    id: row.product_id || '',
    sku: row.sku || '',
    referencia: row.referencia || undefined,
    ean: row.ean || undefined,
    name: row.name || '',
    category: 'Uncategorized', // TODO: fetch from catalog_categories if available
    cost: normalizeNumber(row.cost) || 0,
    basePrice: normalizeNumber(row.base_price) || 0,
    stock: normalizeNumber(row.stock) || 0,
    unit: 'un', // TODO: fetch from catalog_products.unit_type if available
  }
}

/**
 * Transform multiple database rows into Product objects
 */
export function mapProductsFromDatabase(rows: RawProductRow[]): Product[] {
  return rows.map(mapProductFromDatabase).filter((product) => product.id)
}

/**
 * Normalize numeric values from database
 * Handles strings, nulls, and ensures proper numeric type
 */
function normalizeNumber(value: any): number {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'number') {
    return value
  }
  return 0
}

/**
 * Validate that a product has required fields
 */
export function isValidProduct(product: Product): boolean {
  return (
    !!product.id &&
    !!product.sku &&
    !!product.name &&
    typeof product.cost === 'number' &&
    typeof product.basePrice === 'number' &&
    typeof product.stock === 'number'
  )
}
