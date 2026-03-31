import { NextRequest } from 'next/server'
import { POST } from './route'

function mockRequest(body: unknown) {
  return new NextRequest('http://localhost/api/marketplace-commission-import/shopee', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

test('POST returns 400 when no product has a valid taxonomy group', async () => {
  const res = await POST(mockRequest({ products: [] }))

  expect(res.status).toBe(400)
})

test('POST returns an importable Shopee preview for valid products', async () => {
  const res = await POST(
    mockRequest({
      products: [
        {
          id: 'p1',
          sku: 'SKU-1',
          name: 'Produto 1',
          category: 'Pisos',
          basePrice: 99.99,
          primaryTaxonomyNodeId: 'group-1',
          primaryTaxonomyGroupName: 'Pisos',
        },
        {
          id: 'p2',
          sku: 'SKU-2',
          name: 'Produto 2',
          category: 'Pisos',
          basePrice: 149.99,
          primaryTaxonomyNodeId: 'group-2',
          primaryTaxonomyGroupName: 'Pisos',
        },
      ],
    })
  )

  expect(res.status).toBe(200)
  const payload = await res.json()
  expect(payload.success).toBe(true)
  expect(payload.data.channelId).toBe('shopee')
  expect(payload.data.productPreviews).toHaveLength(2)
})
