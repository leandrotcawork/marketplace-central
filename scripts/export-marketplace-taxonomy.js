const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(process.cwd(), 'data', 'app.db')
const db = new Database(dbPath, { readonly: true })

const rows = db
  .prepare(
    `SELECT marketplace_id, sku, node_id, path, level1, level2, level3, level4, level5, level6
     FROM marketplace_product_taxonomy
     WHERE marketplace_id = ?`
  )
  .all('magalu')

const header = [
  'marketplace_id',
  'sku',
  'node_id',
  'path',
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
]
const lines = [header.join(',')]
for (const r of rows) {
  const row = header.map((h) => String(r[h] ?? '').replace(/"/g, '""'))
  lines.push(row.map((v) => `"${v}"`).join(','))
}

const outPath = path.join(process.cwd(), 'data', 'magalu-sku-taxonomy.csv')
fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
console.log('Exported', rows.length, 'rows to', outPath)
