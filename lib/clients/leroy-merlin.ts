/**
 * Leroy Merlin — Mirakl Seller API Client
 * Base URL: https://leroymerlin.mirakl.net
 * Auth: API Key header (Authorization: {apiKey})
 * Docs: https://developer.mirakl.com (Mirakl Seller API v2)
 * Status: wave_2/planned — endpoints ready, requires homologation
 */

const BASE_URL = 'https://leroymerlin.mirakl.net'

export type LeroySecrets = {
  apiKey: string
  shopId?: string
}

export type ProductPublishInput = {
  sku: string
  name: string
  description?: string
  price: number
  stock: number
  ean?: string
  categoryId?: string
  productSku?: string   // Leroy catalog product SKU — found via EAN lookup
  images?: string[]
  attributes?: Record<string, string>
}

export type ExternalOrder = {
  orderId: string
  status: string
  items: { sku: string; quantity: number; price: number }[]
  buyerName?: string
  createdAt: string
}

type LeroyValidateResult = { ok: true; accountId: string } | { ok: false; error: string }
type LeroyPublishResult = { ok: true; externalId: string } | { ok: false; error: string }
type LeroySimpleResult = { ok: true } | { ok: false; error: string }
type LeroyOrdersResult = { ok: true; orders: ExternalOrder[] } | { ok: false; error: string }

export class LeroyMerlinClient {
  private secrets: LeroySecrets

  constructor(secrets: LeroySecrets) {
    this.secrets = secrets
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: this.secrets.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Leroy/Mirakl API ${path} failed (${res.status}): ${text}`)
    }

    if (res.status === 204) return {} as T
    return res.json() as Promise<T>
  }

  // --- Connection ---

  async validateConnection(): Promise<LeroyValidateResult> {
    try {
      // GET /api/shop returns shop info for the API key
      const shop = await this.fetch<{ shop_id: string; shop_name: string }>('/api/shop')
      return { ok: true, accountId: shop.shop_id ?? this.secrets.shopId ?? 'leroy-shop' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha na validação' }
    }
  }

  // --- Catalog search ---

  async findProductByEan(ean: string): Promise<string | null> {
    try {
      const res = await this.fetch<{ products: { product_sku: string }[] }>(
        `/api/products/skus?ean=${encodeURIComponent(ean)}`
      )
      return res.products?.[0]?.product_sku ?? null
    } catch {
      return null
    }
  }

  // --- Offers (product + price + stock in one payload) ---

  async publishProduct(input: ProductPublishInput): Promise<LeroyPublishResult> {
    try {
      let productSku = input.productSku

      // Try to find existing catalog product by EAN
      if (!productSku && input.ean) {
        productSku = (await this.findProductByEan(input.ean)) ?? undefined
      }

      if (!productSku) {
        return {
          ok: false,
          error: 'product_sku não encontrado no catálogo Leroy — informe productSku ou EAN válido',
        }
      }

      const offerPayload = {
        offers: [
          {
            'offer-sku': input.sku,
            'product-sku': productSku,
            price: input.price.toFixed(2),
            quantity: input.stock,
            state: '11',   // 11 = New
            'logistic-class': 'STD',
            ...(input.description ? { description: input.description } : {}),
          },
        ],
      }

      await this.fetch('/api/offers', {
        method: 'POST',
        body: JSON.stringify(offerPayload),
      })

      return { ok: true, externalId: input.sku }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao publicar' }
    }
  }

  async updateStock(sku: string, quantity: number): Promise<LeroySimpleResult> {
    try {
      await this.fetch('/api/offers', {
        method: 'POST',
        body: JSON.stringify({ offers: [{ 'offer-sku': sku, quantity }] }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar estoque' }
    }
  }

  async updatePrice(sku: string, price: number): Promise<LeroySimpleResult> {
    try {
      await this.fetch('/api/offers', {
        method: 'POST',
        body: JSON.stringify({ offers: [{ 'offer-sku': sku, price: price.toFixed(2) }] }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar preço' }
    }
  }

  async fetchOrders(since?: string): Promise<LeroyOrdersResult> {
    try {
      const params = new URLSearchParams({ max: '50' })
      if (since) params.set('start-update-date', since)

      const res = await this.fetch<{ orders: Record<string, unknown>[] }>(`/api/orders?${params}`)

      const orders: ExternalOrder[] = (res.orders ?? []).map((order) => ({
        orderId: String(order.order_id),
        status: String((order.status as Record<string, unknown>)?.state ?? 'unknown'),
        items: ((order.order_lines as Record<string, unknown>[]) ?? []).map((line) => ({
          sku: String(line.offer_sku ?? ''),
          quantity: Number(line.quantity ?? 0),
          price: Number(line.price ?? 0),
        })),
        buyerName: String(
          (order.customer as Record<string, unknown>)?.firstname ?? ''
        ),
        createdAt: String(order.created_date ?? ''),
      }))

      return { ok: true, orders }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao buscar pedidos' }
    }
  }

  /** Leroy Merlin flat 18% commission — no category-specific rates */
  getCommissionForProduct(basePrice: number): {
    commissionPercent: number
    fixedFeeAmount: number
    saleFeeAmount: number
  } {
    const commissionPercent = 0.18
    const fixedFeeAmount = 0
    const saleFeeAmount = Math.round(basePrice * commissionPercent * 100) / 100
    return { commissionPercent, fixedFeeAmount, saleFeeAmount }
  }

  async acceptOrderLines(orderLineIds: string[]): Promise<LeroySimpleResult> {
    try {
      await this.fetch('/api/order-lines/accept', {
        method: 'PUT',
        body: JSON.stringify({
          order_lines: orderLineIds.map((id) => ({ id, order_line_state: 'ACCEPTED' })),
        }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao aceitar pedido' }
    }
  }
}
