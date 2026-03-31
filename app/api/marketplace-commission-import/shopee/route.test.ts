import { NextRequest } from 'next/server'
import { POST } from './route'

function mockRequest(body: unknown) {
  return new NextRequest('http://localhost/api/marketplace-commission-import/shopee', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

test('POST returns 400 when no product has a valid taxonomy group', async () => {
  const res = await POST(mockRequest({ products: [{ id: 'p1', sku: 'SKU-1' }] }))

  expect(res.status).toBe(400)
  await expect(res.json()).resolves.toMatchObject({
    success: false,
    error: 'Nenhum produto com grupo taxonomico valido foi enviado para importacao',
  })
})

test('POST returns an importable Shopee preview for a valid product', async () => {
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
      ],
    })
  )

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toMatchObject({
    success: true,
    data: {
      channelId: 'shopee',
      listingTypeId: 'contract',
      importedGroups: [
        expect.objectContaining({
          groupId: 'group-1',
          groupName: 'Pisos',
          status: 'importable',
          commissionPercent: 0.14,
          fixedFeeAmount: 16,
          saleFeeAmount: 30,
        }),
      ],
    },
  })
})