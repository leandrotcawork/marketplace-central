import { MercadoLivreClient } from '../lib/clients/mercado-livre'

async function main() {
  const client = new MercadoLivreClient({
    clientId: process.env.MELI_CLIENT_ID!,
    clientSecret: process.env.MELI_CLIENT_SECRET!,
    refreshToken: process.env.MELI_REFRESH_TOKEN!,
  })

  console.log('1. Testing connection (GET /users/me)...')
  const validation = await client.validateConnection()
  console.log('   Result:', JSON.stringify(validation, null, 2))

  if (!validation.ok) {
    console.error('Connection failed — aborting.')
    process.exit(1)
  }

  console.log('\n2. Testing category suggestion for "Porcelanato polido 60x60"...')
  const category = await client.suggestCategory('Porcelanato polido 60x60')
  console.log('   Suggested category:', category)

  console.log('\n3. Testing orders fetch...')
  const orders = await client.fetchOrders()
  console.log('   Result:', JSON.stringify(orders, null, 2))

  console.log('\n✓ All tests passed!')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
