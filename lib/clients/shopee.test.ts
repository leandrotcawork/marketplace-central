import { expect, test } from 'vitest'
import { getShopeeCommissionForPrice } from './shopee'

test.each([
  [79.99, { tierLabel: '<= 79.99', commissionPercent: 0.2, fixedFeeAmount: 4, saleFeeAmount: 20 }],
  [80, { tierLabel: '80-99.99', commissionPercent: 0.14, fixedFeeAmount: 16, saleFeeAmount: 27.2 }],
  [99.99, { tierLabel: '80-99.99', commissionPercent: 0.14, fixedFeeAmount: 16, saleFeeAmount: 30 }],
  [100, { tierLabel: '100-199.99', commissionPercent: 0.14, fixedFeeAmount: 20, saleFeeAmount: 34 }],
  [199.99, { tierLabel: '100-199.99', commissionPercent: 0.14, fixedFeeAmount: 20, saleFeeAmount: 48 }],
  [200, { tierLabel: '200-499.99', commissionPercent: 0.14, fixedFeeAmount: 26, saleFeeAmount: 54 }],
  [499.99, { tierLabel: '200-499.99', commissionPercent: 0.14, fixedFeeAmount: 26, saleFeeAmount: 96 }],
  [500, { tierLabel: '>= 500', commissionPercent: 0.14, fixedFeeAmount: 26, saleFeeAmount: 96 }],
])('resolves Shopee commission tiers for base price %s', (basePrice, expected) => {
  expect(getShopeeCommissionForPrice(basePrice)).toEqual(expected)
})
