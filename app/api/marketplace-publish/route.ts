import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import {
  createMarketplaceSyncJob,
  getDecryptedConnectionSecrets,
  listMarketplaceConnections,
  upsertMarketplaceRemoteListing,
} from '@/lib/marketplace-db'
import { createMarketplaceClient, type ProductPublishInput as ClientPublishInput } from '@/lib/marketplace-client-factory'
import type {
  MarketplaceCapabilityStatus,
  MarketplaceExecutionMode,
  MarketplaceRuleSourceType,
  MarketplaceReviewStatus,
  MarketplaceRuleType,
  MarketplaceSyncStatus,
} from '@/types'

type PublishItem = {
  publicationId: string
  productId: string
  productName: string
  sku: string
  stock: number
  channelId: string
  price: number
  productGroupId?: string
  commissionPercent: number
  fixedFeeAmount: number
  freightFixedAmount: number
  ruleType: MarketplaceRuleType
  reviewStatus: MarketplaceReviewStatus
  sourceType: MarketplaceRuleSourceType
  executionMode: MarketplaceExecutionMode
  publishCapability: MarketplaceCapabilityStatus
}

type PublishRequestBody = {
  items?: PublishItem[]
}

function derivePublishStatus(
  item: Pick<PublishItem, 'channelId' | 'executionMode' | 'publishCapability'>,
  hasConnectedAccount: boolean
): {
  status: MarketplaceSyncStatus
  errorMessage?: string
} {
  if (item.executionMode === 'blocked') {
    return {
      status: 'failed',
      errorMessage: 'Canal bloqueado até validação de documentação e regras.',
    }
  }

  if (item.executionMode === 'planned') {
    return {
      status: 'queued',
      errorMessage: 'Canal previsto para segunda onda; job criado para acompanhamento.',
    }
  }

  if (!hasConnectedAccount) {
    return {
      status: 'failed',
      errorMessage: 'Canal sem conexão ativa no servidor.',
    }
  }

  if (item.publishCapability === 'blocked') {
    return {
      status: 'failed',
      errorMessage: 'Canal conectado, mas sem capability de publicação liberada.',
    }
  }

  if (item.publishCapability === 'partial') {
    return {
      status: 'partial',
      errorMessage: 'Canal publicou parcialmente; revisar o job e a listagem remota.',
    }
  }

  return { status: 'published' }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined
    const body = (await request.json()) as PublishRequestBody
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'Nenhuma publicação enviada para processamento',
        },
        { status: 400 }
      )
    }

    const connections = await listMarketplaceConnections(tenantId)
    const connectionByChannel = new Map(connections.map((connection) => [connection.channelId, connection]))

    const results = []

    for (const item of items) {
      const startedAt = new Date().toISOString()
      const connection = connectionByChannel.get(item.channelId)
      const lifecycle = derivePublishStatus(item, connection?.status === 'connected')

      // For live channels with an active connection, call the real marketplace API
      let externalListingId: string | undefined
      let apiError: string | undefined

      if (
        lifecycle.status === 'published' &&
        connection?.connectionId
      ) {
        try {
          const secrets = await getDecryptedConnectionSecrets(connection.connectionId, tenantId)

          if (secrets) {
            const client = createMarketplaceClient(item.channelId, secrets)
            const publishInput: ClientPublishInput = {
              sku: item.sku,
              name: item.productName,
              price: item.price,
              stock: item.stock,
            }
            const apiResult = await client.publishProduct(publishInput)

            if (apiResult.ok) {
              externalListingId = apiResult.externalId
            } else {
              apiError = apiResult.error
              lifecycle.status = 'failed'
              lifecycle.errorMessage = apiResult.error
            }
          }
        } catch (apiCallError) {
          apiError = apiCallError instanceof Error ? apiCallError.message : 'API call failed'
          lifecycle.status = 'failed'
          lifecycle.errorMessage = apiError
        }
      }

      // Fallback external ID for non-live or simulated channels
      if (!externalListingId && (lifecycle.status === 'published' || lifecycle.status === 'partial')) {
        externalListingId = `${item.channelId.toUpperCase()}-${item.sku}`
      }

      const syncJob = await createMarketplaceSyncJob(
        {
          channelId: item.channelId,
          connectionId: connection?.connectionId,
          productId: item.productId,
          publicationId: item.publicationId,
          jobType: 'publish',
          status: lifecycle.status,
          requestPayload: {
            productName: item.productName,
            sku: item.sku,
            stock: item.stock,
            price: item.price,
            productGroupId: item.productGroupId,
            commissionPercent: item.commissionPercent,
            fixedFeeAmount: item.fixedFeeAmount,
            freightFixedAmount: item.freightFixedAmount,
            ruleType: item.ruleType,
            reviewStatus: item.reviewStatus,
            sourceType: item.sourceType,
          },
          resultPayload:
            lifecycle.status === 'published' || lifecycle.status === 'partial'
              ? {
                  externalListingId,
                  simulated: !externalListingId || externalListingId.includes('-') && !externalListingId.startsWith(item.channelId.toUpperCase() + '-' + item.sku.slice(0, 3)),
                }
              : undefined,
          errorMessage: lifecycle.errorMessage,
          startedAt,
          finishedAt:
            lifecycle.status === 'queued' ? undefined : new Date().toISOString(),
        },
        tenantId
      )

      const remoteListing =
        lifecycle.status === 'published' || lifecycle.status === 'partial'
          ? await upsertMarketplaceRemoteListing(
              {
                channelId: item.channelId,
                connectionId: connection?.connectionId,
                productId: item.productId,
                externalListingId: externalListingId ?? `${item.channelId.toUpperCase()}-${randomUUID().slice(0, 8)}`,
                externalSku: item.sku,
                status: lifecycle.status,
                lastPrice: item.price,
                lastStock: item.stock,
                lastSyncedAt: new Date().toISOString(),
                rawPayload: {
                  productName: item.productName,
                  sourceType: item.sourceType,
                  ruleType: item.ruleType,
                },
              },
              tenantId
            )
          : null

      results.push({
        publicationId: item.publicationId,
        channelId: item.channelId,
        status: lifecycle.status,
        errorMessage: lifecycle.errorMessage,
        syncJobId: syncJob.id,
        connectionId: connection?.connectionId,
        remoteListingId: remoteListing?.id,
        externalListingId,
        syncedAt:
          lifecycle.status === 'published' || lifecycle.status === 'partial'
            ? new Date().toISOString()
            : undefined,
        publishedAt:
          lifecycle.status === 'published' || lifecycle.status === 'partial'
            ? new Date().toISOString()
            : undefined,
      })
    }

    return Response.json(
      {
        success: true,
        data: results,
        count: results.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error creating marketplace publish jobs:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create publish jobs',
      },
      { status: 500 }
    )
  }
}
