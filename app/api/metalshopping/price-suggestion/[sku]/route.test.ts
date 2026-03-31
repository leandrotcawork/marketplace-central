import { GET } from './route'

function mockRequest(url: string) {
  return new Request(url)
}

test('GET returns success with null data for missing sku', async () => {
  const res = await GET(mockRequest('http://localhost/api/metalshopping/price-suggestion/'), {
    params: Promise.resolve({ sku: '' }),
  })
  expect(res.status).toBe(400)
})