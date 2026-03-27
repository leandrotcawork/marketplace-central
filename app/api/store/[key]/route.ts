import { kvGet, kvSet, kvDelete } from '@/lib/sqlite'

type RouteContext = { params: Promise<{ key: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { key } = await context.params
  const value = kvGet(key)
  if (value === null) {
    return Response.json({ value: null })
  }
  return Response.json({ value })
}

export async function PUT(request: Request, context: RouteContext) {
  const { key } = await context.params
  const body = await request.json()
  kvSet(key, typeof body.value === 'string' ? body.value : JSON.stringify(body.value))
  return Response.json({ success: true })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { key } = await context.params
  kvDelete(key)
  return Response.json({ success: true })
}
