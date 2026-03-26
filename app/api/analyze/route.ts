import { type NextRequest } from 'next/server'
import OpenAI from 'openai'
import type { CompetitorPrice, MarginResult, Product } from '@/types'

type AnalyzeRequestBody = {
  product: Product
  margins: MarginResult[]
  competitors: CompetitorPrice[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>

  return (
    typeof p.id === 'string' &&
    typeof p.sku === 'string' &&
    typeof p.name === 'string' &&
    typeof p.category === 'string' &&
    isFiniteNumber(p.cost) &&
    isFiniteNumber(p.basePrice) &&
    isFiniteNumber(p.stock) &&
    typeof p.unit === 'string'
  )
}

function sanitizeBody(raw: unknown): AnalyzeRequestBody | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>

  const product = body.product
  const margins = Array.isArray(body.margins) ? (body.margins as MarginResult[]) : []
  const competitors = Array.isArray(body.competitors)
    ? (body.competitors as CompetitorPrice[])
    : []

  if (!isValidProduct(product)) return null

  return {
    product,
    // Guard token/cost growth from oversized payloads.
    margins: margins.slice(0, 200),
    competitors: competitors.slice(0, 100),
  }
}

function safeJsonParse(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json()
    const body = sanitizeBody(rawBody)

    if (!body) {
      return Response.json(
        { error: 'Payload inválido para análise' },
        { status: 400 }
      )
    }

    const { product, margins, competitors } = body

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || apiKey === 'your-key-here') {
      return Response.json(
        { error: 'OPENAI_API_KEY não configurada' },
        { status: 503 }
      )
    }

    const openai = new OpenAI({ apiKey })

    const prompt = `Você é um analista de pricing para marketplace brasileiro de acabamentos (porcelanas, metais, cerâmicas).
Analise os dados abaixo e retorne APENAS JSON válido, sem markdown, sem explicações.

Produto: ${product.name}
Custo: R$${product.cost}
Preço atual: R$${product.basePrice}

Margens por marketplace:
${JSON.stringify(margins, null, 2)}

Preços de concorrentes:
${JSON.stringify(competitors.slice(0, 10), null, 2)}

Retorne este JSON exato:
{
  "recomendacao_preco": { "marketplace_id": preco_numero },
  "viabilidade": { "marketplace_id": score_1_a_10 },
  "justificativa": "texto explicativo em português",
  "estrategia": "penetracao" ou "premium" ou "competitivo",
  "alerta": ["alerta1", "alerta2"]
}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content ?? '{}'
    return Response.json(safeJsonParse(content))
  } catch (error) {
    console.error('API analyze error:', error)
    return Response.json({ error: 'Erro ao analisar produto' }, { status: 500 })
  }
}
