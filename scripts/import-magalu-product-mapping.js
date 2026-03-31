const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(process.cwd(), 'data', 'app.db')
const db = new Database(dbPath)
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS marketplace_product_taxonomy (
    marketplace_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    node_id TEXT NOT NULL,
    path TEXT NOT NULL,
    level1 TEXT,
    level2 TEXT,
    level3 TEXT,
    level4 TEXT,
    level5 TEXT,
    level6 TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (marketplace_id, sku)
  )
`)

const mappingPath = path.join(
  process.cwd(),
  '.brain',
  'working-memory',
  'magalu-product-mapping-2026-03-31.md'
)
const text = fs.readFileSync(mappingPath, 'utf8')
const lines = text.split(/\r?\n/)

const rows = []
for (const line of lines) {
  if (!line.startsWith('|') || line.includes('---') || line.includes('produto |'))
    continue
  const parts = line.split('|').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 7) continue
  const [produto, sku, grupo, pathValue, nodeId] = parts
  rows.push({ sku, pathValue, nodeId })
}

const insert = db.prepare(
  `INSERT INTO marketplace_product_taxonomy (
    marketplace_id, sku, node_id, path, level1, level2, level3, level4, level5, level6, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(marketplace_id, sku) DO UPDATE SET
    node_id = excluded.node_id,
    path = excluded.path,
    level1 = excluded.level1,
    level2 = excluded.level2,
    level3 = excluded.level3,
    level4 = excluded.level4,
    level5 = excluded.level5,
    level6 = excluded.level6,
    updated_at = excluded.updated_at`
)

const insertRows = db.transaction((batch) => {
  for (const row of batch) {
    const levels = row.pathValue.split('/').map((p) => p.trim()).filter(Boolean)
    const padded = [...levels, null, null, null, null, null, null].slice(0, 6)
    insert.run(
      'magalu',
      row.sku,
      row.nodeId,
      row.pathValue,
      padded[0],
      padded[1],
      padded[2],
      padded[3],
      padded[4],
      padded[5]
    )
  }
})

insertRows(rows)

console.log('Imported', rows.length, 'sku mappings')
