import { act } from 'react'
import { vi } from 'vitest'
import { useProductSuggestedPriceStore } from '../productSuggestedPriceStore'

test('set/get/delete manual suggested price', () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ value: null }),
  }) as any

  act(() => {
    useProductSuggestedPriceStore.getState().setSuggestedPrice('p1', 123.45)
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBe(123.45)

  act(() => {
    useProductSuggestedPriceStore.getState().clearAll()
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBeUndefined()

  act(() => {
    useProductSuggestedPriceStore.getState().deleteSuggestedPrice('p1')
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBeUndefined()
})
