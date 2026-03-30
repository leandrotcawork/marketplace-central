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

export interface ShippingSimulationParams {
  /** ID do item já publicado no ML (alternativa a dimensions) */
  itemId?: string
  /** Dimensões do pacote: "AlturaxLarguaraxComprimento,peso_gramas" — ex: "9x17x22,462" */
  dimensions?: string
  /** Preço unitário do item */
  itemPrice: number
  /** Nível de publicação (padrão: gold_special) */
  listingTypeId?: string
  /** Modo de envio (padrão: me2) */
  mode?: 'me2' | 'me1' | 'custom'
  /** Condição do item (padrão: new) */
  condition?: 'new' | 'used'
  /** Tipo de logística (padrão: drop_off) */
  logisticType?: 'cross_docking' | 'drop_off' | 'fulfillment' | 'xd_drop_off' | 'self_service'
  /** Incluir desconto na resposta (padrão: true) */
  verbose?: boolean
  /** Oferecer frete grátis (padrão: true) */
  freeShipping?: boolean
  /** Categoria do item */
  categoryId?: string
  /** Variação do item */
  variationId?: number
  /** Moeda (padrão inferido pelo site) */
  currencyId?: string
  /** Nível do vendedor Líder */
  sellerStatus?: 'platinum' | 'gold' | 'silver'
  /** Tipo de loja */
  sellerType?: string
  /** Reputação do vendedor */
  reputation?: 'red' | 'orange' | 'yellow' | 'light_green' | 'green'
  /** ID do estado de origem */
  stateId?: string
  /** ID da cidade de origem */
  cityId?: string
  /** CEP de origem */
  zipCode?: number
  /** Tags do item (ex: self_service para Flex) */
  tags?: string
}

export type ShippingSimulationResult =
  | {
      ok: true
      /** Custo bruto que o vendedor pagará pelo envio */
      listCost: number
      /** Desconto aplicado (disponível com verbose=true) */
      discount?: number
      /** Custo líquido após desconto */
      netCost?: number
      /** Moeda do custo */
      currencyId: string
    }
  | { ok: false; error: string }

export type MeLiListingPriceResult = {
  categoryId: string
  categoryName?: string
  listingTypeId: string
  commissionPercent: number
  fixedFeeAmount: number
  saleFeeAmount: number
  sourceRef: string
}

export type MeLiPriceSuggestion = {
  itemId: string
  status: string
  suggestedPrice: number | null
  lowestPrice: number | null
  internalPrice: number | null
  currentPrice: number | null
  percentDifference: number | null
  applicableSuggestion: boolean
  lastUpdated: string | null
  competitorCount: number
  costs: { sellingFees: number; shippingFees: number } | null
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

type MeLiShippingCoverageEntry = {
  list_cost?: number
  currency_id?: string
  discount?: {
    rate?: number
    type?: string
    promoted_amount?: number
  }
}

type MeLiShippingOptionsResponse = {
  coverage?: {
    all_country?: MeLiShippingCoverageEntry
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

type MeLiMoneyAmount = {
  amount?: number
}

type MeLiPriceSuggestionResponse = {
  item_id?: string
  status?: string
  suggested_price?: MeLiMoneyAmount | null
  lowest_price?: MeLiMoneyAmount | null
  internal_price?: MeLiMoneyAmount | null
  current_price?: MeLiMoneyAmount | null
  percent_difference?: number | null
  applicable_suggestion?: boolean
  last_updated?: string | null
  metadata?: {
    compared_values?: number
  } | null
  costs?: {
    selling_fees?: number
    shipping_fees?: number
  } | null
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

  /**
   * Fetches a public ML endpoint without authentication.
   * Use for read-only catalog/search endpoints that don't require a seller token.
   */
  private async publicFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`MeLi public API ${path} failed (${res.status}): ${text}`)
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
   * Uses public ML endpoints (no auth required). Falls back to parsing item attributes
   * (HEIGHT, WIDTH, LENGTH/DEPTH, WEIGHT) when shipping.dimensions is not set by the seller.
   *
   * Returns null if the EAN is not found or the item has no usable dimension data.
   */
  async getCatalogDimensions(ean: string): Promise<string | null> {
    try {
      type SearchResult = { id: string; shipping?: { dimensions?: string } }
      const searchRes = await this.publicFetch<{ results: SearchResult[] }>(
        `/sites/MLB/search?gtin=${encodeURIComponent(ean)}&limit=1`
      )

      const item = searchRes.results?.[0]
      if (!item?.id) {
        console.error(`[MeLi] getCatalogDimensions: no results for EAN ${ean}`)
        return null
      }

      // Fetch the full item with attributes (public endpoint, no auth needed)
      type Attribute = { id: string; value_name?: string | null }
      const fullItem = await this.publicFetch<{
        shipping?: { dimensions?: string }
        attributes?: Attribute[]
      }>(`/items/${item.id}?include_attributes=true`)

      // Prefer explicit seller-set shipping.dimensions
      if (fullItem.shipping?.dimensions) return fullItem.shipping.dimensions

      // Fallback: build dimensions string from item attributes
      const attrs = fullItem.attributes ?? []
      const getNum = (id: string) => {
        const attr = attrs.find((a) => a.id === id)
        if (!attr?.value_name) return null
        // Strip non-numeric chars (e.g. "10 cm" → 10)
        const parsed = Number(String(attr.value_name).replace(/[^0-9.]/g, ''))
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
      }

      const h = getNum('HEIGHT')
      const w = getNum('WIDTH')
      const l = getNum('LENGTH') ?? getNum('DEPTH')
      const weight = getNum('WEIGHT')

      if (h && w && l && weight) {
        const dims = `${h}x${w}x${l},${weight}`
        console.log(`[MeLi] getCatalogDimensions: built from attributes for EAN ${ean} → ${dims}`)
        return dims
      }

      console.error(
        `[MeLi] getCatalogDimensions: no usable dimensions for EAN ${ean}`,
        { hasDims: !!fullItem.shipping?.dimensions, attrCount: attrs.length }
      )
      return null
    } catch (error) {
      console.error(`[MeLi] getCatalogDimensions failed for EAN ${ean}:`, error)
      return null
    }
  }

  async getPriceSuggestion(mlItemId: string): Promise<MeLiPriceSuggestion | null> {
    try {
      const res = await this.fetch<MeLiPriceSuggestionResponse>(
        `/suggestions/items/${encodeURIComponent(mlItemId)}/details`
      )

      return {
        itemId: res.item_id ?? mlItemId,
        status: res.status ?? '',
        suggestedPrice: normalizeNullableNumber(res.suggested_price?.amount),
        lowestPrice: normalizeNullableNumber(res.lowest_price?.amount),
        internalPrice: normalizeNullableNumber(res.internal_price?.amount),
        currentPrice: normalizeNullableNumber(res.current_price?.amount),
        percentDifference: normalizeNullableNumber(res.percent_difference),
        applicableSuggestion: Boolean(res.applicable_suggestion),
        lastUpdated: res.last_updated ?? null,
        competitorCount: normalizeNumber(res.metadata?.compared_values),
        costs: res.costs
          ? {
              sellingFees: normalizeNumber(res.costs.selling_fees),
              shippingFees: normalizeNumber(res.costs.shipping_fees),
            }
          : null,
      }
    } catch (error) {
      if (isIgnoredSuggestionError(error)) {
        return null
      }
      return null
    }
  }

  async searchByEan(
    ean: string,
    limit = 5
  ): Promise<Array<{ title: string; price: number; permalink?: string }>> {
    try {
      const params = new URLSearchParams({
        gtin: ean,
        limit: String(limit),
      })

      const res = await this.publicFetch<{
        results?: Array<{ title?: string; price?: number; permalink?: string }>
      }>(`/sites/MLB/search?${params.toString()}`)

      return (res.results ?? []).map((result) => ({
        title: result.title ?? '',
        price: normalizeNumber(result.price),
        permalink: typeof result.permalink === 'string' ? result.permalink : undefined,
      }))
    } catch {
      return []
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

      // ML API requires integer dimensions — round up any decimals
      const roundedDims = params.dimensions.replace(
        /(\d+(?:\.\d+)?)/g,
        (_, n) => String(Math.ceil(Number(n)))
      )

      const query = new URLSearchParams({
        dimensions: roundedDims,
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

  /**
   * Simula o custo de envio de um item no Mercado Livre.
   *
   * Suporta duas formas de identificação:
   * - `itemId`: ID de um item já publicado (não requer dimensões)
   * - `dimensions`: formato "HxWxL,weight_grams" (ex: "9x17x22,462")
   *
   * Com `verbose=true` (padrão), retorna também o desconto aplicado e o custo líquido.
   */
  async simulateShippingCost(params: ShippingSimulationParams): Promise<ShippingSimulationResult> {
    try {
      if (!this.userId) await this.validateConnection()

      const query = new URLSearchParams()

      if (params.itemId) query.set('item_id', params.itemId)
      if (params.dimensions) query.set('dimensions', params.dimensions)

      query.set('item_price', String(params.itemPrice))
      query.set('listing_type_id', params.listingTypeId ?? 'gold_special')
      query.set('mode', params.mode ?? 'me2')
      query.set('condition', params.condition ?? 'new')
      query.set('logistic_type', params.logisticType ?? 'drop_off')
      query.set('free_shipping', String(params.freeShipping ?? true))
      query.set('verbose', String(params.verbose ?? true))

      if (params.categoryId) query.set('category_id', params.categoryId)
      if (params.variationId !== undefined) query.set('variation_id', String(params.variationId))
      if (params.currencyId) query.set('currency_id', params.currencyId)
      if (params.sellerStatus) query.set('seller_status', params.sellerStatus)
      if (params.sellerType) query.set('seller_type', params.sellerType)
      if (params.reputation) query.set('reputation', params.reputation)
      if (params.stateId) query.set('state_id', params.stateId)
      if (params.cityId) query.set('city_id', params.cityId)
      if (params.zipCode !== undefined) query.set('zip_code', String(params.zipCode))
      if (params.tags) query.set('tags', params.tags)

      const res = await this.fetch<MeLiShippingOptionsResponse>(
        `/users/${this.userId}/shipping_options/free?${query}`
      )

      const entry = res.coverage?.all_country
      const listCost = entry?.list_cost ?? 0
      const currencyId = entry?.currency_id ?? 'BRL'

      const discountRate = entry?.discount?.rate
      const discount = discountRate !== undefined ? listCost * discountRate : undefined
      const netCost = discount !== undefined ? listCost - discount : undefined

      return { ok: true, listCost, discount, netCost, currencyId }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao simular frete',
      }
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
      if (first?.category_id) {
        return { categoryId: first.category_id, categoryName: first.category_name }
      }

      // Retry with expanded abbreviations (MetalShopping catalog uses abbreviated names)
      const expanded = expandProductTitle(title)
      if (expanded !== title) {
        const retryRes = await this.fetch<MeLiDomainDiscoveryRow[]>(
          `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(expanded)}&limit=1`
        )
        const retryFirst = retryRes[0]
        if (retryFirst?.category_id) {
          return { categoryId: retryFirst.category_id, categoryName: retryFirst.category_name }
        }
      }

      return null
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

/**
 * Expands abbreviated product titles used in the MetalShopping catalog
 * so ML's domain_discovery can match them to categories.
 *
 * Example: "MIST.LAV.MON.B.ALTA LOGGICA CR"
 *       → "Misturador Lavatorio Monocomando Bica Alta LOGGICA Cromado"
 */
function expandProductTitle(raw: string): string {
  let title = raw

  // Multi-char patterns first (order matters — longer matches before shorter)
  const patterns: [string, string][] = [
    ['NIQU.ESC', 'Niquel Escovado'],
    ['NIQU ESC', 'Niquel Escovado'],
    ['NIQ ESC', 'Niquel Escovado'],
    ['B.ALTA', 'Bica Alta'],
    ['B.BAIXA', 'Bica Baixa'],
    ['B.MOVEL', 'Bica Movel'],
    ['P.CZ.', 'Pia Cozinha '],
    ['P.T.', 'Porta Toalha '],
    ['P/BASE', 'para Base'],
    ['P/CHUV', 'para Chuveiro'],
    ['P/VALV', 'para Valvula'],
    ['P/DUCHA', 'para Ducha'],
    ['(DE)', 'Deca'],
    ['DECAYOU', 'Deca You'],
    ['ACAB.', 'Acabamento '],
    ['MIST.', 'Misturador '],
    ['CHUV.', 'Chuveiro '],
    ['TORN.', 'Torneira '],
    ['REG.', 'Registro '],
    ['REV.', 'Revestimento '],
    ['PAST.', 'Pastilha '],
    ['LAV.', 'Lavatorio '],
    ['HIG.', 'Higienica '],
    ['DESC.', 'Descarga '],
    ['MONOC.', 'Monocomando '],
    ['MON.', 'Monocomando '],
    ['QUAD.', 'Quadrado '],
    ['FLEX.', 'Flexivel '],
    ['ESC.', 'Escovado '],
    ['DC.', 'Docol '],
    ['MONOC ', 'Monocomando '],
    ['MON ', 'Monocomando '],
    ['QUAD ', 'Quadrado '],
    ['ESC ', 'Escovado '],
    ['NIQ ', 'Niquel '],
    ['HIG ', 'Higienica '],
  ]

  for (const [abbr, expanded] of patterns) {
    title = title.split(abbr).join(expanded)
  }

  // End-of-string suffix expansions
  if (title.endsWith(' CR')) title = title.slice(0, -3) + ' Cromado'
  if (title.endsWith(' MT')) title = title.slice(0, -3) + ' Matte'
  if (title.endsWith(' INX')) title = title.slice(0, -4) + ' Inox'

  // "PAPELEIRO/PAPELEIRA" standalone → prefix "Papeleira"
  if (/\bPAPELEIRO\b/.test(title)) {
    title = title.replace(/\bPAPELEIRO\b/, 'Papeleira')
  }

  // "PERFIL" at start → "Perfil de Acabamento Aluminio"
  if (/^PERFIL\b/.test(title)) {
    title = title.replace(/^PERFIL\b/, 'Perfil de Acabamento Aluminio')
  }

  // Strip internal part numbers (e.g. "520 BK-370", "4901 C-29") that confuse ML
  title = title.replace(/\b\d{3,5}\s+[A-Z]{1,3}-\d{2,4}\b/g, '')

  // Strip dimension specs like "10MMX12MMX3M"
  title = title.replace(/\b\d+MMX\d+MMX\d+M\b/gi, '')

  // Strip standalone short model numbers (e.g. "509", "4901") that confuse ML
  title = title.replace(/\b\d{3,4}\b/g, '')

  // "Acabamento para Base" is too generic — add context
  if (/Acabamento.*para Base/.test(title) && !/Deca/.test(title)) {
    title = title.replace('para Base', 'para Base Deca')
  }
  // "Acabamento Registro" without "para" → add it
  if (/Acabamento Registro/.test(title) && !/para/.test(title)) {
    title = title.replace('Acabamento Registro', 'Acabamento para Registro')
  }

  // "Acabamento" without a finish term → append "Cromado" to help ML match
  if (/^Acabamento/.test(title) && !/Cromado|Escovado|Niquel|Ouro|Matte|Inox|Polido/.test(title)) {
    title += ' Cromado'
  }

  return title.replace(/\s+/g, ' ').trim()
}

function normalizeNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isIgnoredSuggestionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /\((401|404)\):/.test(error.message)
}
