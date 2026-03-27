import { type NextRequest } from 'next/server'
import { getConnectionByChannelId, getDecryptedConnectionSecrets } from '@/lib/marketplace-db'
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
      return Response.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

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
