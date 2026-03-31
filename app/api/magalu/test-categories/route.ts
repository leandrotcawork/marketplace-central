import { type NextRequest } from 'next/server'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'

const DEFAULT_BASES =
  process.env.MAGALU_USE_SANDBOX === 'true'
    ? ['https://api-sandbox.magalu.com']
    : ['https://api.magalu.com', 'https://services.magalu.com']

const MAGALU_BASE_URLS = (process.env.MAGALU_API_BASES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const BASE_URLS = MAGALU_BASE_URLS.length > 0 ? MAGALU_BASE_URLS : DEFAULT_BASES

function decodeJwt(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const json = JSON.parse(payload)
    return json && typeof json === 'object' ? json : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const connection = await getConnectionByChannelId('magalu', tenantId)

    if (!connection) {
      return Response.json(
        { success: false, error: 'Conexao do Magalu nao encontrada' },
        { status: 404 }
      )
    }

    const secrets =
      connection.hasStoredSecret
        ? await getDecryptedConnectionSecrets(connection.connectionId, tenantId)
        : {}

    if (connection.hasStoredSecret && !secrets) {
      return Response.json(
        { success: false, error: 'Falha ao descriptografar credenciais' },
        { status: 500 }
      )
    }

    const accessToken =
      typeof secrets?.accessToken === 'string' ? secrets.accessToken : ''

    if (!accessToken) {
      return Response.json(
        { success: false, error: 'Access token do Magalu nao encontrado' },
        { status: 400 }
      )
    }

    const tokenClaims = decodeJwt(accessToken)

    const endpoints = BASE_URLS.flatMap((base) => [
      {
        name: `hierarchy_root@${base}`,
        url: `${base}/seller/v1/portfolios/categories/hierarchy?root_only=true&_limit=50`,
      },
      {
        name: `category_search_name@${base}`,
        url: `${base}/seller/v1/portfolios/categories?name=Kit`,
      },
    ])

    const tests = await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const response = await fetch(endpoint.url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const text = await response.text()
          let body: unknown = null
          try {
            body = JSON.parse(text)
          } catch {
            body = text
          }
          return {
            name: endpoint.name,
            url: endpoint.url,
            status: response.status,
            ok: response.ok,
            body,
          }
        } catch (error) {
          return {
            name: endpoint.name,
            url: endpoint.url,
            status: 0,
            ok: false,
            body: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )

    const primary = tests.find((test) => test.ok)
    if (!primary) {
      return Response.json(
        {
          success: false,
          error: 'Magalu endpoints nao responderam como esperado',
          data: tests,
          tokenClaims,
        },
        { status: 400 }
      )
    }

    const payload = primary.body
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any)?.results)
      ? (payload as any).results
      : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : []

    const sample = list.slice(0, 3).map((item: any) => ({
      id: item.id ?? item.category_id ?? item.uuid ?? null,
      name: item.name ?? item.category_name ?? item.title ?? null,
    }))

    return Response.json({
      success: true,
      status: primary.status,
      count: list.length,
      sample,
      tests,
      tokenClaims,
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao testar Magalu',
      },
      { status: 500 }
    )
  }
}
