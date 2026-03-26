import type { MarginResult, Product, Marketplace } from '@/types'

export function getMarginHealth(marginPercent: number): 'good' | 'warning' | 'critical' {
  if (marginPercent >= 20) return 'good'
  if (marginPercent >= 10) return 'warning'
  return 'critical'
}

export function calculateMargin(
  sellingPrice: number,
  cost: number,
  commission: number,
  fixedFee: number
): Pick<MarginResult, 'margin' | 'marginPercent' | 'health'> {
  const margin = sellingPrice - cost - sellingPrice * commission - fixedFee
  const marginPercent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0
  const health = getMarginHealth(marginPercent)
  return { margin, marginPercent, health }
}

export function calculateAllMargins(
  products: Product[],
  marketplaces: Marketplace[]
): MarginResult[] {
  const results: MarginResult[] = []

  for (const product of products) {
    for (const marketplace of marketplaces) {
      if (!marketplace.active) continue
      const { margin, marginPercent, health } = calculateMargin(
        product.basePrice,
        product.cost,
        marketplace.commission,
        marketplace.fixedFee
      )
      results.push({
        productId: product.id,
        marketplaceId: marketplace.id,
        sellingPrice: product.basePrice,
        commission: marketplace.commission,
        margin,
        marginPercent,
        health,
      })
    }
  }

  return results
}
