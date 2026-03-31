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

test('POST returns 400 when products is empty', async () => {
  const res = await POST(mockRequest({ products: [] }))

  expect(res.status).toBe(400)
})

test('POST returns importable Shopee previews for valid products', async () => {
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
          primaryTaxonomyNodeId: 'group-1',
          primaryTaxonomyGroupName: 'Pisos',
        },
      ],
    })
  )

  const payload = await res.json()

  expect(res.status).toBe(200)
  expect(payload).toMatchObject({
    success: true,
    data: {
      channelId: 'shopee',
      productPreviews: expect.any(Array),
    },
  })
  expect(payload.data.productPreviews).toHaveLength(2)
})

test('POST groups mixed Shopee commission tiers as conflict', async () => {
  const res = await POST(
    mockRequest({
      products: [
        {
          id: 'p1',
          sku: 'SKU-1',
          name: 'Produto 1',
          category: 'Pisos',
          basePrice: 79.99,
          primaryTaxonomyNodeId: 'group-1',
          primaryTaxonomyGroupName: 'Pisos',
        },
        {
          id: 'p2',
          sku: 'SKU-2',
          name: 'Produto 2',
          category: 'Pisos',
          basePrice: 99.99,
          primaryTaxonomyNodeId: 'group-1',
          primaryTaxonomyGroupName: 'Pisos',
        },
      ],
    })
  )

  const payload = await res.json()

  expect(res.status).toBe(200)
  expect(payload.data.conflictGroups).toHaveLength(1)
  expect(payload.data.importedGroups).toHaveLength(0)
  expect(payload.data.conflictGroups[0].notes).toContain('%')
})
