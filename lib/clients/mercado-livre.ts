/**
 * Mercado Livre API Client
 * Base URL: https://api.mercadolibre.com
 * Auth: OAuth2 Bearer token (refresh via refresh_token)
 * Docs: https://developers.mercadolivre.com.br
 */

const BASE_URL = 'https://api.mercadolibre.com'

export type MeLiSecrets = {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  userId?: string
}

export type ProductPublishInput = {
  sku: string
  name: string
  description?: string
  price: number
  stock: number
  ean?: string
  categoryId?: string
  images?: string[]
  weight?: number
  dimensions?: { length: number; width: number; height: number }
  attributes?: Record<string, string>
}

type MeLiTokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  expires_in: number
}

type MeLiValidateResult = { ok: true; accountId: string } | { ok: false; error: string }
type MeLiPublishResult = { ok: true; externalId: string } | { ok: false; error: string }
type MeLiSimpleResult = { ok: true } | { ok: false; error: string }
type MeLiOrdersResult =
  | { ok: true; orders: ExternalOrder[] }
  | { ok: false; error: string }

export type ExternalOrder = {
  orderId: string
  status: string
  items: { sku: string; quantity: number; price: number }[]
  buyerName?: string
  createdAt: string
}

export class MercadoLivreClient {
  private secrets: MeLiSecrets
  private accessToken: string
  private userId: string

  constructor(secrets: MeLiSecrets) {
    this.secrets = secrets
    this.accessToken = secrets.accessToken ?? ''
    this.userId = secrets.userId ?? ''
  }

  // --- Auth ---

  async refreshAccessToken(): Promise<void> {
    const res = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.secrets.clientId,
        client_secret: this.secrets.clientSecret,
        refresh_token: this.secrets.refreshToken,
      }).toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`MeLi token refresh failed (${res.status}): ${text}`)
    }

    const data = (await res.json()) as MeLiTokenResponse
    this.accessToken = data.access_token
    this.userId = String(data.user_id)
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {},
    retried = false
  ): Promise<T> {
    if (!this.accessToken) await this.refreshAccessToken()

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (res.status === 401 && !retried) {
      await this.refreshAccessToken()
      return this.fetch<T>(path, options, true)
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`MeLi API ${path} failed (${res.status}): ${text}`)
    }

    return res.json() as Promise<T>
  }

  // --- Connection ---

  async validateConnection(): Promise<MeLiValidateResult> {
    try {
      const user = await this.fetch<{ id: number; nickname: string }>('/users/me')
      this.userId = String(user.id)
      return { ok: true, accountId: String(user.id) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha na validação' }
    }
  }

  // --- Product ---

  async publishProduct(input: ProductPublishInput): Promise<MeLiPublishResult> {
    try {
      const body: Record<string, unknown> = {
        title: input.name,
        price: input.price,
        currency_id: 'BRL',
        available_quantity: input.stock,
        buying_mode: 'buy_it_now',
        condition: 'new',
        listing_type_id: 'gold_special',
        shipping: { mode: 'me2', free_shipping: false },
      }

      if (input.categoryId) body.category_id = input.categoryId
      if (input.description) body.description = { plain_text: input.description }
      if (input.images?.length) body.pictures = input.images.map((url) => ({ source: url }))

      const attrs: { id: string; value_name: string }[] = []
      if (input.ean) attrs.push({ id: 'EAN', value_name: input.ean })
      if (input.attributes) {
        for (const [id, value_name] of Object.entries(input.attributes)) {
          attrs.push({ id, value_name })
        }
      }
      if (attrs.length) body.attributes = attrs

      const result = await this.fetch<{ id: string }>('/items', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      return { ok: true, externalId: result.id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao publicar' }
    }
  }

  async updateStock(externalId: string, quantity: number): Promise<MeLiSimpleResult> {
    try {
      await this.fetch(`/items/${externalId}`, {
        method: 'PUT',
        body: JSON.stringify({ available_quantity: quantity }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar estoque' }
    }
  }

  async updatePrice(externalId: string, price: number): Promise<MeLiSimpleResult> {
    try {
      await this.fetch(`/items/${externalId}`, {
        method: 'PUT',
        body: JSON.stringify({ price }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar preço' }
    }
  }

  async fetchOrders(since?: string): Promise<MeLiOrdersResult> {
    try {
      if (!this.userId) await this.validateConnection()

      const params = new URLSearchParams({
        seller: this.userId,
        sort: 'date_desc',
      })
      if (since) params.set('order.date_created.from', since)

      const res = await this.fetch<{ results: Record<string, unknown>[] }>(
        `/orders/search?${params}`
      )

      const orders: ExternalOrder[] = (res.results ?? []).map((order) => ({
        orderId: String(order.id),
        status: String(order.status),
        items: ((order.order_items as Record<string, unknown>[]) ?? []).map((item) => ({
          sku: String((item.item as Record<string, unknown>)?.seller_sku ?? ''),
          quantity: Number(item.quantity ?? 0),
          price: Number(item.unit_price ?? 0),
        })),
        buyerName: String((order.buyer as Record<string, unknown>)?.nickname ?? ''),
        createdAt: String(order.date_created ?? ''),
      }))

      return { ok: true, orders }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao buscar pedidos' }
    }
  }

  // --- Category helper ---

  async suggestCategory(title: string): Promise<string | null> {
    try {
      const res = await this.fetch<{ category_id: string }[]>(
        `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(title)}&limit=1`
      )
      return res[0]?.category_id ?? null
    } catch {
      return null
    }
  }
}
