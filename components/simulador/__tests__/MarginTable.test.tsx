import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@/lib/sqlite-storage', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}))

import { MarginTable } from '../MarginTable'
import { useProductSuggestedPriceStore } from '@/stores/productSuggestedPriceStore'
import { useProductStore } from '@/stores/productStore'

const product = {
  id: 'p1',
  sku: 'SKU-1',
  name: 'Produto 1',
  category: 'Outros',
  cost: 10,
  basePrice: 20,
  stock: 1,
  unit: 'un',
  ean: '7891234567890',
  referencia: 'REF-001',
  msPriceSuggestion: 99,
}

test('uses manual suggestion over MS when applying suggestions', async () => {
  await useProductStore.persist.rehydrate()
  await useProductSuggestedPriceStore.persist.rehydrate()

  useProductStore.getState().importFromXLSX([product])
  useProductSuggestedPriceStore.getState().clearAll()
  useProductSuggestedPriceStore.getState().setSuggestedPrice('p1', 120)

  render(<MarginTable />)

  const button = screen.getByRole('button', { name: /Usar sugest/ })
  fireEvent.click(button)

  // Expect price cell to reflect 120 instead of 99
  const matches = await screen.findAllByText(/R\$\s*120,00/)
  expect(matches.length).toBeGreaterThan(0)
})

test('renders EAN and Ref lines under SKU when present', async () => {
  await useProductStore.persist.rehydrate()

  useProductStore.getState().importFromXLSX([product])

  render(<MarginTable />)

  expect(screen.getByText('EAN: 7891234567890')).toBeInTheDocument()
  expect(screen.getByText('Ref: REF-001')).toBeInTheDocument()
})
