import { NextRequest } from 'next/server'
import { GET } from './route'

function mockRequest(url: string) {
  return new NextRequest(url)
}

test('GET returns 400 for missing sku', async () => {
  const res = await GET(mockRequest('http://localhost/api/metalshopping/price-suggestion/'), {
    params: Promise.resolve({ sku: '' }),
  })
  expect(res.status).toBe(400)
})
