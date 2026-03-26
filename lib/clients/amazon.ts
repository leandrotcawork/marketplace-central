/**
 * Amazon Brasil — Selling Partner API (SP-API) Client
 * Base URL (prod): https://sellingpartnerapi-na.amazon.com
 * Base URL (sandbox): https://sandbox.sellingpartnerapi-na.amazon.com
 * Auth: LWA (Login with Amazon) access token + AWS Signature V4 on every request
 * Docs: https://developer-docs.amazon.com/sp-api
 *
 * AWS Signature V4 is implemented manually using Node.js crypto (no @aws-sdk dependency).
 */

import { createHash, createHmac } from 'crypto'

const SPAPI_BASE = process.env.AMAZON_SANDBOX === 'true'
  ? 'https://sandbox.sellingpartnerapi-na.amazon.com'
  : 'https://sellingpartnerapi-na.amazon.com'
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const REGION = 'us-east-1'
const SERVICE = 'execute-api'
const BRAZIL_MARKETPLACE_ID = 'A2Q3Y263D00KWC'

export type AmazonSecrets = {
  clientId: string
  clientSecret: string
  refreshToken: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken?: string
  sellerId?: string
}

export type ProductPublishInput = {
  sku: string
  name: string
  description?: string
  price: number
  stock: number
  ean?: string
  productType?: string   // Amazon product type (default: 'PRODUCT')
  brand?: string
  images?: string[]
  weight?: number
  attributes?: Record<string, string>
}

export type ExternalOrder = {
  orderId: string
  status: string
  items: { sku: string; quantity: number; price: number }[]
  buyerName?: string
  createdAt: string
}

type LwaTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

type AmazonValidateResult = { ok: true; accountId: string } | { ok: false; error: string }
type AmazonPublishResult = { ok: true; externalId: string } | { ok: false; error: string }
type AmazonSimpleResult = { ok: true } | { ok: false; error: string }
type AmazonOrdersResult = { ok: true; orders: ExternalOrder[] } | { ok: false; error: string }

// ---- AWS SigV4 ----

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function getSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, date)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

function signedHeaders(rawHeaders: Record<string, string>): {
  signedHeaders: string
  canonicalHeaders: string
  allHeaders: Record<string, string>
} {
  const sorted = Object.fromEntries(
    Object.entries(rawHeaders)
      .map(([k, v]) => [k.toLowerCase(), v.trim()])
      .sort(([a], [b]) => a.localeCompare(b))
  )
  return {
    allHeaders: sorted,
    canonicalHeaders: Object.entries(sorted).map(([k, v]) => `${k}:${v}`).join('\n') + '\n',
    signedHeaders: Object.keys(sorted).join(';'),
  }
}

function sigV4Sign(params: {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken?: string
  lwaToken: string
}): Record<string, string> {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')           // YYYYMMDD
  const datetimeStr = now.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z' // YYYYMMDDTHHMMSSz

  const parsedUrl = new URL(params.url)

  const baseHeaders: Record<string, string> = {
    host: parsedUrl.hostname,
    'x-amz-access-token': params.lwaToken,
    'x-amz-date': datetimeStr,
    ...params.headers,
  }
  if (params.awsSessionToken) {
    baseHeaders['x-amz-security-token'] = params.awsSessionToken
  }

  const { allHeaders, canonicalHeaders, signedHeaders: sh } = signedHeaders(baseHeaders)

  const sortedQuery = [...parsedUrl.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const bodyHash = sha256Hex(params.body)

  const canonicalRequest = [
    params.method,
    parsedUrl.pathname,
    sortedQuery,
    canonicalHeaders,
    sh,
    bodyHash,
  ].join('\n')

  const credentialScope = `${dateStr}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', datetimeStr, credentialScope, sha256Hex(canonicalRequest)].join('\n')

  const signingKey = getSigningKey(params.awsSecretAccessKey, dateStr, REGION, SERVICE)
  const signature = hmacSha256(signingKey, stringToSign).toString('hex')

  const authorization = `AWS4-HMAC-SHA256 Credential=${params.awsAccessKeyId}/${credentialScope}, SignedHeaders=${sh}, Signature=${signature}`

  return {
    ...allHeaders,
    Authorization: authorization,
    'Content-Type': 'application/json',
  }
}

// ---- Client ----

export class AmazonClient {
  private secrets: AmazonSecrets
  private lwaToken: string = ''
  private lwaExpiresAt: number = 0

  constructor(secrets: AmazonSecrets) {
    this.secrets = secrets
  }

  // --- LWA Token ---

  private async ensureLwaToken(): Promise<void> {
    if (this.lwaToken && Date.now() < this.lwaExpiresAt - 60_000) return

    const res = await fetch(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.secrets.refreshToken,
        client_id: this.secrets.clientId,
        client_secret: this.secrets.clientSecret,
      }).toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Amazon LWA token refresh failed (${res.status}): ${text}`)
    }

    const data = (await res.json()) as LwaTokenResponse
    this.lwaToken = data.access_token
    this.lwaExpiresAt = Date.now() + data.expires_in * 1000
  }

  private async fetch<T>(
    path: string,
    options: { method?: string; body?: string; query?: Record<string, string> } = {}
  ): Promise<T> {
    await this.ensureLwaToken()

    const query = options.query
      ? '?' + new URLSearchParams(options.query).toString()
      : ''
    const url = `${SPAPI_BASE}${path}${query}`
    const method = options.method ?? 'GET'
    const body = options.body ?? ''

    const signedReqHeaders = sigV4Sign({
      method,
      url,
      headers: {},
      body,
      awsAccessKeyId: this.secrets.awsAccessKeyId,
      awsSecretAccessKey: this.secrets.awsSecretAccessKey,
      awsSessionToken: this.secrets.awsSessionToken,
      lwaToken: this.lwaToken,
    })

    const res = await fetch(url, {
      method,
      headers: signedReqHeaders,
      ...(body ? { body } : {}),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Amazon SP-API ${path} failed (${res.status}): ${text}`)
    }

    if (res.status === 204) return {} as T
    const json = await res.json()
    return (json.payload ?? json) as T
  }

  // --- Connection ---

  async validateConnection(): Promise<AmazonValidateResult> {
    try {
      const res = await this.fetch<{ payload: { marketplaceParticipations: unknown[] } }>(
        '/sellers/v1/marketplaceParticipations'
      )
      const sellerId = this.secrets.sellerId ?? 'amazon-seller'
      return { ok: true, accountId: sellerId }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha na validação' }
    }
  }

  // --- Listings ---

  async publishProduct(input: ProductPublishInput): Promise<AmazonPublishResult> {
    try {
      const sellerId = this.secrets.sellerId
      if (!sellerId) throw new Error('sellerId não configurado para Amazon')

      const productType = input.productType ?? 'PRODUCT'
      const attributes: Record<string, unknown> = {
        item_name: [{ value: input.name, language_tag: 'pt_BR', marketplace_id: BRAZIL_MARKETPLACE_ID }],
        condition_type: [{ value: 'new_new' }],
        purchasable_offer: [{
          audience: 'ALL',
          currency: 'BRL',
          our_price: [{ schedule: [{ value_with_tax: input.price }] }],
          marketplace_id: BRAZIL_MARKETPLACE_ID,
        }],
        fulfillment_availability: [{
          fulfillment_channel_code: 'DEFAULT',
          quantity: input.stock,
          marketplace_id: BRAZIL_MARKETPLACE_ID,
        }],
      }

      if (input.brand) {
        attributes.brand = [{ value: input.brand, language_tag: 'pt_BR' }]
      }
      if (input.description) {
        attributes.item_description = [{ value: input.description, language_tag: 'pt_BR' }]
      }
      if (input.ean) {
        attributes.externally_assigned_product_identifier = [{ type: 'ean', value: input.ean }]
      }
      if (input.attributes) {
        for (const [key, value] of Object.entries(input.attributes)) {
          attributes[key] = [{ value, language_tag: 'pt_BR' }]
        }
      }

      const body = JSON.stringify({
        productType,
        requirements: 'LISTING',
        attributes,
      })

      await this.fetch(
        `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(input.sku)}`,
        {
          method: 'PUT',
          body,
          query: { marketplaceIds: BRAZIL_MARKETPLACE_ID },
        }
      )

      return { ok: true, externalId: input.sku }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao publicar' }
    }
  }

  async updateStock(sku: string, quantity: number): Promise<AmazonSimpleResult> {
    try {
      const sellerId = this.secrets.sellerId
      if (!sellerId) throw new Error('sellerId não configurado para Amazon')

      const body = JSON.stringify({
        productType: 'PRODUCT',
        patches: [{
          op: 'replace',
          path: '/attributes/fulfillment_availability',
          value: [{
            fulfillment_channel_code: 'DEFAULT',
            quantity,
            marketplace_id: BRAZIL_MARKETPLACE_ID,
          }],
        }],
      })

      await this.fetch(
        `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
        { method: 'PATCH', body, query: { marketplaceIds: BRAZIL_MARKETPLACE_ID } }
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar estoque' }
    }
  }

  async updatePrice(sku: string, price: number): Promise<AmazonSimpleResult> {
    try {
      const sellerId = this.secrets.sellerId
      if (!sellerId) throw new Error('sellerId não configurado para Amazon')

      const body = JSON.stringify({
        productType: 'PRODUCT',
        patches: [{
          op: 'replace',
          path: '/attributes/purchasable_offer',
          value: [{
            audience: 'ALL',
            currency: 'BRL',
            our_price: [{ schedule: [{ value_with_tax: price }] }],
            marketplace_id: BRAZIL_MARKETPLACE_ID,
          }],
        }],
      })

      await this.fetch(
        `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
        { method: 'PATCH', body, query: { marketplaceIds: BRAZIL_MARKETPLACE_ID } }
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar preço' }
    }
  }

  async fetchOrders(since?: string): Promise<AmazonOrdersResult> {
    try {
      const query: Record<string, string> = {
        MarketplaceIds: BRAZIL_MARKETPLACE_ID,
        OrderStatuses: 'Unshipped,PartiallyShipped,Shipped',
        MaxResultsPerPage: '50',
      }
      if (since) query.CreatedAfter = since

      const res = await this.fetch<{ Orders: Record<string, unknown>[] }>('/orders/v0/orders', { query })

      const orders: ExternalOrder[] = (res.Orders ?? []).map((order) => ({
        orderId: String(order.AmazonOrderId),
        status: String(order.OrderStatus),
        items: [],   // SP-API requires a separate call per order to get items
        buyerName: '',
        createdAt: String(order.PurchaseDate ?? ''),
      }))

      return { ok: true, orders }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Falha ao buscar pedidos' }
    }
  }
}
