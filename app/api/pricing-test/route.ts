import { NextRequest, NextResponse } from 'next/server'
import {
  MercadoLivreClient,
  type MeLiPriceSuggestion,
  type MeLiSecrets,
} from '@/lib/clients/mercado-livre'
import { query } from '@/lib/db'
import { fetchProductsByIds } from '@/lib/metalshopping-client'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'
import { kvGet } from '@/lib/sqlite'

type StoredClassificationState = {
  state?: {
    classifications?: Array<{
      id?: string
      name?: string
      productIds?: string[]
      aiContext?: string
      createdAt?: string
      updatedAt?: string
    }>
  }
  version?: number
}

type PricingTestResult = {
  productId: string
  sku: string
  name: string
  ean: string | null
  basePrice: number
  mlListingId: string | null
  priceSuggestion: MeLiPriceSuggestion | null
  eanSearchResults: Array<{ title: string; price: number; permalink?: string }>
  hasSuggestion: boolean
  hasEanResults: boolean
}

const CHANNEL_ID = 'mercado-livre'
const CHUNK_SIZE = 3
const CHUNK_DELAY_MS = 200

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const rawClassifications = kvGet('mc-classifications')
    const productIds = extractClassificationProductIds(rawClassifications)

    if (productIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nenhuma classificação encontrada no SQLite',
        },
        { status: 200 }
      )
    }

    const products = await fetchProductsByIds(productIds, tenantId)
    const listingResult = await query(
      `SELECT product_id, external_listing_id
       FROM marketplace_remote_listings
       WHERE channel_id = 'mercado-livre'
         AND product_id = ANY($1::text[])`,
      [productIds],
      tenantId
    )

    const mlListingMap = new Map<string, string>()
    for (const row of listingResult.rows as Array<{
      product_id?: string
      external_listing_id?: string
    }>) {
      if (row.product_id && row.external_listing_id) {
        mlListingMap.set(row.product_id, row.external_listing_id)
      }
    }

    const connection = await getConnectionByChannelId(CHANNEL_ID, tenantId)
    const secrets =
      connection?.hasStoredSecret && connection.connectionId
        ? await getDecryptedConnectionSecrets(connection.connectionId, tenantId)
        : null
    const envSecrets = getEnvMeLiSecrets()

    let client: MercadoLivreClient | null = null
    let mlClientAvailable = false

    if (secrets) {
      client = new MercadoLivreClient(toMeLiSecrets(secrets))
      try {
        await client.refreshAccessToken()
        mlClientAvailable = true
      } catch (error) {
        console.error('pricing-test: failed to refresh Mercado Livre token', error)
        client = null
      }
    } else if (envSecrets) {
      client = new MercadoLivreClient(envSecrets)
      try {
        await client.refreshAccessToken()
        mlClientAvailable = true
      } catch (error) {
        console.error('pricing-test: failed to refresh Mercado Livre token from env vars', error)
        client = null
      }
    }

    // EAN search uses publicFetch, so auth is optional here.
    const publicMeLiClient =
      client ??
      new MercadoLivreClient(
        envSecrets ?? { clientId: '', clientSecret: '', refreshToken: '' }
      )

    const results: PricingTestResult[] = []

    for (let index = 0; index < products.length; index += CHUNK_SIZE) {
      const chunk = products.slice(index, index + CHUNK_SIZE)
      const chunkResults = await Promise.all(
        chunk.map(async (product) => {
          const mlListingId = mlListingMap.get(product.product_id) ?? null

          const [priceSuggestion, eanSearchResults] = await Promise.all([
            mlListingId && client && mlClientAvailable
              ? client.getPriceSuggestion(mlListingId).catch(() => null)
              : Promise.resolve(null),
            product.ean
              ? publicMeLiClient.searchByEan(product.ean).catch(() => [])
              : Promise.resolve([]),
          ])

          return {
            productId: product.product_id,
            sku: product.sku,
            name: product.name,
            ean: product.ean ?? null,
            basePrice: Number(product.base_price ?? 0),
            mlListingId,
            priceSuggestion,
            eanSearchResults,
            hasSuggestion: priceSuggestion !== null,
            hasEanResults: eanSearchResults.length > 0,
          } satisfies PricingTestResult
        })
      )

      results.push(...chunkResults)

      if (index + CHUNK_SIZE < products.length) {
        await delay(CHUNK_DELAY_MS)
      }
    }

    return NextResponse.json(
      {
        success: true,
        summary: {
          totalProducts: results.length,
          withMlListing: results.filter((result) => result.mlListingId !== null).length,
          withEan: results.filter((result) => result.ean !== null).length,
          withSuggestion: results.filter((result) => result.hasSuggestion).length,
          withEanResults: results.filter((result) => result.hasEanResults).length,
        },
        mlClientAvailable,
        results,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('pricing-test route failed', error)

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Falha ao executar diagnostico de pricing',
      },
      { status: 500 }
    )
  }
}

function extractClassificationProductIds(rawValue: string | null): string[] {
  if (!rawValue) return []

  const parsed = JSON.parse(rawValue) as StoredClassificationState
  const ids = new Set<string>()

  for (const classification of parsed.state?.classifications ?? []) {
    for (const productId of classification.productIds ?? []) {
      if (typeof productId === 'string' && productId.trim()) {
        ids.add(productId)
      }
    }
  }

  return Array.from(ids)
}

function toMeLiSecrets(secrets: Record<string, unknown>): MeLiSecrets {
  return {
    clientId: asString(secrets.clientId),
    clientSecret: asString(secrets.clientSecret),
    refreshToken: asString(secrets.refreshToken),
    accessToken: asOptionalString(secrets.accessToken),
    userId: asOptionalString(secrets.userId),
  }
}

function getEnvMeLiSecrets(): MeLiSecrets | null {
  const clientId = process.env.MELI_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.MELI_CLIENT_SECRET?.trim() ?? ''
  const refreshToken = process.env.MELI_REFRESH_TOKEN?.trim() ?? ''

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
