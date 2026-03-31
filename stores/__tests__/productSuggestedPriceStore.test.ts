import { act } from 'react'
import { useProductSuggestedPriceStore } from '../productSuggestedPriceStore'

test('set/get/delete manual suggested price', () => {
  act(() => {
    useProductSuggestedPriceStore.getState().setSuggestedPrice('p1', 123.45)
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBe(123.45)

  act(() => {
    useProductSuggestedPriceStore.getState().deleteSuggestedPrice('p1')
  })
  expect(useProductSuggestedPriceStore.getState().getSuggestedPrice('p1')).toBeUndefined()
})
