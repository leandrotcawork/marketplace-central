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

  // --- Commission ---

  /**
   * Amazon Brasil commission table (source: venda.amazon.com.br/precos, effective 2026).
   *
   * Tiered categories (Móveis, Acessórios eletrônicos e PC):
   *   price <= threshold → 15%; price > threshold → 10% (applied on full price, not split).
   * Minimum fee per item: R$1.00 (food/tires) or R$2.00 (all others).
   *
   * Mapping: product's primaryTaxonomyGroupName → Amazon category key → rate.
   * Groups not matched fall back to 'Demais categorias' (15%, min R$2.00).
   *
   * @param price   Product base price (used for tiered category lookup)
   * @param groupName  Product's primaryTaxonomyGroupName from taxonomy store
   */
  static getCommissionForProduct(
    price: number,
    groupName?: string
  ): {
    commissionPercent: number
    saleFeeAmount: number
    fixedFeeAmount: number
    minFeeAmount: number
    categoryName: string
  } {
    const amazonCategory = AmazonClient.resolveAmazonCategory(groupName)
    const entry = AMAZON_BR_COMMISSION[amazonCategory] ?? AMAZON_BR_COMMISSION['Demais categorias']

    // Tiered: if price > threshold, use lower rate (10%); otherwise use the category rate
    const commissionPercent =
      entry.tieredThreshold !== undefined && price > entry.tieredThreshold ? 0.10 : entry.rate

    const saleFeeRaw = price * commissionPercent
    const saleFeeAmount = Math.round(Math.max(saleFeeRaw, entry.minFee) * 100) / 100

    return {
      commissionPercent,
      saleFeeAmount,
      fixedFeeAmount: 0,
      minFeeAmount: entry.minFee,
      categoryName: amazonCategory,
    }
  }

  /**
   * Maps internal taxonomy group names to Amazon BR category keys.
   * Case-insensitive prefix/substring match. Falls back to 'Demais categorias'.
   */
  private static resolveAmazonCategory(groupName?: string): string {
    if (!groupName) return 'Demais categorias'

    const g = groupName.toLowerCase()

    // Kitchen & Home
    if (/cozinha|panela|utensílio|utensilios|louça|loucas|talheres|culinária|culinaria/.test(g)) return 'Cozinha'
    if (/casa|banheiro|hygiene|higiene|decoração|decoracao|organização|organizacao|limpeza|tapete|cortina|almofada|roupa de cama|edredom/.test(g)) return 'Casa'
    if (/móveis|moveis|sofá|sofa|armário|armario|estante|prateleira|mesa|cadeira|cama|guarda-roupa|guarda roupa/.test(g)) return 'Móveis'
    if (/jardim|piscina|churrasqueira|varanda/.test(g)) return 'Jardim e Piscina'

    // Electronics
    if (/televisão|televisao|tv|áudio|audio|cinema|home theater/.test(g)) return 'TV, áudio e cinema em casa'
    if (/celular|smartphone|telefone/.test(g)) return 'Celulares'
    if (/câmera|camera|fotografia|foto/.test(g)) return 'Câmera e fotografia'
    if (/videogame|console|playstation|xbox|nintendo/.test(g)) return 'Videogames e consoles'
    if (/notebook|computador|desktop|monitor|impressora|teclado|mouse|acessório pc|acessorio pc/.test(g)) return 'PC'
    if (/acessório eletrônico|acessorio eletronico|cabo|carregador|adaptador|hub|memória|memoria/.test(g)) return 'Acessórios eletrônicos e PC'
    if (/eletrônico portátil|eletronico portatil|fone|headset|headphone|speaker|caixa de som/.test(g)) return 'Eletrônicos portáteis'
    if (/eletrodoméstico|eletrodomestico|geladeira|fogão|fogao|lavadora|secadora|ar condicionado|microondas|lava/.test(g)) return 'Eletrodomésticos de linha branca'
    if (/eletroportátil pessoal|eletroportatil|secador|chapinha|barbeador|escova elétrica|escova eletrica/.test(g)) return 'Eletroportáteis de cuidado pessoal'

    // Tools & Industry
    if (/ferramenta|construção|construcao|parafuso|madeira|elétrico|eletrico|hidráulico|hidraulico/.test(g)) return 'Ferramentas e Construção'
    if (/indústria|industria|ciência|ciencia|laboratório|laboratorio|epi|equipamento de proteção/.test(g)) return 'Indústria e Ciência'

    // Fashion & Accessories
    if (/roupa|vestuário|vestuario|camiseta|calça|calca|blusa|vestido|moda/.test(g)) return 'Roupas e acessórios'
    if (/calçado|calcado|sapato|tênis|tenis|sandália|sandalia/.test(g)) return 'Calçados, bolsas e óculos escuros'
    if (/bolsa|mochila|carteira|óculos|oculos/.test(g)) return 'Calçados, bolsas e óculos escuros'
    if (/relógio|relogio/.test(g)) return 'Relógios'
    if (/joia|joias|bijuteria|ouro|prata/.test(g)) return 'Joias'

    // Beauty & Health
    if (/beleza de luxo|beleza luxo|perfume de luxo/.test(g)) return 'Beleza de luxo'
    if (/beleza|cosméticos|cosmeticos|maquiagem|skincare|creme|shampoo/.test(g)) return 'Beleza'
    if (/saúde|saude|medicamento|suplemento|farmácia|farmacia|cuidado pessoal/.test(g)) return 'Saúde e cuidados pessoais'

    // Sports & Leisure
    if (/esporte|esportes|aventura|lazer|camping|musculação|musculacao|bicicleta/.test(g)) return 'Esportes, aventura e lazer'
    if (/instrumento musical|violão|violao|guitarra|piano|bateria|teclado musical/.test(g)) return 'Instrumentos musicais e acessórios'

    // Baby & Pets
    if (/bebê|bebe|infantil|fraldas|fralda/.test(g)) return 'Produtos para bebês'
    if (/pet|animal|cachorro|gato|pássaro|passaro|ração|racao/.test(g)) return 'Produtos para animais de estimação'
    if (/brinquedo|jogo|puzzle|lego/.test(g)) return 'Brinquedos e jogos'

    // Automotive
    if (/pneu|roda|pneus/.test(g)) return 'Pneus e rodas'
    if (/peça automotiva|acessório automotivo|acessorio automotivo|carro|automóvel|automovel/.test(g)) return 'Peças e acessórios automotivos'

    // Travel & Stationery
    if (/bagagem|mala|viagem/.test(g)) return 'Bagagem e acessórios de viagem'
    if (/papelaria|escritório|escritorio|caneta|caderno|papel/.test(g)) return 'Papelaria e Escritório'

    // Food & Beverages
    if (/alimento|comida|bebida não alcoólica|bebida nao alcoolica|café|cafe|chá|cha/.test(g)) return 'Comidas e bebidas'
    if (/bebida alcoólica|bebida alcoolica|cerveja|vinho|whisky/.test(g)) return 'Bebidas alcoólicas'

    // Media
    if (/livro|literatura/.test(g)) return 'Livros'
    if (/vídeo|video|dvd|blu.ray/.test(g)) return 'Vídeo e DVD'
    if (/música|musica|cd|lp|vinil/.test(g)) return 'Música (CDs, LPs)'

    return 'Demais categorias'
  }
}

// ---------------------------------------------------------------------------
// Amazon Brasil commission table (effective 2026)
// Source: https://venda.amazon.com.br/precos#comissoes-de-venda
// ---------------------------------------------------------------------------

type AmazonCommissionEntry = {
  /** Flat commission rate (applied on full price). For tiered categories, this is the base rate. */
  rate: number
  /** Minimum fee per item (R$) */
  minFee: number
  /**
   * Price threshold for tiered categories.
   * If price > tieredThreshold, rate drops to 10%.
   * Applied on full price (not split/progressive).
   */
  tieredThreshold?: number
}

const AMAZON_BR_COMMISSION: Record<string, AmazonCommissionEntry> = {
  'Comidas e bebidas':                    { rate: 0.10, minFee: 1.00 },
  'Pneus e rodas':                        { rate: 0.10, minFee: 1.00 },
  'TV, áudio e cinema em casa':           { rate: 0.10, minFee: 2.00 },
  'Eletrodomésticos de linha branca':     { rate: 0.11, minFee: 1.00 },
  'Bebidas alcoólicas':                   { rate: 0.11, minFee: 1.00 },
  'Celulares':                            { rate: 0.11, minFee: 2.00 },
  'Câmera e fotografia':                  { rate: 0.11, minFee: 2.00 },
  'Videogames e consoles':                { rate: 0.11, minFee: 2.00 },
  'Ferramentas e Construção':             { rate: 0.11, minFee: 2.00 },
  'Saúde e cuidados pessoais':            { rate: 0.12, minFee: 1.00 },
  'Indústria e Ciência':                  { rate: 0.12, minFee: 2.00 },
  'Produtos para bebês':                  { rate: 0.12, minFee: 2.00 },
  'Produtos para animais de estimação':   { rate: 0.12, minFee: 2.00 },
  'Eletroportáteis de cuidado pessoal':   { rate: 0.12, minFee: 2.00 },
  'Cozinha':                              { rate: 0.12, minFee: 2.00 },
  'Jardim e Piscina':                     { rate: 0.12, minFee: 2.00 },
  'Brinquedos e jogos':                   { rate: 0.12, minFee: 2.00 },
  'PC':                                   { rate: 0.12, minFee: 2.00 },
  'Peças e acessórios automotivos':       { rate: 0.12, minFee: 2.00 },
  'Casa':                                 { rate: 0.12, minFee: 2.00 },
  'Esportes, aventura e lazer':           { rate: 0.12, minFee: 2.00 },
  'Instrumentos musicais e acessórios':   { rate: 0.12, minFee: 2.00 },
  'Eletrônicos portáteis':                { rate: 0.13, minFee: 2.00 },
  'Beleza':                               { rate: 0.13, minFee: 2.00 },
  'Papelaria e Escritório':               { rate: 0.13, minFee: 2.00 },
  'Relógios':                             { rate: 0.13, minFee: 2.00 },
  'Beleza de luxo':                       { rate: 0.14, minFee: 2.00 },
  'Bagagem e acessórios de viagem':       { rate: 0.14, minFee: 2.00 },
  'Roupas e acessórios':                  { rate: 0.14, minFee: 2.00 },
  'Calçados, bolsas e óculos escuros':    { rate: 0.14, minFee: 2.00 },
  'Joias':                                { rate: 0.14, minFee: 2.00 },
  'Livros':                               { rate: 0.15, minFee: 2.00 },
  'Vídeo e DVD':                          { rate: 0.15, minFee: 2.00 },
  'Música (CDs, LPs)':                    { rate: 0.15, minFee: 2.00 },
  // Tiered: price <= threshold → 15%; price > threshold → 10% (on full price)
  'Acessórios eletrônicos e PC':          { rate: 0.15, minFee: 2.00, tieredThreshold: 100 },
  'Móveis':                               { rate: 0.15, minFee: 2.00, tieredThreshold: 200 },
  'Demais categorias':                    { rate: 0.15, minFee: 2.00 },
}
