import { resolveCommercialTerms } from '@/lib/marketplace-commercial'
import type {
  MarginResult,
  Marketplace,
  MarketplaceCommissionRule,
  MarketplaceProductImportOverride,
  Product,
} from '@/types'

export function getMarginHealth(marginPercent: number): 'good' | 'warning' | 'critical' {
  if (marginPercent >= 20) return 'good'
  if (marginPercent >= 10) return 'warning'
  return 'critical'
}

export function calculateMargin(
  sellingPrice: number,
  cost: number,
  commission: number,
  fixedFee: number,
  freightFixed = 0
): Pick<
  MarginResult,
  | 'commission'
  | 'commissionAmount'
  | 'fixedFeeAmount'
  | 'freightFixedAmount'
  | 'totalFees'
  | 'margin'
  | 'marginPercent'
  | 'health'
> {
  const commissionAmount = sellingPrice * commission
  const totalFees = commissionAmount + fixedFee + freightFixed
  const margin = sellingPrice - cost - totalFees
  const marginPercent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0
  const health = getMarginHealth(marginPercent)

  return {
    commission,
    commissionAmount,
    fixedFeeAmount: fixedFee,
    freightFixedAmount: freightFixed,
    totalFees,
    margin,
    marginPercent,
    health,
  }
}

export function calculateMarginForMarketplace(
  product: Product,
  marketplace: Marketplace,
  rules: MarketplaceCommissionRule[],
  sellingPrice = product.basePrice
): MarginResult {
  const terms = resolveCommercialTerms(product, marketplace, rules)
  const base = calculateMargin(
    sellingPrice,
    product.cost,
    terms.commissionPercent,
    terms.fixedFeeAmount,
    terms.freightFixedAmount
  )

  return {
    productId: product.id,
    productGroupId: terms.groupId ?? product.primaryTaxonomyNodeId,
    marketplaceId: marketplace.id,
    sellingPrice,
    commission: base.commission,
    commissionAmount: base.commissionAmount,
    fixedFeeAmount: base.fixedFeeAmount,
    freightFixedAmount: base.freightFixedAmount,
    totalFees: base.totalFees,
    margin: base.margin,
    marginPercent: base.marginPercent,
    health: base.health,
    ruleType: terms.ruleType,
    reviewStatus: terms.reviewStatus,
    sourceType: terms.sourceType,
  }
}

/**
 * Resolves product margin using the full cascade:
 * 1. Per-product import override (if importable)
 * 2. Group-level commission rule
 * 3. Marketplace base commercial profile
 */
export function resolveProductMargin(
  product: Product,
  marketplace: Marketplace,
  rules: MarketplaceCommissionRule[],
  overrides: Record<string, Record<string, MarketplaceProductImportOverride>>,
  sellingPrice = product.basePrice
): MarginResult {
  const override = overrides[marketplace.id]?.[product.id]
  if (override?.status === 'importable') {
    const base = calculateMargin(
      sellingPrice,
      product.cost,
      override.commissionPercent ?? 0,
      override.fixedFeeAmount ?? 0,
      override.freightFixedAmount ?? 0
    )
    return {
      ...base,
      productId: product.id,
      productGroupId: product.primaryTaxonomyNodeId,
      marketplaceId: marketplace.id,
      sellingPrice,
      ruleType: 'group_override',
      reviewStatus: 'validated',
      sourceType: 'official_doc',
    }
  }
  return calculateMarginForMarketplace(product, marketplace, rules, sellingPrice)
}

export function calculateAllMargins(
  products: Product[],
  marketplaces: Marketplace[],
  rules: MarketplaceCommissionRule[] = []
): MarginResult[] {
  const results: MarginResult[] = []

  for (const product of products) {
    for (const marketplace of marketplaces) {
      if (!marketplace.active) continue
      results.push(calculateMarginForMarketplace(product, marketplace, rules))
    }
  }

  return results
}
