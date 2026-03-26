/**
 * Madeira Madeira Partner API Client
 * Auth: Bearer token (static, long-lived)
 * Status: wave_2/planned — only freight quote is live; rest requires sandbox from partner
 * Base URL: from env MADEIRA_BASE_URL (provided via Postman collection)
 */

function getBaseUrl(): string {
  const url = process.env.MADEIRA_BASE_URL
  if (!url) {
    throw new Error(
      'MADEIRA_BASE_URL not configured. Obtain the base URL from the Madeira Madeira Postman collection.'
    )
  }
  return url.replace(/\/$/, '')
}

export type MadeiraSecrets = {
  accessToken: string
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

export type FreightQuoteInput = {
  originZip: string
  destinationZip: string
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  declaredValue: number
}

export type FreightQuote = {
  carrier: string
  service: string
  price: number
  deliveryDays: number
  deadline?: string
}

type MadeiraValidateResult = { ok: true; accountId: string } | { ok: false; error: string }
type MadeiraPublishResult = { ok: true; externalId: string } | { ok: false; error: string }
type MadeiraSimpleResult = { ok: true } | { ok: false; error: string }
type MadeiraOrdersResult = { ok: true; orders: ExternalOrder[] } | { ok: false; error: string }
type MadeiraFreightResult = { ok: true; quotes: FreightQuote[] } | { ok: false; error: string }

export class MadeiraMadeiraClient {
  private secrets: MadeiraSecrets

  constructor(secrets: MadeiraSecrets) {
    this.secrets = secrets
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = getBaseUrl()
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.secrets.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Madeira API ${path} failed (${res.status}): ${text}`)
    }

    if (res.status === 204) return {} as T
    return res.json() as Promise<T>
  }

  // --- Connection (best-effort — no documented /health endpoint) ---

  async validateConnection(): Promise<MadeiraValidateResult> {
    try {
      // Try the freight quote endpoint as a health check (it's the only live endpoint)
      await this.fetch('/v1/freight/quote?origin_zip=01310100&destination_zip=30130010&weight=100&length=10&width=10&height=10&declared_value=100')
      return { ok: true, accountId: this.secrets.sellerId ?? 'madeira-account' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha na validação' }
    }
  }

  // --- Freight (supported) ---

  async getFreightQuote(input: FreightQuoteInput): Promise<MadeiraFreightResult> {
    try {
      const params = new URLSearchParams({
        origin_zip: input.originZip.replace(/\D/g, ''),
        destination_zip: input.destinationZip.replace(/\D/g, ''),
        weight: String(input.weightGrams),
        length: String(input.lengthCm),
        width: String(input.widthCm),
        height: String(input.heightCm),
        declared_value: String(input.declaredValue),
      })

      const res = await this.fetch<{ quotes: Record<string, unknown>[] }>(`/v1/freight/quote?${params}`)

      const quotes: FreightQuote[] = (res.quotes ?? []).map((q) => ({
        carrier: String(q.carrier ?? ''),
        service: String(q.service ?? ''),
        price: Number(q.price ?? 0),
        deliveryDays: Number(q.delivery_days ?? 0),
        deadline: q.deadline ? String(q.deadline) : undefined,
      }))

      return { ok: true, quotes }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar frete' }
    }
  }

  // --- Product (planned — requires sandbox from partner) ---

  async publishProduct(input: ProductPublishInput): Promise<MadeiraPublishResult> {
    try {
      const body: Record<string, unknown> = {
        sku: input.sku,
        title: input.name,
        price: input.price,
        stock: input.stock,
      }
      if (input.description) body.description = input.description
      if (input.ean) body.ean = input.ean
      if (input.categoryId) body.category_id = input.categoryId
      if (input.images?.length) body.images = input.images.map((url, idx) => ({ url, main: idx === 0 }))
      if (input.weight || input.dimensions) {
        body.dimensions = {
          weight_kg: (input.weight ?? 0) / 1000,
          length_cm: input.dimensions?.length ?? 0,
          width_cm: input.dimensions?.width ?? 0,
          height_cm: input.dimensions?.height ?? 0,
        }
      }
      if (input.attributes) body.attributes = input.attributes

      const result = await this.fetch<{ product_id: string }>('/v1/products', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      return { ok: true, externalId: result.product_id ?? input.sku }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Madeira Madeira: produto não publicado — aguardando sandbox do parceiro',
      }
    }
  }

  async updateStock(sku: string, quantity: number): Promise<MadeiraSimpleResult> {
    try {
      await this.fetch(`/v1/products/${encodeURIComponent(sku)}/stock`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar estoque' }
    }
  }

  async updatePrice(sku: string, price: number): Promise<MadeiraSimpleResult> {
    try {
      await this.fetch(`/v1/products/${encodeURIComponent(sku)}/price`, {
        method: 'PUT',
        body: JSON.stringify({ price }),
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar preço' }
    }
  }

  async fetchOrders(since?: string): Promise<MadeiraOrdersResult> {
    try {
      const params = new URLSearchParams({ status: 'pending', page: '1', limit: '50' })
      if (since) params.set('created_after', since)

      const res = await this.fetch<{ orders: Record<string, unknown>[] }>(`/v1/orders?${params}`)

      const orders: ExternalOrder[] = (res.orders ?? []).map((order) => ({
        orderId: String(order.order_id),
        status: String(order.status ?? ''),
        items: ((order.items as Record<string, unknown>[]) ?? []).map((item) => ({
          sku: String(item.sku ?? ''),
          quantity: Number(item.quantity ?? 0),
          price: Number(item.price ?? 0),
        })),
        buyerName: String((order.customer as Record<string, unknown>)?.name ?? ''),
        createdAt: String(order.created_at ?? ''),
      }))

      return { ok: true, orders }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao buscar pedidos' }
    }
  }
}
