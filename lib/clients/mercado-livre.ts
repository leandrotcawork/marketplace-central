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

export type MeLiCategorySuggestion = {
  categoryId: string
  categoryName?: string
}

export type MeLiListingPriceResult = {
  categoryId: string
  categoryName?: string
  listingTypeId: string
  commissionPercent: number
  fixedFeeAmount: number
  saleFeeAmount: number
  sourceRef: string
}

type MeLiTokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  expires_in: number
}

type MeLiDomainDiscoveryRow = {
  category_id?: string
  category_name?: string
}

type MeLiShippingOptionsResponse = {
  coverage?: {
    all_country?: {
      list_cost?: number
      currency_id?: string
    }
  }
}

type MeLiListingPriceRow = {
  category_id?: string
  listing_type_id?: string
  sale_fee_amount?: number
  sale_fee_details?: {
    gross_amount?: number
    percentage_fee?: number
    meli_percentage_fee?: number
    fixed_fee?: number
  }
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

  // --- Shipping ---

  /**
   * Looks up a product by EAN/GTIN in the ML catalog and returns its package dimensions
   * in the format expected by getSellerShippingCost: "HxWxL,weight_grams".
   *
   * This mirrors what ML's own website does when you add a product by EAN —
   * they already have dimensions stored in the catalog.
   *
   * Returns null if the EAN is not found or the item has no dimension data.
   */
  async getCatalogDimensions(ean: string): Promise<string | null> {
    try {
      type SearchResult = { id: string; shipping?: { dimensions?: string } }
      const searchRes = await this.fetch<{ results: SearchResult[] }>(
        `/sites/MLB/search?gtin=${encodeURIComponent(ean)}&limit=1`
      )

      const item = searchRes.results?.[0]
      if (!item?.id) return null

      // Search results sometimes already include shipping.dimensions
      if (item.shipping?.dimensions) return item.shipping.dimensions

      // Otherwise fetch the full item to get dimensions
      const fullItem = await this.fetch<{ shipping?: { dimensions?: string } }>(
        `/items/${item.id}`
      )

      return fullItem.shipping?.dimensions ?? null
    } catch {
      return null
    }
  }

  /**
   * Returns the actual seller cost (after mandatory ML discount) for free shipping
   * on a gold_special / me2 / drop_off listing.
   *
   * dimensions format: "HxWxL,weight_grams" — e.g. "10x60x60,25000" for a 25 kg tile
   * Returns null if the request fails or the endpoint doesn't cover the region.
   */
  async getSellerShippingCost(params: {
    dimensions: string
    itemPrice: number
    listingTypeId?: string
  }): Promise<number | null> {
    try {
      if (!this.userId) await this.validateConnection()

      const query = new URLSearchParams({
        dimensions: params.dimensions,
        item_price: String(params.itemPrice),
        listing_type_id: params.listingTypeId ?? 'gold_special',
        mode: 'me2',
        condition: 'new',
        logistic_type: 'drop_off',
        free_shipping: 'True',
        verbose: 'true',
      })

      const res = await this.fetch<MeLiShippingOptionsResponse>(
        `/users/${this.userId}/shipping_options/free?${query}`
      )

      return res.coverage?.all_country?.list_cost ?? null
    } catch {
      return null
    }
  }

  // --- Category helper ---

  async suggestCategory(title: string): Promise<string | null> {
    const suggestion = await this.suggestCategoryDetailed(title)
    return suggestion?.categoryId ?? null
  }

  async suggestCategoryDetailed(title: string): Promise<MeLiCategorySuggestion | null> {
    try {
      const res = await this.fetch<MeLiDomainDiscoveryRow[]>(
        `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(title)}&limit=1`
      )
      const first = res[0]
      if (!first?.category_id) return null

      return {
        categoryId: first.category_id,
        categoryName: first.category_name,
      }
    } catch {
      return null
    }
  }

  async getListingPrice(params: {
    price: number
    categoryId: string
    categoryName?: string
    listingTypeId?: string
  }): Promise<MeLiListingPriceResult> {
    const listingTypeId = params.listingTypeId ?? 'gold_special'
    const query = new URLSearchParams({
      price: String(params.price),
      category_id: params.categoryId,
      listing_type_id: listingTypeId,
    })

    const raw = await this.fetch<MeLiListingPriceRow | MeLiListingPriceRow[]>(
      `/sites/MLB/listing_prices?${query.toString()}`
    )

    const payload = Array.isArray(raw) ? raw[0] : raw

    if (!payload) {
      throw new Error('MeLi listing_prices retornou vazio')
    }

    const saleFeeAmount = normalizeNumber(
      payload.sale_fee_amount ?? payload.sale_fee_details?.gross_amount
    )
    const fixedFeeAmount = normalizeNumber(payload.sale_fee_details?.fixed_fee)
    const percentageFee =
      normalizeNumber(payload.sale_fee_details?.percentage_fee) ||
      normalizeNumber(payload.sale_fee_details?.meli_percentage_fee)

    const commissionPercent =
      percentageFee > 0
        ? percentageFee / 100
        : params.price > 0
        ? Math.max((saleFeeAmount - fixedFeeAmount) / params.price, 0)
        : 0

    return {
      categoryId: payload.category_id ?? params.categoryId,
      categoryName: params.categoryName,
      listingTypeId: payload.listing_type_id ?? listingTypeId,
      commissionPercent,
      fixedFeeAmount,
      saleFeeAmount,
      sourceRef: `ML listing_prices category=${payload.category_id ?? params.categoryId} listing_type=${payload.listing_type_id ?? listingTypeId}`,
    }
  }
}

function normalizeNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
