import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SQLITE_PATH = path.join(process.cwd(), 'data', 'app.db')
const CSV_PATH = path.join(process.cwd(), 'data', 'magalu-category-map.csv')
const XLSX_PATH = path.join(process.cwd(), 'data', 'magalu-category-map.xlsx')

const PRODUCT_CATEGORIES_KEY = 'mc-product-categories-magalu'

export async function GET(request: NextRequest) {
  const format = (request.nextUrl.searchParams.get('format') || 'csv').toLowerCase()

  if (format !== 'csv' && format !== 'xlsx') {
    return Response.json(
      { success: false, error: 'Formato invalido. Use format=csv ou format=xlsx.' },
      { status: 400 }
    )
  }

  try {
    if (format === 'csv' && fs.existsSync(CSV_PATH)) {
      const buffer = fs.readFileSync(CSV_PATH)
      return fileResponse(buffer, 'text/csv; charset=utf-8', 'magalu-category-map.csv')
    }

    if (format === 'xlsx' && fs.existsSync(XLSX_PATH)) {
      const buffer = fs.readFileSync(XLSX_PATH)
      return fileResponse(
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'magalu-category-map.xlsx'
      )
    }

    // Fallback: regenerate from SQLite store (no Magalu calls)
    const db = new Database(SQLITE_PATH)
    const { products, mapping } = loadMappedProducts(db)

    if (format === 'csv') {
      const csv = buildCsv(products, mapping)
      return fileResponse(Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8', 'magalu-category-map.csv')
    }

    const xlsxBuffer = await buildXlsx(products, mapping)
    return fileResponse(
      xlsxBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'magalu-category-map.xlsx'
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Falha ao exportar' },
      { status: 500 }
    )
  }
}

function fileResponse(buffer: Buffer, contentType: string, filename: string): Response {
  // Response expects Web BodyInit; Buffer is Uint8Array at runtime but TS may not accept it here.
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function loadMappedProducts(db: Database.Database): {
  products: Array<{ id: string; sku: string; name: string }>
  mapping: Record<string, any>
} {
  const productsRow = db.prepare('select value from kv_store where key=?').get('mc-products') as { value?: string } | undefined
  const classificationsRow = db.prepare('select value from kv_store where key=?').get('mc-classifications') as { value?: string } | undefined
  if (!productsRow?.value || !classificationsRow?.value) {
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
    }))

  const mappingRow = db.prepare('select value from kv_store where key=?').get(PRODUCT_CATEGORIES_KEY) as { value?: string } | undefined
  const mappingParsed = mappingRow?.value ? JSON.parse(mappingRow.value) : null
  const mapping = mappingParsed?.state?.categories && typeof mappingParsed.state.categories === 'object'
    ? mappingParsed.state.categories
    : {}

  return { products: targetProducts, mapping }
}

function buildCsv(
  products: Array<{ id: string; sku: string; name: string }>,
  mapping: Record<string, any>
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
  mapping: Record<string, any>
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
