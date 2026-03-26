import type { Product, MarginResult, CompetitorPrice, AIAnalysis } from '@/types'

export function buildAnalysisPrompt(
  product: Product,
  margins: MarginResult[],
  competitors: CompetitorPrice[]
): string {
  const marginsText = margins
    .map(
      (m) =>
        `- ${m.marketplaceId}: preço R$${m.sellingPrice.toFixed(2)}, margem ${m.marginPercent.toFixed(1)}% (${m.health})`
    )
    .join('\n')

  const competitorsText = competitors
    .map(
      (c) =>
        `- ${c.competitorName} em ${c.marketplace}: R$${c.price.toFixed(2)} (${c.diff > 0 ? '+' : ''}${c.diff.toFixed(1)}% vs nosso preço)`
    )
    .join('\n')

  return `Analise o produto abaixo e retorne uma análise de preços em JSON.

PRODUTO:
- Nome: ${product.name}
- SKU: ${product.sku}
- Categoria: ${product.category}
- Custo: R$${product.cost.toFixed(2)}
- Preço Base: R$${product.basePrice.toFixed(2)}

MARGENS POR MARKETPLACE:
${marginsText}

PREÇOS DOS CONCORRENTES:
${competitorsText}

Retorne SOMENTE um JSON válido com a seguinte estrutura:
{
  "recommendations": { "<marketplace_id>": <preco_sugerido_numero> },
  "viability": { "<marketplace_id>": <score_0_a_100> },
  "justification": "<texto explicando a estratégia>",
  "strategy": "<penetracao|premium|competitivo>",
  "alerts": ["<alerta1>", "<alerta2>"]
}`
}

export function parseAnalysisResponse(content: string): Omit<AIAnalysis, 'productId'> {
  // Extract JSON from the response, handling potential surrounding text
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON found in AI response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

  const strategyValue = typeof parsed.strategy === 'string' ? parsed.strategy : ''
  const strategy = ['penetracao', 'premium', 'competitivo'].includes(strategyValue)
    ? (strategyValue as AIAnalysis['strategy'])
    : 'competitivo'

  const recommendations: Record<string, number> = {}
  if (parsed.recommendations && typeof parsed.recommendations === 'object') {
    for (const [key, value] of Object.entries(parsed.recommendations as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        recommendations[key] = value
      }
    }
  }

  const viability: Record<string, number> = {}
  if (parsed.viability && typeof parsed.viability === 'object') {
    for (const [key, value] of Object.entries(parsed.viability as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        viability[key] = value
      }
    }
  }

  return {
    recommendations,
    viability,
    justification: typeof parsed.justification === 'string' ? parsed.justification : '',
    strategy,
    alerts: Array.isArray(parsed.alerts)
      ? parsed.alerts.filter((alert): alert is string => typeof alert === 'string')
      : [],
  }
}
