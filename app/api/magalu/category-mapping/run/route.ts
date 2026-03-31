import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import type { NextRequest } from 'next/server'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAGALU_BASE_URL = 'https://api.magalu.com'
const SQLITE_PATH = path.join(process.cwd(), 'data', 'app.db')
const CSV_PATH = path.join(process.cwd(), 'data', 'magalu-category-map.csv')
const XLSX_PATH = path.join(process.cwd(), 'data', 'magalu-category-map.xlsx')

const CATEGORY_CACHE_KEY = 'mc-magalu-categories-cache'
const PRODUCT_CATEGORIES_KEY = 'mc-product-categories-magalu'

type CategoryNode = {
  id: string
  name: string
  parentId: string | null
  path: string
}

type MappingEntry = {
  categoryId: string
  categoryName: string
  categoryPath: string
  confidence: number
  reason: string
  source: 'heuristic'
  mappedAt: string
}

type CategoriesCache = {
  fetchedAt: string
  baseUrl: string
  limit: number
  count: number
  results: CategoryNode[]
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
  const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === '1'

  try {
    const accessToken = await loadMagaluAccessToken(tenantId)

    const db = new Database(SQLITE_PATH)
    const { categories, categoriesCacheUsed } = await loadOrFetchCategories(db, {
      accessToken,
      forceRefresh,
    })

    const { targetProducts, totalTarget } = loadTargetProducts(db)
    const { existingCategoriesByProductId } = loadExistingMappings(db)

    const newlyMapped: Record<string, MappingEntry> = {}
    const lowConfidence: Array<{
      productId: string
      sku: string
      name: string
      categoryPath: string
      confidence: number
      reason: string
    }> = []

    for (const product of targetProducts) {
      if (existingCategoriesByProductId[product.id]) continue

      const tokens = [
        ...tokenize(product.name),
        ...tokenize(product.category),
        ...tokenize(product.primaryTaxonomyGroupName),
      ]

      const best = pickBestCategory(categories, tokens)
      if (!best) {
        continue
      }

      const score = best.score
      const confidence = Math.min(1, score / 6)
      const mappedAt = new Date().toISOString()

      newlyMapped[product.id] = {
        categoryId: best.id,
        categoryName: best.name,
        categoryPath: best.path,
        confidence,
        reason: `heuristic match (${score} tokens)`,
        source: 'heuristic',
        mappedAt,
      }

      if (confidence < 0.3) {
        lowConfidence.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          categoryPath: best.path || best.name,
          confidence,
          reason: `heuristic match (${score} tokens)`,
        })
      }
    }

    const merged = { ...existingCategoriesByProductId, ...newlyMapped }

    const persistPayload = JSON.stringify({
      state: { categories: merged },
      version: 0,
    })

    upsertKv(db, PRODUCT_CATEGORIES_KEY, persistPayload)

    const csv = buildCsv(targetProducts, merged)
    fs.writeFileSync(CSV_PATH, csv, 'utf8')

    const xlsxBuffer = await buildXlsx(targetProducts, merged)
    fs.writeFileSync(XLSX_PATH, xlsxBuffer)

    const mdInfo = writeSummaryMd({
      startedAt,
      categoriesCacheUsed,
      categoriesCount: categories.length,
      totalTarget,
      newlyMappedCount: Object.keys(newlyMapped).length,
      existingCount: Object.keys(existingCategoriesByProductId).length,
      lowConfidence,
      baseUrl: MAGALU_BASE_URL,
    })

    const elapsedMs = Date.now() - startedAt

    return Response.json({
      success: true,
      stats: {
        totalTarget,
        existing: Object.keys(existingCategoriesByProductId).length,
        newlyMapped: Object.keys(newlyMapped).length,
        lowConfidence: lowConfidence.length,
        categories: categories.length,
        cacheUsed: categoriesCacheUsed,
        elapsedMs,
      },
      outputs: {
        csvPath: 'data/magalu-category-map.csv',
        xlsxPath: 'data/magalu-category-map.xlsx',
        mdPath: mdInfo.relativePath,
      },
      lowConfidenceTop10: lowConfidence
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, 10),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao rodar mapeamento Magalu'
    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}

async function loadMagaluAccessToken(tenantId?: string): Promise<string> {
  const connection = await getConnectionByChannelId('magalu', tenantId)
  if (!connection) throw new Error('Conexao do Magalu nao encontrada')
  if (!connection.hasStoredSecret) throw new Error('Conexao do Magalu sem segredo salvo')

  const secrets = await getDecryptedConnectionSecrets(connection.connectionId, tenantId)
  if (!secrets) throw new Error('Falha ao descriptografar credenciais do Magalu')

  const accessToken = typeof secrets.accessToken === 'string' ? secrets.accessToken : ''
  if (!accessToken) throw new Error('Access token do Magalu nao encontrado nas credenciais')
  return accessToken
}

async function loadOrFetchCategories(
  db: Database.Database,
  opts: { accessToken: string; forceRefresh: boolean }
): Promise<{ categories: CategoryNode[]; categoriesCacheUsed: boolean }> {
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000
  const now = Date.now()

  if (!opts.forceRefresh) {
    const cached = getKvJson<CategoriesCache>(db, CATEGORY_CACHE_KEY)
    if (cached?.fetchedAt) {
      const fetchedAtMs = Date.parse(cached.fetchedAt)
      if (Number.isFinite(fetchedAtMs) && now - fetchedAtMs < CACHE_TTL_MS && Array.isArray(cached.results) && cached.results.length > 0) {
        return { categories: cached.results, categoriesCacheUsed: true }
      }
    }
  }

  const categories = await fetchAllCategories({
    accessToken: opts.accessToken,
    baseUrl: MAGALU_BASE_URL,
  })

  const cachePayload: CategoriesCache = {
    fetchedAt: new Date().toISOString(),
    baseUrl: MAGALU_BASE_URL,
    limit: 50,
    count: categories.length,
    results: categories,
  }
  upsertKv(db, CATEGORY_CACHE_KEY, JSON.stringify(cachePayload))

  return { categories, categoriesCacheUsed: false }
}

async function fetchAllCategories(opts: {
  accessToken: string
  baseUrl: string
}): Promise<CategoryNode[]> {
  const results: CategoryNode[] = []

  let limit = 50
  let offset = 0

  for (let page = 0; page < 10_000; page += 1) {
    const url = new URL(`${opts.baseUrl}/seller/v1/portfolios/categories/hierarchy`)
    url.searchParams.set('_offset', String(offset))
    url.searchParams.set('_limit', String(limit))

    const res = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    })

    const json = (await res.json()) as any
    const maxLimit = Number(json?.meta?.page?.max_limit ?? 0)
    if (Number.isFinite(maxLimit) && maxLimit > 0) {
      limit = Math.min(limit, maxLimit)
    }

    const pageResults = Array.isArray(json?.results) ? json.results : []
    for (const item of pageResults) {
      const id = String(item?.id ?? '')
      if (!id) continue
      results.push({
        id,
        name: String(item?.name ?? ''),
        parentId: item?.parent_id ? String(item.parent_id) : null,
        path: String(item?.path ?? ''),
      })
    }

    if (pageResults.length < limit) break
    offset += pageResults.length
  }

  return results
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const MAX_ATTEMPTS = 5
  const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res

      if (!RETRY_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) {
        const text = await res.text()
        throw new Error(`Magalu request failed (${res.status}): ${truncate(text, 400)}`)
      }

      await sleep(backoffMs(attempt))
      continue
    } catch (error) {
      lastError = error
      if (attempt === MAX_ATTEMPTS) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      await sleep(backoffMs(attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown Magalu fetch error')
}

function backoffMs(attempt: number): number {
  const base = 500
  const max = 8_000
  const exp = Math.min(max, base * 2 ** (attempt - 1))
  const jitter = Math.floor(Math.random() * 250)
  return exp + jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function getKvJson<T>(db: Database.Database, key: string): T | null {
  const row = db.prepare('select value from kv_store where key=?').get(key) as { value?: string } | undefined
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

function upsertKv(db: Database.Database, key: string, value: string) {
  db.prepare(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value)
}

function loadTargetProducts(db: Database.Database): {
  targetProducts: Array<{
    id: string
    sku: string
    name: string
    category: string
    primaryTaxonomyGroupName?: string
  }>
  totalTarget: number
} {
  const productsRow = db.prepare('select value from kv_store where key=?').get('mc-products') as { value: string } | undefined
  const classificationsRow = db.prepare('select value from kv_store where key=?').get('mc-classifications') as { value: string } | undefined
  if (!productsRow || !classificationsRow) {
    throw new Error('Missing mc-products or mc-classifications in kv_store')
  }

  const productsState = JSON.parse(productsRow.value)
  const classificationsState = JSON.parse(classificationsRow.value)
  const products = productsState?.state?.products || []
  const classifications = classificationsState?.state?.classifications || []

  const targetIds = new Set(
    classifications.flatMap((c: any) => (Array.isArray(c.productIds) ? c.productIds : []))
  )

  const targetProducts = (products as any[])
    .filter((p) => targetIds.has(p.id))
    .map((p) => ({
      id: String(p.id),
      sku: String(p.sku ?? ''),
      name: String(p.name ?? ''),
      category: String(p.category ?? ''),
      primaryTaxonomyGroupName:
        typeof p.primaryTaxonomyGroupName === 'string' ? p.primaryTaxonomyGroupName : undefined,
    }))

  return { targetProducts, totalTarget: targetProducts.length }
}

function loadExistingMappings(db: Database.Database): {
  existingCategoriesByProductId: Record<string, MappingEntry>
} {
  const row = db.prepare('select value from kv_store where key=?').get(PRODUCT_CATEGORIES_KEY) as { value?: string } | undefined
  if (!row?.value) {
    return { existingCategoriesByProductId: {} }
  }

  try {
    const parsed = JSON.parse(row.value)
    const categories = parsed?.state?.categories
    if (!categories || typeof categories !== 'object') {
      return { existingCategoriesByProductId: {} }
    }
    return { existingCategoriesByProductId: categories as Record<string, MappingEntry> }
  } catch {
    return { existingCategoriesByProductId: {} }
  }
}

function tokenize(text: unknown): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3)
}

function pickBestCategory(
  categories: CategoryNode[],
  tokens: string[]
): (CategoryNode & { score: number }) | null {
  let best: (CategoryNode & { score: number }) | null = null

  for (const category of categories) {
    const hay = `${category.name} ${category.path}`.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (hay.includes(token)) score += 1
    }

    if (!best || score > best.score) {
      best = { ...category, score }
    }
  }

  return best && best.score > 0 ? best : null
}

function buildCsv(
  products: Array<{ id: string; sku: string; name: string }>,
  mapping: Record<string, MappingEntry>
): string {
  const lines = ['product_id,sku,name,category_id,category_path,confidence,reason']
  const safe = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

  for (const product of products) {
    const mapped = mapping[product.id]
    lines.push(
      [
        safe(product.id),
        safe(product.sku),
        safe(product.name),
        safe(mapped?.categoryId ?? ''),
        safe(mapped?.categoryPath || mapped?.categoryName || ''),
        safe(mapped?.confidence ?? ''),
        safe(mapped?.reason ?? ''),
      ].join(',')
    )
  }

  return lines.join('\n')
}

async function buildXlsx(
  products: Array<{ id: string; sku: string; name: string }>,
  mapping: Record<string, MappingEntry>
): Promise<Buffer> {
  const xlsx = await import('xlsx')

  const rows = products.map((product) => {
    const mapped = mapping[product.id]
    return {
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      category_id: mapped?.categoryId ?? '',
      category_path: mapped?.categoryPath || mapped?.categoryName || '',
      confidence: mapped?.confidence ?? '',
      reason: mapped?.reason ?? '',
    }
  })

  const ws = xlsx.utils.json_to_sheet(rows)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'magalu_categories')
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function writeSummaryMd(input: {
  startedAt: number
  categoriesCacheUsed: boolean
  categoriesCount: number
  totalTarget: number
  newlyMappedCount: number
  existingCount: number
  lowConfidence: Array<{
    productId: string
    sku: string
    name: string
    categoryPath: string
    confidence: number
    reason: string
  }>
  baseUrl: string
}): { relativePath: string } {
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `magalu-category-mapping-${date}.md`
  const absoluteDir = path.join(process.cwd(), '.brain', 'progress')
  const absolutePath = path.join(absoluteDir, fileName)
  const relativePath = path.join('.brain', 'progress', fileName).replace(/\\/g, '/')

  fs.mkdirSync(absoluteDir, { recursive: true })

  const elapsedMs = Date.now() - input.startedAt
  const low = [...input.lowConfidence].sort((a, b) => a.confidence - b.confidence).slice(0, 10)

  const lines: string[] = []
  lines.push(`# Magalu — Category mapping (${date})`)
  lines.push('')
  lines.push(`- Base URL: \`${input.baseUrl}\``)
  lines.push(`- Categories fetched: **${input.categoriesCount}**`)
  lines.push(`- Cache used: **${input.categoriesCacheUsed ? 'yes' : 'no'}**`)
  lines.push(`- Target products: **${input.totalTarget}**`)
  lines.push(`- Newly mapped: **${input.newlyMappedCount}**`)
  lines.push(`- Already existed: **${input.existingCount}**`)
  lines.push(`- Low confidence (< 0.3): **${input.lowConfidence.length}**`)
  lines.push(`- Elapsed: **${Math.round(elapsedMs / 100) / 10}s**`)
  lines.push('')
  lines.push('## Low confidence (top 10)')
  lines.push('')
  if (low.length === 0) {
    lines.push('- None')
  } else {
    for (const item of low) {
      lines.push(
        `- \`${item.sku}\` (${item.confidence.toFixed(2)}) — ${item.categoryPath} — ${item.reason}`
      )
    }
  }
  lines.push('')
  lines.push('## Outputs')
  lines.push('')
  lines.push(`- \`data/magalu-category-map.csv\``)
  lines.push(`- \`data/magalu-category-map.xlsx\``)

  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf8')
  return { relativePath }
}

