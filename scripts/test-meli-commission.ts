/**
 * Test: Mercado Livre commission import API
 * Sends sample products to /api/marketplace-commission-import/mercado-livre
 * and displays the commission/freight data returned.
 */

const BASE = 'http://127.0.0.1:3000'

const sampleProducts = [
  {
    id: 'test-1',
    sku: 'PORC-001',
    name: 'Porcelanato Polido 60x60 Branco',
    basePrice: 89.90,
    primaryTaxonomyNodeId: 'group-porcelanato',
    primaryTaxonomyGroupName: 'Porcelanato',
    category: 'Porcelanato',
  },
  {
    id: 'test-2',
    sku: 'MET-001',
    name: 'Torneira Monocomando Inox Cozinha',
    basePrice: 249.90,
    primaryTaxonomyNodeId: 'group-metais',
    primaryTaxonomyGroupName: 'Metais Sanitários',
    category: 'Metais',
  },
  {
    id: 'test-3',
    sku: 'CER-001',
    name: 'Revestimento Cerâmico 30x60 Bege',
    basePrice: 49.90,
    primaryTaxonomyNodeId: 'group-ceramica',
    primaryTaxonomyGroupName: 'Cerâmica',
    category: 'Cerâmica',
  },
]

async function main() {
  console.log('Calling /api/marketplace-commission-import/mercado-livre...\n')

  // dimensions: "HxWxL,weight_grams" — example: 60x60 porcelain tile, 1cm thick, 25 kg
  const res = await fetch(`${BASE}/api/marketplace-commission-import/mercado-livre`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products: sampleProducts, dimensions: '10x60x60,25000' }),
  })

  const json = await res.json()

  if (!json.success) {
    console.error('FAILED:', json.error)
    process.exit(1)
  }

  const data = json.data

  console.log('=== IMPORTED GROUPS ===')
  for (const g of data.importedGroups) {
    console.log(`  ${g.groupName} (${g.productCount} products)`)
    console.log(`    Category: ${g.categoryId} — ${g.categoryName}`)
    console.log(`    Commission: ${((g.commissionPercent ?? 0) * 100).toFixed(1)}%`)
    console.log(`    Fixed Fee: R$${(g.fixedFeeAmount ?? 0).toFixed(2)}`)
    console.log(`    Sale Fee: R$${(g.saleFeeAmount ?? 0).toFixed(2)}`)
    console.log(`    Freight (seller cost): ${g.freightFixedAmount !== undefined ? `R$${g.freightFixedAmount.toFixed(2)}` : 'N/A'}`)
    console.log(`    Source: ${g.sourceRef}`)
    console.log()
  }

  if (data.conflictGroups.length) {
    console.log('=== CONFLICTS ===')
    for (const g of data.conflictGroups) {
      console.log(`  ${g.groupName}: ${g.notes}`)
    }
  }

  if (data.missingGroups.length) {
    console.log('=== MISSING ===')
    for (const g of data.missingGroups) {
      console.log(`  ${g.groupName}: ${g.notes}`)
    }
  }

  if (data.errorGroups.length) {
    console.log('=== ERRORS ===')
    for (const g of data.errorGroups) {
      console.log(`  ${g.groupName}: ${g.notes}`)
    }
  }

  console.log(`\nGenerated at: ${data.generatedAt}`)
  console.log(`Total products: ${data.productPreviews.length}`)
  console.log('✓ Done!')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
