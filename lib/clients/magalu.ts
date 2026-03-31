/**
 * Magalu Marketplace API Client
 * Base URL: https://api.magalu.com (sandbox: https://sandbox.magalu.com)
 * Auth: OAuth2 client_credentials
 * Docs: https://developers.magalu.com
 */

import { createHmac, timingSafeEqual } from 'crypto'

const BASE_URL = process.env.MAGALU_USE_SANDBOX === 'true'
  ? 'https://sandbox.magalu.com'
  : 'https://api.magalu.com'
const ID_BASE_URL = 'https://id.magalu.com'

export type MagaluSecrets = {
  clientId: string
  clientSecret: string
  sellerId?: string
  accessToken?: string
  refreshToken?: string
}

export type ProductPublishInput = {
  sku: string
  name: string
  description?: string
  price: number
  stock: number
  ean?: string
  categoryId?: string
  brand?: string
  ncm?: string
  images?: string[]
  weight?: number
  dimensions?: { length: number; width: number; height: number }
  attributes?: Record<string, string>
}

export type ExternalOrder = {
  orderId: string
  status: string
  items: { sku: string; quantity: number; price: number }[]
  buyerName?: string
  createdAt: string
}

type MagaluTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
}

type MagaluValidateResult = { ok: true; accountId: string } | { ok: false; error: string }
type MagaluPublishResult = { ok: true; externalId: string } | { ok: false; error: string }
type MagaluSimpleResult = { ok: true } | { ok: false; error: string }
type MagaluOrdersResult = { ok: true; orders: ExternalOrder[] } | { ok: false; error: string }

export class MagaluClient {
  private secrets: MagaluSecrets
  private accessToken: string = ''
  private tokenExpiresAt: number = 0
  private refreshToken: string = ''

  constructor(secrets: MagaluSecrets) {
    this.secrets = secrets
    this.accessToken = secrets.accessToken ?? ''
    this.refreshToken = secrets.refreshToken ?? ''
    this.tokenExpiresAt = this.accessToken ? parseJwtExp(this.accessToken) : 0
  }

  // --- Auth ---

  private async ensureToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) return
    if (this.accessToken && this.tokenExpiresAt === 0 && !this.refreshToken) return

    if (this.refreshToken) {
      const res = await fetch(`${ID_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.secrets.clientId,
          client_secret: this.secrets.clientSecret,
          refresh_token: this.refreshToken,
        }).toString(),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Magalu refresh token failed (${res.status}): ${text}`)
      }

      const data = (await res.json()) as MagaluTokenResponse & { refresh_token?: string }
      this.accessToken = data.access_token
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000
      if (data.refresh_token) this.refreshToken = data.refresh_token
      return
    }

    const credentials = Buffer.from(
      `${this.secrets.clientId}:${this.secrets.clientSecret}`
    ).toString('base64')

    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'product:write product:read order:read order:write messaging:read messaging:write',
      }).toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Magalu token request failed (${res.status}): ${text}`)
    }

    const data = (await res.json()) as MagaluTokenResponse
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    await this.ensureToken()

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Magalu API ${path} failed (${res.status}): ${text}`)
    }

    if (res.status === 204) return {} as T
    return res.json() as Promise<T>
  }

  // --- Connection ---

  async validateConnection(): Promise<MagaluValidateResult> {
    try {
      // Token acquisition itself validates credentials
      await this.ensureToken()
      const accountId = this.secrets.sellerId ?? 'magalu-account'
      return { ok: true, accountId }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha na validação' }
    }
  }

  // --- Product ---

  async publishProduct(input: ProductPublishInput): Promise<MagaluPublishResult> {
    try {
      const body: Record<string, unknown> = {
        sku: input.sku,
        title: input.name,
        brand: input.brand ?? 'Sem marca',
        category: input.categoryId ?? 'Outros',
      }

      if (input.description) body.description = input.description
      if (input.ean) body.ean = input.ean
      if (input.ncm) body.ncm = input.ncm
      if (input.images?.length) {
        body.images = input.images.map((url, idx) => ({ url, main: idx === 0 }))
      }
      if (input.weight || input.dimensions) {
        body.dimensions = {
          weight: input.weight ?? 0,
          length: input.dimensions?.length ?? 0,
          width: input.dimensions?.width ?? 0,
          height: input.dimensions?.height ?? 0,
        }
      }
      if (input.attributes) {
        body.attributes = Object.entries(input.attributes).map(([key, value]) => ({ key, value }))
      }

      const result = await this.fetch<{ sku_id: string }>('/v1/sku', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // Set initial price and stock
      await this.updatePrice(result.sku_id, input.price)
      await this.updateStock(result.sku_id, input.stock)

      return { ok: true, externalId: result.sku_id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao publicar' }
    }
  }

  async updateStock(externalId: string, quantity: number): Promise<MagaluSimpleResult> {
    try {
      await this.fetch(`/v1/sku/${externalId}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity, warehouse_id: 'default' }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar estoque' }
    }
  }

  async updatePrice(externalId: string, price: number): Promise<MagaluSimpleResult> {
    try {
      await this.fetch(`/v1/sku/${externalId}/price`, {
        method: 'PATCH',
        body: JSON.stringify({ price }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar preço' }
    }
  }

  async fetchOrders(since?: string): Promise<MagaluOrdersResult> {
    try {
      const params = new URLSearchParams({ status: 'paid', page: '1', per_page: '50' })
      if (since) params.set('created_at_start', since.slice(0, 10))

      const res = await this.fetch<{ data: Record<string, unknown>[] }>(`/v1/orders?${params}`)

      const orders: ExternalOrder[] = (res.data ?? []).map((order) => ({
        orderId: String(order.order_id),
        status: String(order.status),
        items: ((order.items as Record<string, unknown>[]) ?? []).map((item) => ({
          sku: String(item.sku ?? ''),
          quantity: Number(item.quantity ?? 0),
          price: Number(item.price ?? 0),
        })),
        buyerName: String((order.buyer as Record<string, unknown>)?.name ?? ''),
        createdAt: String(order.created_at ?? ''),
      }))

      return { ok: true, orders }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao buscar pedidos' }
    }
  }

  async answerQuestion(questionId: string, answer: string): Promise<MagaluSimpleResult> {
    try {
      await this.fetch(`/v1/questions/${questionId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ answer }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao responder' }
    }
  }

  // --- Commission ---

  /**
   * Magalu charges a flat 14.8% commission + R$5 fixed fee per item.
   * No API call needed — returns calculated values synchronously.
   */
  getCommissionForProduct(price: number): {
    commissionPercent: number
    saleFeeAmount: number
    fixedFeeAmount: number
  } {
    const MAGALU_COMMISSION_RATE = 0.148
    const MAGALU_FIXED_FEE = 5
    return {
      commissionPercent: MAGALU_COMMISSION_RATE,
      saleFeeAmount: Math.round(price * MAGALU_COMMISSION_RATE * 100) / 100,
      fixedFeeAmount: MAGALU_FIXED_FEE,
    }
  }

  // --- Categories ---

  async listCategories(): Promise<
    { ok: true; categories: { id: string; name: string }[] } | { ok: false; error: string }
  > {
    try {
      const res = await this.fetch<{ data: { id: string; name: string }[] }>('/v1/categories')
      return { ok: true, categories: res.data ?? [] }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao listar categorias' }
    }
  }

  // --- Freight Simulation (Magalu Entregas) ---

  /**
   * Simulates Magalu Entregas shipping cost using the published co-participation table.
   * No API call — purely local lookup based on product weight/dimensions.
   *
   * Table effective: 2025-02-01 (source: Magalu seller portal / Preço Certo)
   * Cubic weight: H(m) x W(m) x L(m) x 167 (light) or x 300 (heavy)
   * Billable weight = max(actual weight, cubic weight)
   *
   * Discount tiers based on on-time dispatch rate (pontualidade de despacho):
   *   - No discount: < 87% on-time
   *   - 25% discount: 87-97% on-time
   *   - 50% discount: > 97% on-time
   *
   * @param dimensions "HxWxL,weight_grams" format (same as ML) — e.g. "10x60x60,25000"
   *                   H/W/L in cm, weight in grams
   * @param discountTier 'none' | '25' | '50' — seller performance tier
   */
  static simulateShippingCost(
    dimensions: string,
    discountTier: 'none' | '25' | '50' = 'none'
  ): number | null {
    const parsed = MagaluClient.parseDimensions(dimensions)
    if (!parsed) return null

    const { heightCm, widthCm, lengthCm, weightG } = parsed
    const actualWeightKg = weightG / 1000

    // Cubic weight: H(m) x W(m) x L(m) x 167
    const cubicWeightKg = (heightCm / 100) * (widthCm / 100) * (lengthCm / 100) * 167

    // Billable weight = max of actual vs cubic
    const billableWeightG = Math.max(actualWeightKg, cubicWeightKg) * 1000

    const baseCost = MagaluClient.lookupFreightTable(billableWeightG)
    if (baseCost === null) return null

    const discountMultiplier =
      discountTier === '50' ? 0.5 :
      discountTier === '25' ? 0.75 :
      1.0

    return Math.round(baseCost * discountMultiplier * 100) / 100
  }

  /**
   * Parse "HxWxL,weight_grams" dimension string.
   * Same format used by ML shipping simulation.
   */
  private static parseDimensions(dimensions: string): {
    heightCm: number; widthCm: number; lengthCm: number; weightG: number
  } | null {
    const match = dimensions.match(
      /^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/i
    )
    if (!match) return null

    const [, h, w, l, weight] = match
    const heightCm = Number(h)
    const widthCm = Number(w)
    const lengthCm = Number(l)
    const weightG = Number(weight)

    if ([heightCm, widthCm, lengthCm, weightG].some((v) => !Number.isFinite(v) || v <= 0)) {
      return null
    }

    return { heightCm, widthCm, lengthCm, weightG }
  }

  /**
   * Magalu Entregas co-participation table (effective 2025-02-01).
   * Returns base cost (no discount) for a given weight in grams.
   * Source: Magalu seller portal / Preço Certo documentation.
   */
  private static lookupFreightTable(weightG: number): number | null {
    // Weight ranges in grams → base cost (R$, no discount tier)
    const table: [number, number][] = [
      [500,     35.90],
      [1000,    40.80],
      [2000,    42.90],
      [3000,    45.90],
      [4000,    48.90],
      [5000,    52.90],
      [9000,    77.90],
      [13000,   87.90],
      [17000,   97.90],
      [21000,  107.90],
      [25000,  117.90],
      [30000,  127.90],
      [35000,  137.90],
      [40000,  147.90],
      [45000,  157.90],
      [50000,  167.90],
      [60000,  177.90],
      [70000,  187.90],
      [80000,  197.90],
      [90000,  207.90],
      [100000, 219.90],
      [110000, 249.90],
      [120000, 259.90],
      [130000, 269.90],
      [140000, 279.90],
      [150000, 289.90],
      [160000, 299.90],
      [170000, 309.90],
      [180000, 319.90],
      [190000, 329.90],
      [200000, 339.90],
    ]

    if (weightG <= 0) return null

    // Over 200kg
    if (weightG > 200000) return 349.90

    for (const [maxG, cost] of table) {
      if (weightG <= maxG) return cost
    }

    return 349.90
  }

  // --- Webhook Signature Verification ---

  /**
   * Verify Magalu v1 webhook HMAC-SHA256 signature.
   * Signature is computed over "{timestamp}.{rawBody}" using the webhook secret.
   * Secret format: whsec_*
   */
  static verifyWebhookSignature(
    rawBody: string,
    signature: string,
    timestamp: string,
    secret: string
  ): boolean {
    const signedPayload = `${timestamp}.${rawBody}`
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')

    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')

    if (sigBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(sigBuffer, expectedBuffer)
  }
}

function parseJwtExp(token: string): number {
  const parts = token.split('.')
  if (parts.length < 2) return 0
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { exp?: number }
    if (!payload.exp) return 0
    return payload.exp * 1000
  } catch {
    return 0
  }
}
