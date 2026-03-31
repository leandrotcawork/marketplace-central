type ShopeeCommissionResult = {
  commissionPercent: number
  fixedFeeAmount: number
  saleFeeAmount: number
  tierLabel: string
}

export function getShopeeCommissionForPrice(basePrice: number): ShopeeCommissionResult {
  if (basePrice <= 79.99) {
    return buildShopeeCommissionResult(basePrice, 0.2, 4, '<= 79.99')
  }

  if (basePrice <= 99.99) {
    return buildShopeeCommissionResult(basePrice, 0.14, 16, '80-99.99')
  }

  if (basePrice <= 199.99) {
    return buildShopeeCommissionResult(basePrice, 0.14, 20, '100-199.99')
  }

  if (basePrice <= 499.99) {
    return buildShopeeCommissionResult(basePrice, 0.14, 26, '200-499.99')
  }

  return buildShopeeCommissionResult(basePrice, 0.14, 26, '>= 500')
}

function buildShopeeCommissionResult(
  basePrice: number,
  commissionPercent: number,
  fixedFeeAmount: number,
  tierLabel: string,
): ShopeeCommissionResult {
  const saleFeeAmount = Math.round((basePrice * commissionPercent + fixedFeeAmount) * 100) / 100

  return {
    commissionPercent,
    fixedFeeAmount,
    saleFeeAmount,
    tierLabel,
  }
}
