const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const crypto = require('crypto')

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
const env = {}
for (const raw of envText.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const idx = line.indexOf('=')
  if (idx === -1) continue
  const key = line.slice(0, idx).trim()
  const value = line.slice(idx + 1)
  env[key] = value
}

const dbUrl = env.MS_DATABASE_URL
const tenant = env.MS_TENANT_ID || 'tenant_default'
const secretKeyMaterial = env.MARKETPLACE_SECRET_KEY || 'marketplace-central-dev-key'

if (!dbUrl) {
  console.error('MS_DATABASE_URL not found')
  process.exit(1)
}

function decryptEnvelope(envelope) {
  const key = crypto.createHash('sha256').update(secretKeyMaterial).digest()
  const decipher = crypto.createDecipheriv(
    envelope.algorithm,
    key,
    Buffer.from(envelope.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(decrypted)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, headers, maxAttempts = 8) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, { headers })
      const text = await resp.text()
      let body = text
      try {
        body = JSON.parse(text)
      } catch {}
      if (resp.status === 429 || (resp.status >= 500 && resp.status <= 504)) {
        lastErr = { status: resp.status, body }
        const backoff = Math.min(15000, 600 * 2 ** (attempt - 1))
        const jitter = Math.floor(Math.random() * 400)
        await sleep(backoff + jitter)
        continue
      }
      return { status: resp.status, ok: resp.ok, body }
    } catch (err) {
      lastErr = err
      const backoff = Math.min(15000, 600 * 2 ** (attempt - 1))
      const jitter = Math.floor(Math.random() * 400)
      await sleep(backoff + jitter)
    }
  }
  throw lastErr
}

async function main() {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  const connRes = await client.query(
    "SELECT connection_id FROM marketplace_connections WHERE channel_id = 'magalu' AND tenant_id = '" +
      tenant +
      "' LIMIT 1"
  )

  if (!connRes.rows.length) {
    console.error('No Magalu connection found')
    process.exit(2)
  }

  const connectionId = connRes.rows[0].connection_id
  const secretRes = await client.query(
    "SELECT encrypted_payload FROM marketplace_connection_secrets WHERE connection_id = '" +
      connectionId +
      "' AND tenant_id = '" +
      tenant +
      "' LIMIT 1"
  )

  if (!secretRes.rows.length) {
    console.error('No Magalu secrets found')
    process.exit(3)
  }

  const secrets = decryptEnvelope(secretRes.rows[0].encrypted_payload)
  const accessToken = secrets.accessToken || ''

  if (!accessToken) {
    console.error('No accessToken in secrets')
    process.exit(4)
  }

  const headers = {
    Authorization: 'Bearer ' + accessToken,
    Accept: 'application/json',
  }

  const baseUrl = 'https://api.magalu.com/seller/v1/portfolios/categories/hierarchy'
  const limit = 50
  const maxLimit = limit
  const allById = new Map()

  const rootUrl = `${baseUrl}?root_only=true&_limit=${limit}`
  const rootRes = await fetchWithRetry(rootUrl, headers, 8)
  if (!rootRes.ok) {
    console.error(JSON.stringify({ url: rootUrl, status: rootRes.status, body: rootRes.body }, null, 2))
    process.exit(5)
  }
  const roots = Array.isArray(rootRes.body?.results) ? rootRes.body.results : []
  for (const root of roots) {
    allById.set(root.id, root)
  }

  for (const root of roots) {
    let offset = 0
    while (true) {
      const url = `${baseUrl}?category_id=${root.id}&_offset=${offset}&_limit=${limit}`
      const res = await fetchWithRetry(url, headers, 8)
      if (!res.ok) {
        console.error(JSON.stringify({ url, status: res.status, body: res.body }, null, 2))
        process.exit(6)
      }
      const body = res.body || {}
      const results = Array.isArray(body.results) ? body.results : []
      const meta = body.meta?.page
      for (const item of results) {
        allById.set(item.id, item)
      }
      const count = meta?.count ?? results.length
      if (!count || results.length === 0) break
      offset += count
      if (results.length < limit) break
    }
  }

  const all = Array.from(allById.values())

  const outDir = path.join(process.cwd(), 'data')
  fs.mkdirSync(outDir, { recursive: true })

  const jsonPath = path.join(outDir, 'magalu-categories-all.json')
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2), 'utf8')

  const csvPath = path.join(outDir, 'magalu-categories-all.csv')
  const header = ['id', 'name', 'parent_id', 'path']
  const lines = [header.join(',')]
  for (const item of all) {
    const row = [
      item.id ?? '',
      (item.name ?? '').toString().replace(/"/g, '""'),
      item.parent_id ?? '',
      (item.path ?? '').toString().replace(/"/g, '""'),
    ]
    lines.push(row.map((v) => `"${v}"`).join(','))
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8')

  console.log(JSON.stringify({ total: all.length, jsonPath, csvPath, maxLimit }, null, 2))
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
