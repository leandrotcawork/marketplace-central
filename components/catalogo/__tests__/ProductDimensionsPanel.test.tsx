import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductDimensionsPanel } from '../ProductDimensionsPanel'

const product = {
  id: 'p1',
  sku: 'SKU-1',
  name: 'Produto 1',
  category: 'Outros',
  cost: 10,
  basePrice: 20,
  stock: 1,
  unit: 'un',
}

test('renders live suggestion and saves manual price', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { sku: 'SKU-1', minPrice: 99.9 } }),
  }) as any

  render(<ProductDimensionsPanel product={product as any} onClose={() => {}} />)

  await waitFor(() =>
    expect(screen.getByText(/MS\s+R\$\s*99,90/)).toBeInTheDocument()
  )

  const input = screen.getByLabelText('Preço sugerido manual (R$)')
  fireEvent.change(input, { target: { value: '120.00' } })
  fireEvent.blur(input)
  expect((input as HTMLInputElement).value).toBe('120.00')
})
