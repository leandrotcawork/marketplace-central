import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'app.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }
  return db
}

export function kvGet(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM kv_store WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value)
}

export function kvDelete(key: string): void {
  getDb().prepare('DELETE FROM kv_store WHERE key = ?').run(key)
}
