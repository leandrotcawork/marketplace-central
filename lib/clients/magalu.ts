/**
 * Magalu Marketplace API Client
 * Base URL: https://api.magalu.com (sandbox: https://sandbox.magalu.com)
 * Auth: OAuth2 client_credentials
 * Docs: https://developers.magalu.com
 */

const BASE_URL = process.env.MAGALU_USE_SANDBOX === 'true'
  ? 'https://sandbox.magalu.com'
  : 'https://api.magalu.com'

export type MagaluSecrets = {
  clientId: string
  clientSecret: string
  sellerId?: string
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

  constructor(secrets: MagaluSecrets) {
    this.secrets = secrets
  }

  // --- Auth ---

  private async ensureToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) return

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
}
