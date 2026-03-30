import { type NextRequest } from 'next/server'
import { MelhorEnvioClient, type MelhorEnvioFreightInput } from '@/lib/clients/melhor-envio'
import { getLogisticsProviderByProviderId, getDecryptedLogisticsSecrets } from '@/lib/logistics-db'

const PROVIDER_ID = 'melhor-envio'

/**
 * POST /api/melhor-envio/quote
 *
 * Proxy para o endpoint de cotação do Melhor Envios.
 * Usa o token OAuth2 armazenado para a conexão 'melhor-envio'.
 *
 * Body: MelhorEnvioFreightInput
 * Response: MelhorEnvioFreightOption[]
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as MelhorEnvioFreightInput

    if (!body.fromPostalCode || !body.toPostalCode) {
      return Response.json(
        { success: false, error: 'fromPostalCode e toPostalCode são obrigatórios' },
        { status: 400 }
      )
    }

    if (!body.products || body.products.length === 0) {
      return Response.json(
        { success: false, error: 'Pelo menos um produto é obrigatório para cotação' },
        { status: 400 }
      )
    }

    const connection = await getLogisticsProviderByProviderId(PROVIDER_ID, tenantId)

    if (!connection?.hasStoredSecret) {
      return Response.json(
        {
          success: false,
          error: 'Melhor Envios não está conectado. Configure a integração em Configurações.',
        },
        { status: 401 }
      )
    }

    const secrets = await getDecryptedLogisticsSecrets(connection.providerId, tenantId)

    if (!secrets?.access_token) {
      return Response.json(
        { success: false, error: 'Token do Melhor Envios não encontrado ou expirado' },
        { status: 401 }
      )
    }

    const client = new MelhorEnvioClient(secrets as Record<string, string>)
    const options = await client.calculateFreight(body)

    return Response.json({ success: true, data: options })
  } catch (error) {
    console.error('Error fetching Melhor Envios quote:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao calcular frete',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/melhor-envio/quote/validate
 * Valida a conexão com o Melhor Envios sem fazer cotação.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const connection = await getLogisticsProviderByProviderId(PROVIDER_ID, tenantId)

    if (!connection?.hasStoredSecret) {
      return Response.json({ success: false, connected: false, error: 'Não conectado' })
    }

    const secrets = await getDecryptedLogisticsSecrets(connection.providerId, tenantId)

    if (!secrets?.access_token) {
      return Response.json({ success: false, connected: false, error: 'Token não encontrado' })
    }

    const client = new MelhorEnvioClient(secrets as Record<string, string>)
    const result = await client.validateConnection()

    return Response.json({
      success: result.valid,
      connected: result.valid,
      email: result.email,
      name: result.name,
      error: result.error,
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : 'Falha ao validar conexão',
      },
      { status: 500 }
    )
  }
}
