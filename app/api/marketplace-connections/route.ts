import { type NextRequest } from 'next/server'
import { listMarketplaceConnections, upsertMarketplaceConnection } from '@/lib/marketplace-db'
import type {
  MarketplaceAuthStrategy,
  MarketplaceConnectionStatus,
} from '@/types'

type ConnectionRequestBody = {
  channelId?: string
  displayName?: string
  accountId?: string
  authStrategy?: MarketplaceAuthStrategy
  status?: MarketplaceConnectionStatus
  lastValidatedAt?: string
  lastError?: string
  secrets?: Record<string, unknown>
}

function isAuthStrategy(value: unknown): value is MarketplaceAuthStrategy {
  return (
    value === 'oauth2' ||
    value === 'lwa' ||
    value === 'api_key' ||
    value === 'token' ||
    value === 'seller_portal' ||
    value === 'unknown'
  )
}

function isConnectionStatus(value: unknown): value is MarketplaceConnectionStatus {
  return (
    value === 'disconnected' ||
    value === 'connected' ||
    value === 'attention' ||
    value === 'blocked'
  )
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const connections = await listMarketplaceConnections(tenantId)

    return Response.json(
      {
        success: true,
        data: connections,
        count: connections.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching marketplace connections:', error)
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch marketplace connections',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as ConnectionRequestBody

    if (!body.channelId || !body.displayName || !isAuthStrategy(body.authStrategy)) {
      return Response.json(
        {
          success: false,
          error: 'Payload inválido para conexão do marketplace',
        },
        { status: 400 }
      )
    }

    const status: MarketplaceConnectionStatus =
      body.status && isConnectionStatus(body.status)
        ? body.status
        : body.secrets && Object.keys(body.secrets).length > 0
        ? 'connected'
        : 'attention'

    const connection = await upsertMarketplaceConnection(
      {
        channelId: body.channelId,
        displayName: body.displayName,
        accountId: body.accountId,
        authStrategy: body.authStrategy,
        status,
        lastValidatedAt: body.lastValidatedAt,
        lastError: body.lastError,
        secretPayload:
          body.secrets && typeof body.secrets === 'object' ? body.secrets : undefined,
      },
      tenantId
    )

    return Response.json(
      {
        success: true,
        data: connection,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error saving marketplace connection:', error)
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save marketplace connection',
      },
      { status: 500 }
    )
  }
}
