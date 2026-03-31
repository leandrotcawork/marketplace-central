export type ShopeeCommissionTier = {
  tierLabel: string
  commissionPercent: number
  fixedFeeAmount: number
  saleFeeAmount: number
}

const SHOPEE_TIERS: Array<{ maxPrice?: number; tierLabel: string; commissionPercent: number; fixedFeeAmount: number }> = [
  { maxPrice: 79.99, tierLabel: 'ATE_79_99', commissionPercent: 0.2, fixedFeeAmount: 4 },
  { maxPrice: 99.99, tierLabel: '80_A_99_99', commissionPercent: 0.14, fixedFeeAmount: 16 },
  { maxPrice: 199.99, tierLabel: '100_A_199_99', commissionPercent: 0.14, fixedFeeAmount: 20 },
  { maxPrice: 499.99, tierLabel: '200_A_499_99', commissionPercent: 0.14, fixedFeeAmount: 26 },
  { tierLabel: 'ACIMA_DE_500', commissionPercent: 0.14, fixedFeeAmount: 28 },
]

export function getShopeeCommissionForPrice(price: number): ShopeeCommissionTier {
  const tier = SHOPEE_TIERS.find((entry) => entry.maxPrice === undefined || price <= entry.maxPrice) ?? SHOPEE_TIERS[SHOPEE_TIERS.length - 1]
  const saleFeeAmount = Math.round((price * tier.commissionPercent + tier.fixedFeeAmount) * 100) / 100
  return { ...tier, saleFeeAmount }
}
