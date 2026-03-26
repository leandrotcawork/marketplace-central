import type { CompetitorPrice, Product, Marketplace } from '@/types'

const COMPETITOR_NAMES = [
  'Casa das Pedras',
  'Revest Mais',
  'Porcelanato SP',
  'TileWorld',
  'CerâmicaPro',
]

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function generateCompetitorData(
  products: Product[],
  marketplaces: Marketplace[]
): CompetitorPrice[] {
  const results: CompetitorPrice[] = []
  const today = new Date().toISOString()
  const activeMarketplaces = marketplaces.filter((m) => m.active)

  for (const product of products) {
    for (const marketplace of activeMarketplaces) {
      // 3-5 competitors per product×marketplace pair
      const count = Math.floor(randomBetween(3, 6))
      const shuffled = [...COMPETITOR_NAMES].sort(() => Math.random() - 0.5)
      const selected = shuffled.slice(0, count)

      for (const competitorName of selected) {
        // Price variation: ±5% to ±25% of basePrice
        const variationPct = randomBetween(0.05, 0.25)
        const direction = Math.random() > 0.5 ? 1 : -1
        const price = product.basePrice * (1 + direction * variationPct)
        const roundedPrice = Math.round(price * 100) / 100
        const diff = ((roundedPrice - product.basePrice) / product.basePrice) * 100

        results.push({
          productId: product.id,
          competitorName,
          marketplace: marketplace.id,
          price: roundedPrice,
          diff: Math.round(diff * 10) / 10,
          scrapedAt: today,
        })
      }
    }
  }

  return results
}
