import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'))

const MAGALU_CLIENT_ID = process.env.MAGALU_CLIENT_ID
const MAGALU_CLIENT_SECRET = process.env.MAGALU_CLIENT_SECRET
if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
  throw new Error('MAGALU_CLIENT_ID / MAGALU_CLIENT_SECRET are required in .env.local.')
}

const MAGALU_USE_SANDBOX = process.env.MAGALU_USE_SANDBOX === 'true'
const MAGALU_BASE_URL = process.env.MAGALU_API_BASE || (MAGALU_USE_SANDBOX
  ? 'https://api-sandbox.magalu.com'
  : 'https://api.magalu.com')
const MAGALU_ACCESS_TOKEN = process.env.MAGALU_ACCESS_TOKEN
const MAGALU_AUTH_CODE = process.env.MAGALU_AUTH_CODE
const MAGALU_REDIRECT_URI = process.env.MAGALU_REDIRECT_URI
const MAP_MODE = 'heuristic'

async function getMagaluToken() {
  if (MAGALU_ACCESS_TOKEN && MAGALU_ACCESS_TOKEN.trim().length > 0) {
    return MAGALU_ACCESS_TOKEN.trim()
  }

  if (MAGALU_AUTH_CODE && MAGALU_REDIRECT_URI) {
    const res = await fetch('https://id.magalu.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: MAGALU_CLIENT_ID,
        client_secret: MAGALU_CLIENT_SECRET,
        redirect_uri: MAGALU_REDIRECT_URI,
        code: MAGALU_AUTH_CODE,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Magalu auth code exchange failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    if (!data.access_token) {
      throw new Error('Magalu auth code exchange did not return access_token')
    }
    return data.access_token
  }

  throw new Error(
    'Missing MAGALU_ACCESS_TOKEN or MAGALU_AUTH_CODE+MAGALU_REDIRECT_URI. Use OAuth consent to obtain a code, or paste a token.'
  )
}

async function fetchMagaluCategories(token) {
  const res = await fetch(
    `${MAGALU_BASE_URL}/seller/v1/portfolios/categories/hierarchy?_offset=0&_limit=1000`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Magalu categories failed (${res.status}): ${text}`)
  }
  return res.json()
}

function extractCategoryList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.results)) return raw.results
  if (raw && Array.isArray(raw.data)) return raw.data
  return []
}

function normalizeCategory(item) {
  const id = item.id ?? item.category_id ?? item.categoryId ?? item.uuid ?? ''
  const name =
    item.name ?? item.category_name ?? item.categoryName ?? item.title ?? item.description ?? ''
  const parentId =
    item.parent_id ??
    item.parentId ??
    item.parent_category_id ??
    item.parentCategoryId ??
    null
  const pathValue =
    item.path ?? item.full_path ?? item.fullPath ?? item.category_path ?? item.categoryPath ?? null
  return {
    id: String(id),
    name: String(name),
    parentId: parentId ? String(parentId) : null,
    path: pathValue ? String(pathValue) : null,
    raw: item,
  }
}

function buildPath(category, byId) {
  if (category.path) return category.path
  const parts = []
  const seen = new Set()
  let cursor = category
  while (cursor && cursor.id && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    if (cursor.name) parts.push(cursor.name)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null
  }
  return parts.reverse().join(' / ')
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3)
}

function scoreCategory(category, tokens) {
  const hay = `${category.name} ${category.path}`.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (hay.includes(token)) score += 1
  }
  return score
}

async function main() {
  const token = await getMagaluToken()
  const raw = await fetchMagaluCategories(token)
  const list = extractCategoryList(raw).map(normalizeCategory).filter((c) => c.id)
  if (list.length === 0) throw new Error('No categories returned from Magalu API.')

  const byId = new Map(list.map((c) => [c.id, c]))
  const categories = list.map((c) => ({
    ...c,
    path: buildPath(c, byId),
  }))

  const db = new Database(path.join(process.cwd(), 'data', 'app.db'))
  const productsRow = db.prepare('select value from kv_store where key=?').get('mc-products')
  const classificationsRow = db.prepare('select value from kv_store where key=?').get('mc-classifications')
  if (!productsRow || !classificationsRow) {
    throw new Error('Missing mc-products or mc-classifications in kv_store.')
  }

  const productsState = JSON.parse(productsRow.value)
  const classificationsState = JSON.parse(classificationsRow.value)
  const products = productsState?.state?.products || []
  const classifications = classificationsState?.state?.classifications || []

  const targetIds = new Set(
    classifications.flatMap((c) => Array.isArray(c.productIds) ? c.productIds : [])
  )
  const targetProducts = products.filter((p) => targetIds.has(p.id))
  if (targetProducts.length === 0) {
    throw new Error('No target products found in the selected classifications.')
  }

  const existingRow = db.prepare('select value from kv_store where key=?').get('mc-product-categories-magalu')
  const existingState = existingRow ? JSON.parse(existingRow.value) : { state: { categories: {} }, version: 0 }
  const existingCategories = existingState?.state?.categories || {}

  const mappings = {}
  for (const product of targetProducts) {
    if (existingCategories[product.id]) continue

    const tokens = [
      ...tokenize(product.name),
      ...tokenize(product.category),
      ...tokenize(product.primaryTaxonomyGroupName),
    ]
    const ranked = categories
      .map((c) => ({ ...c, score: scoreCategory(c, tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)

    const best = ranked[0]
    if (!best || !best.id) {
      throw new Error(`No category candidate for SKU ${product.sku}`)
    }

    const categoryId = String(best.id)
    const categoryName = String(best.name || '')
    const categoryPath = String(best.path || '')
    const confidence = Math.min(1, (best.score || 0) / 6)
    const reason = `heuristic match (${best.score} tokens)`

    mappings[product.id] = {
      categoryId,
      categoryName,
      categoryPath,
      confidence,
      reason,
      source: 'heuristic',
      mappedAt: new Date().toISOString(),
    }
    console.log(`Mapped SKU ${product.sku} -> ${categoryId} (${categoryPath || categoryName})`)
  }

  const nextState = {
    state: {
      categories: { ...existingCategories, ...mappings },
    },
    version: 0,
  }
  const payload = JSON.stringify(nextState)
  db.prepare(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run('mc-product-categories-magalu', payload)

  const csvLines = ['product_id,sku,name,category_id,category_path,confidence,reason']
  for (const product of targetProducts) {
    const mapped = nextState.state.categories[product.id]
    if (!mapped) continue
    const safe = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    csvLines.push([
      safe(product.id),
      safe(product.sku),
      safe(product.name),
      safe(mapped.categoryId),
      safe(mapped.categoryPath || mapped.categoryName),
      safe(mapped.confidence ?? ''),
      safe(mapped.reason ?? ''),
    ].join(','))
  }
  fs.writeFileSync(path.join(process.cwd(), 'data', 'magalu-category-map.csv'), csvLines.join('\n'))

  console.log(`Done. Mapped ${Object.keys(mappings).length} products.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
