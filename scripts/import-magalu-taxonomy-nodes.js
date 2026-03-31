const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(process.cwd(), 'data', 'app.db')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS marketplace_taxonomy_nodes (
    marketplace_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    path TEXT NOT NULL,
    level INTEGER NOT NULL,
    PRIMARY KEY (marketplace_id, node_id)
  )
`)

function parseCsvLine(line) {
  const out = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out
}

const rootsDir = path.join(process.cwd(), 'data', 'magalu-roots')
const files = [
  path.join(rootsDir, 'magalu-casa-e-jardim.csv'),
  path.join(rootsDir, 'magalu-ferragens.csv'),
  path.join(rootsDir, 'magalu-comercial-e-industrial.csv'),
]

const insert = db.prepare(
  `INSERT INTO marketplace_taxonomy_nodes (
    marketplace_id, node_id, name, parent_id, path, level
  ) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(marketplace_id, node_id) DO UPDATE SET
    name = excluded.name,
    parent_id = excluded.parent_id,
    path = excluded.path,
    level = excluded.level`
)

let total = 0
const insertRows = db.transaction((lines) => {
  for (const line of lines) {
    const [id, name, parent_id, pathValue] = parseCsvLine(line).map((v) =>
      v.replace(/^"|"$/g, '')
    )
    const level = pathValue.split('/').length
    insert.run('magalu', id, name, parent_id || null, pathValue, level)
  }
})

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  lines.shift()
  insertRows(lines)
  total += lines.length
  console.log('Imported', lines.length, 'from', path.basename(file))
}

console.log('Imported', total, 'nodes')
