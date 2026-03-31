import { type NextRequest } from 'next/server'
import {
  getConnectionByChannelId,
  getDecryptedConnectionSecrets,
  upsertMarketplaceConnection,
} from '@/lib/marketplace-db'
import { createMarketplaceClient } from '@/lib/marketplace-client-factory'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined

    const connection = await getConnectionByChannelId(channelId, tenantId)

    if (!connection) {
      return Response.json(
        { success: false, error: 'Conexão não encontrada para este canal' },
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

    const client = createMarketplaceClient(channelId, secrets ?? {})
    const result = await client.validateConnection()

    if (!result.ok) {
      await upsertMarketplaceConnection(
        {
          channelId,
          displayName: connection.displayName,
          accountId: connection.accountId,
          authStrategy: connection.authStrategy,
          status: 'attention',
          lastValidatedAt: new Date().toISOString(),
          lastError: result.error ?? 'Falha na validação',
        },
        tenantId
      )
      return Response.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    await upsertMarketplaceConnection(
      {
        channelId,
        displayName: connection.displayName,
        accountId: result.accountId ?? connection.accountId,
        authStrategy: connection.authStrategy,
        status: 'connected',
        lastValidatedAt: new Date().toISOString(),
        lastError: '',
      },
      tenantId
    )

    return Response.json({
      success: true,
      data: { accountId: result.accountId, channelId },
    })
  } catch (error) {
    console.error('Error validating marketplace connection:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao validar conexão',
      },
      { status: 500 }
    )
  }
}
