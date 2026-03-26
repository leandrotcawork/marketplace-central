import * as XLSX from 'xlsx'
import type { Product } from '@/types'
import { generateId } from './formatters'

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '')
}

function findValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  const normalizedRow: Record<string, unknown> = {}
  for (const k of Object.keys(row)) {
    normalizedRow[normalizeKey(k)] = row[k]
  }
  for (const key of keys) {
    const normalized = normalizeKey(key)
    if (normalized in normalizedRow) {
      return normalizedRow[normalized]
    }
  }
  return undefined
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d.,\-]/g, '').trim()
    if (!cleaned) return 0

    // Handle pt-BR formats like "1.234,56" and plain "1234.56".
    const normalized = cleaned.includes(',') && cleaned.includes('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.includes(',')
      ? cleaned.replace(',', '.')
      : cleaned

    const n = parseFloat(normalized)
    return isNaN(n) ? 0 : n
  }
  return 0
}

function toString(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

export function parseXLSX(buffer: ArrayBuffer): Product[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })

  const products: Product[] = []

  for (const row of rows) {
    const sku = toString(findValue(row, 'SKU', 'sku'))
    const name = toString(findValue(row, 'Nome', 'nome', 'name'))
    const category = toString(findValue(row, 'Categoria', 'categoria', 'category'))
    const cost = toNumber(findValue(row, 'Custo', 'custo', 'cost'))
    const basePrice = toNumber(
      findValue(row, 'Preco Base', 'Preço Base', 'precobase', 'preco_base', 'basePrice')
    )
    const stock = toNumber(findValue(row, 'Estoque', 'estoque', 'stock'))
    const unit = toString(findValue(row, 'Unidade', 'unidade', 'unit'))
    const referencia = toString(findValue(row, 'Referencia', 'Referência', 'referencia', 'referência', 'reference', 'ref')) || undefined
    const ean = toString(findValue(row, 'EAN', 'ean', 'Código EAN', 'codigo ean', 'codigoean', 'gtin')) || undefined

    // Validate required fields
    if (cost <= 0 || basePrice <= 0) continue
    if (!sku && !name) continue

    products.push({
      id: generateId(),
      sku: sku || generateId().slice(0, 8).toUpperCase(),
      referencia,
      ean,
      name: name || 'Produto sem nome',
      category: category || 'Sem categoria',
      primaryTaxonomyGroupName: category || undefined,
      cost,
      basePrice,
      stock: stock || 0,
      unit: unit || 'un',
    })
  }

  return products
}
