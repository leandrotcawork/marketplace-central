import Database from 'better-sqlite3'
import pg from 'pg'

const { Pool } = pg

const SQLITE_DB_PATH = './data/app.db'
const CLASSIFICATION_KEY = 'mc-classifications'
const BATCH_SIZE = 3
const BATCH_DELAY_MS = 300

let metalShoppingPool = null
let marketplacePool = null

try {
  await main()
} catch (error) {
  console.error('Fatal:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closePools()
}

async function main() {
  assertRequiredEnv('MELI_CLIENT_ID')
  assertRequiredEnv('MELI_CLIENT_SECRET')
  assertRequiredEnv('MELI_REFRESH_TOKEN')

  const envSummary = resolveDbEnvSummary()
  console.log('Using database env vars:')
  console.log(`  Product DB: ${envSummary.product}`)
  console.log(`  Marketplace DB: ${envSummary.marketplace}`)

  const auth = await refreshMercadoLivreToken()
  const productIds = loadClassificationProductIds()

  if (productIds.length === 0) {
    console.log('No classified product IDs found in SQLite.')
    return
  }

  const [products, listingMap] = await Promise.all([
    fetchProducts(productIds),
    fetchMarketplaceListings(productIds),
  ])

  const rows = []
  for (let index = 0; index < products.length; index += BATCH_SIZE) {
    const batch = products.slice(index, index + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((product) => runPricingChecks(product, listingMap.get(product.product_id) ?? null, auth))
    )

    rows.push(...batchResults)

    if (index + BATCH_SIZE < products.length) {
      await delay(BATCH_DELAY_MS)
    }
  }

  printReport(rows)
}

function assertRequiredEnv(name) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
}

async function refreshMercadoLivreToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.MELI_CLIENT_ID,
    client_secret: process.env.MELI_CLIENT_SECRET,
    refresh_token: process.env.MELI_REFRESH_TOKEN,
  })

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `Mercado Livre auth failed (${response.status}): ${stringifyForError(payload)}`
    )
  }

  if (!payload.access_token || !payload.user_id) {
    throw new Error('Mercado Livre auth response is missing access_token or user_id')
  }

  return {
    accessToken: payload.access_token,
    userId: String(payload.user_id),
  }
}

function loadClassificationProductIds() {
  const db = new Database(SQLITE_DB_PATH, { readonly: true })

  try {
    const row = db
      .prepare('SELECT value FROM kv_store WHERE key = ?')
      .get(CLASSIFICATION_KEY)

    if (!row?.value) {
      return []
    }

    const parsed = JSON.parse(row.value)
    const ids = new Set()

    for (const classification of parsed?.state?.classifications ?? []) {
      for (const productId of classification?.productIds ?? []) {
        if (typeof productId === 'string' && productId.trim()) {
          ids.add(productId.trim())
        }
      }
    }

    return [...ids]
  } finally {
    db.close()
  }
}

async function fetchProducts(productIds) {
  const pool = getMetalShoppingPool()
  const sql = `
    SELECT cp.product_id, cp.sku, cp.name,
      MAX(CASE WHEN pi.identifier_type = 'ean' THEN pi.identifier_value END) as ean,
      COALESCE(ppp.price_amount, 0) as base_price
    FROM catalog_products cp
    LEFT JOIN pricing_product_prices ppp ON cp.product_id = ppp.product_id
      AND ppp.pricing_status = 'active' AND ppp.effective_to IS NULL
    LEFT JOIN catalog_product_identifiers pi ON cp.product_id = pi.product_id
    WHERE cp.product_id = ANY($1::text[])
    GROUP BY cp.product_id, cp.sku, cp.name, ppp.price_amount
    ORDER BY cp.sku NULLS LAST, cp.name
  `
  const result = await queryWithTenant(pool, sql, [productIds])

  return result.rows.map((row) => ({
    product_id: String(row.product_id),
    sku: row.sku ? String(row.sku) : '-',
    name: row.name ? String(row.name) : '',
    ean: row.ean ? String(row.ean) : null,
    base_price: Number(row.base_price ?? 0),
  }))
}

async function fetchMarketplaceListings(productIds) {
  const pool = getMarketplacePool()
  const sql = `
    SELECT product_id, external_listing_id
    FROM marketplace_remote_listings
    WHERE channel_id = 'mercado-livre'
      AND product_id = ANY($1::text[])
  `
  const result = await queryWithTenant(pool, sql, [productIds])
  const map = new Map()

  for (const row of result.rows) {
    if (row.product_id && row.external_listing_id) {
      map.set(String(row.product_id), String(row.external_listing_id))
    }
  }

  return map
}

async function runPricingChecks(product, externalListingId, auth) {
  const [eanResult, suggestionResult] = await Promise.all([
    product.ean ? fetchEanSearch(product.ean, auth.accessToken) : Promise.resolve(emptyEanResult('NO_EAN')),
    externalListingId
      ? fetchPriceSuggestion(externalListingId, auth.accessToken)
      : Promise.resolve(emptySuggestionResult('NO_LISTING')),
  ])

  return {
    ...product,
    externalListingId,
    eanResult,
    suggestionResult,
  }
}

async function fetchEanSearch(ean, accessToken) {
  const url = new URL('https://api.mercadolibre.com/sites/MLB/search')
  url.searchParams.set('gtin', ean)
  url.searchParams.set('limit', '5')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return emptyEanResult(`HTTP_${response.status}`, payload)
  }

  const items = Array.isArray(payload.results)
    ? payload.results
        .map((item) => ({
          title: typeof item?.title === 'string' ? item.title : '',
          price: Number(item?.price ?? NaN),
        }))
        .filter((item) => Number.isFinite(item.price))
    : []

  if (items.length === 0) {
    return {
      status: 'NO_RESULTS',
      count: 0,
      min_price: null,
      max_price: null,
      items: [],
    }
  }

  const prices = items.map((item) => item.price)
  return {
    status: 'OK',
    count: items.length,
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    items,
  }
}

async function fetchPriceSuggestion(externalListingId, accessToken) {
  const response = await fetch(
    `https://api.mercadolibre.com/suggestions/items/${encodeURIComponent(externalListingId)}/details`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return emptySuggestionResult(`HTTP_${response.status}`, payload)
  }

  return {
    status: typeof payload.status === 'string' ? payload.status : 'OK',
    suggested_price: asAmount(payload?.suggested_price?.amount),
    lowest_price: asAmount(payload?.lowest_price?.amount),
    percent_difference: asNumber(payload?.percent_difference),
    raw: payload,
  }
}

function emptyEanResult(status, raw = null) {
  return {
    status,
    count: 0,
    min_price: null,
    max_price: null,
    items: [],
    raw,
  }
}

function emptySuggestionResult(status, raw = null) {
  return {
    status,
    suggested_price: null,
    lowest_price: null,
    percent_difference: null,
    raw,
  }
}

function printReport(rows) {
  const totalProducts = rows.length
  const withEan = rows.filter((row) => row.ean).length
  const withListing = rows.filter((row) => row.externalListingId).length
  const eanMatches = rows.filter((row) => row.eanResult.count > 0)
  const suggestionMatches = rows.filter(
    (row) =>
      row.suggestionResult.suggested_price !== null ||
      row.suggestionResult.lowest_price !== null
  )

  console.log('\n=== PRICING TEST RESULTS ===')
  console.log(
    `Total products: ${totalProducts} | With EAN: ${withEan} | With ML listing: ${withListing}`
  )

  console.log(`\nEAN SEARCH RESULTS (${eanMatches.length} products got results):`)
  printTable(
    ['SKU', 'Name (40 chars)', 'Base R$', 'Min R$', 'Max R$', 'Count', 'Status'],
    eanMatches.map((row) => [
      row.sku,
      truncate(row.name, 40),
      formatMoney(row.base_price),
      formatMoney(row.eanResult.min_price),
      formatMoney(row.eanResult.max_price),
      String(row.eanResult.count),
      formatStatus(row.eanResult.status, row.eanResult.count > 0),
    ])
  )

  console.log(
    `\nPRICE SUGGESTION RESULTS (${suggestionMatches.length} products got results):`
  )
  printTable(
    ['SKU', 'Name (40 chars)', 'Base R$', 'Suggested R$', 'Lowest R$', 'Diff%', 'Status'],
    suggestionMatches.map((row) => [
      row.sku,
      truncate(row.name, 40),
      formatMoney(row.base_price),
      formatMoney(row.suggestionResult.suggested_price),
      formatMoney(row.suggestionResult.lowest_price),
      formatPercent(row.suggestionResult.percent_difference),
      formatStatus(
        row.suggestionResult.status,
        row.suggestionResult.suggested_price !== null ||
          row.suggestionResult.lowest_price !== null
      ),
    ])
  )

  console.log('')
  if (eanMatches.length > suggestionMatches.length) {
    console.log(
      `✅ EAN SEARCH wins: more coverage (${eanMatches.length} vs ${suggestionMatches.length} products)`
    )
  } else if (suggestionMatches.length > eanMatches.length) {
    console.log(
      `✅ SUGGESTION API wins: more coverage (${suggestionMatches.length} vs ${eanMatches.length} products)`
    )
  } else if (eanMatches.length === 0 && suggestionMatches.length === 0) {
    console.log('⚠️  No results from either API. Check credentials and ML listings.')
  } else {
    console.log(
      `Tie: both APIs returned results for ${eanMatches.length} products. Review price quality, not just coverage.`
    )
  }
}

function printTable(headers, rows) {
  if (rows.length === 0) {
    console.log('(no rows)')
    return
  }

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length))
  )

  const alignRight = new Set([2, 3, 4, 5])

  console.log(formatTableRow(headers, widths, alignRight))
  console.log(
    widths
      .map((width, index) => {
        const dash = '-'.repeat(width)
        return alignRight.has(index) ? dash.padStart(width, '-') : dash
      })
      .join(' | ')
  )

  for (const row of rows) {
    console.log(formatTableRow(row, widths, alignRight))
  }
}

function formatTableRow(cells, widths, alignRight) {
  return cells
    .map((cell, index) => {
      const value = String(cell ?? '')
      return alignRight.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index])
    })
    .join(' | ')
}

function formatMoney(value) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : Number(value).toFixed(2)
}

function formatPercent(value) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : `${Number(value).toFixed(2)}`
}

function formatStatus(status, ok) {
  return ok ? '✓' : status
}

function truncate(value, maxLength) {
  if (!value) return ''
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`
}

function asAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringifyForError(payload) {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function resolveDbEnvSummary() {
  const product = process.env.DATABASE_URL
    ? 'DATABASE_URL'
    : process.env.MS_DATABASE_URL
      ? 'MS_DATABASE_URL'
      : hasPgParts()
        ? 'PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD'
        : 'missing'

  const marketplace = process.env.DATABASE_URL
    ? 'DATABASE_URL'
    : hasDbParts()
      ? 'DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD'
      : process.env.MS_DATABASE_URL
        ? 'MS_DATABASE_URL'
        : hasPgParts()
          ? 'PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD'
          : 'missing'

  return { product, marketplace }
}

/** Run a query with tenant context set (mirrors lib/db.ts RLS setup) */
async function queryWithTenant(pool, sql, values = []) {
  const tenantId = process.env.MS_TENANT_ID || 'tenant_default'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId])
    const result = await client.query(sql, values)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function getMetalShoppingPool() {
  if (!metalShoppingPool) {
    metalShoppingPool = new Pool(resolveProductDbConfig())
  }
  return metalShoppingPool
}

function getMarketplacePool() {
  if (!marketplacePool) {
    const config = resolveMarketplaceDbConfig()
    marketplacePool = new Pool(config)
  }
  return marketplacePool
}

function resolveProductDbConfig() {
  if (process.env.DATABASE_URL?.trim()) {
    return { connectionString: process.env.DATABASE_URL.trim() }
  }

  if (process.env.MS_DATABASE_URL?.trim()) {
    return { connectionString: process.env.MS_DATABASE_URL.trim() }
  }

  if (hasPgParts()) {
    return {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: normalizeSslMode(process.env.PGSSLMODE),
    }
  }

  throw new Error('No PostgreSQL config found for product database')
}

function resolveMarketplaceDbConfig() {
  if (process.env.DATABASE_URL?.trim()) {
    return { connectionString: process.env.DATABASE_URL.trim() }
  }

  if (hasDbParts()) {
    return {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: normalizeSslMode(process.env.DB_SSLMODE),
    }
  }

  return resolveProductDbConfig()
}

function hasPgParts() {
  return Boolean(
    process.env.PGHOST &&
      process.env.PGPORT &&
      process.env.PGDATABASE &&
      process.env.PGUSER &&
      process.env.PGPASSWORD
  )
}

function hasDbParts() {
  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_PORT &&
      process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD
  )
}

function normalizeSslMode(mode) {
  return mode && mode !== 'disable' ? { rejectUnauthorized: false } : false
}

async function closePools() {
  await Promise.allSettled([
    metalShoppingPool?.end?.(),
    marketplacePool && marketplacePool !== metalShoppingPool ? marketplacePool.end() : null,
  ])
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
