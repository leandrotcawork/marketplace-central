import { describe, expect, it } from 'vitest'
import { POST } from './route'

function createRequest(body: unknown) {
  return {
    json: async () => body,
    nextUrl: new URL('http://localhost/api/marketplace-commission-import/shopee'),
  } as any
}

describe('POST /api/marketplace-commission-import/shopee', () => {
  it('returns 400 when no scoped products are sent', async () => {
    const response = await POST(createRequest({ products: [] }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    })
  })

  it('returns 200 and data for valid products', async () => {
    const response = await POST(
      createRequest({
        products: [
          {
            id: 'product-1',
            sku: 'SKU-1',
            name: 'Shopee Product 1',
            primaryTaxonomyNodeId: 'group-1',
            primaryTaxonomyGroupName: 'Group 1',
          },
        ],
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: expect.any(Object),
    })
  })
})
