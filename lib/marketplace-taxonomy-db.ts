import { getDb } from '@/lib/sqlite'

type TaxonomyNode = {
  marketplaceId: string
  nodeId: string
  name: string
  parentId: string | null
  path: string
  level: number
}

type ProductTaxonomy = {
  marketplaceId: string
  sku: string
  nodeId: string
  path: string
  levels: string[]
}

let schemaReady = false

function ensureSchema() {
  if (schemaReady) return
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_taxonomy_nodes (
      marketplace_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT,
      path TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (marketplace_id, node_id)
    );
    CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_parent
      ON marketplace_taxonomy_nodes (marketplace_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_path
      ON marketplace_taxonomy_nodes (marketplace_id, path);

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
    );
    CREATE INDEX IF NOT EXISTS idx_product_taxonomy_node
      ON marketplace_product_taxonomy (marketplace_id, node_id);
    CREATE INDEX IF NOT EXISTS idx_product_taxonomy_level1
      ON marketplace_product_taxonomy (marketplace_id, level1);
  `)
  schemaReady = true
}

function normalizeLevels(path: string): string[] {
  return path.split('/').map((p) => p.trim()).filter(Boolean)
}

export async function upsertTaxonomyNode(node: TaxonomyNode): Promise<void> {
  ensureSchema()
  const db = getDb()
  db.prepare(
    `INSERT INTO marketplace_taxonomy_nodes (
      marketplace_id, node_id, name, parent_id, path, level
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(marketplace_id, node_id) DO UPDATE SET
      name = excluded.name,
      parent_id = excluded.parent_id,
      path = excluded.path,
      level = excluded.level`
  ).run(
    node.marketplaceId,
    node.nodeId,
    node.name,
    node.parentId,
    node.path,
    node.level
  )
}

export async function upsertProductTaxonomy(input: ProductTaxonomy): Promise<void> {
  ensureSchema()
  const db = getDb()
  const levels = input.levels.length ? input.levels : normalizeLevels(input.path)
  const padded = [...levels, '', '', '', '', '', ''].slice(0, 6)

  db.prepare(
    `INSERT INTO marketplace_product_taxonomy (
      marketplace_id, sku, node_id, path,
      level1, level2, level3, level4, level5, level6, updated_at
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
  ).run(
    input.marketplaceId,
    input.sku,
    input.nodeId,
    input.path,
    padded[0],
    padded[1],
    padded[2],
    padded[3],
    padded[4],
    padded[5]
  )
}

export async function getProductTaxonomy(marketplaceId: string, sku: string) {
  ensureSchema()
  const db = getDb()
  return db
    .prepare(
      `SELECT * FROM marketplace_product_taxonomy
       WHERE marketplace_id = ? AND sku = ?`
    )
    .get(marketplaceId, sku)
}
