import { type NextRequest, NextResponse } from 'next/server'
import { MagaluClient } from '@/lib/clients/magalu'

/**
 * POST /api/webhooks/magalu
 *
 * Receives Magalu v1 webhook notifications.
 * Must respond 200 quickly to prevent retry storms.
 *
 * Payload format:
 * {
 *   "data": {
 *     "status": "CREATION" | "UPDATE" | "DELETION",
 *     "params": { "id": "resource-id" },
 *     "resource": "/seller/v0/orders/{id}"
 *   },
 *   "tenant_id": "client-identifier",
 *   "topic": "orders" | "skus" | "sac_ticket"
 * }
 *
 * Security (v1):
 *   - X-Signature-256: HMAC-SHA256 signature
 *   - X-Timestamp: Unix timestamp (seconds)
 *   - Signed over: "{timestamp}.{rawBody}"
 *   - Secret format: whsec_*
 */

interface MagaluNotification {
  data: {
    status: 'CREATION' | 'UPDATE' | 'DELETION'
    params: { id: string }
    resource: string
  }
  tenant_id: string
  topic: string
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const webhookSecret = process.env.MAGALU_WEBHOOK_SECRET

  // Signature verification (if secret is configured)
  if (webhookSecret) {
    const signature = request.headers.get('x-signature-256') ?? ''
    const timestamp = request.headers.get('x-timestamp') ?? ''

    if (!signature || !timestamp) {
      return NextResponse.json(
        { error: 'Missing signature headers' },
        { status: 401 }
      )
    }

    if (!MagaluClient.verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }
  } else {
    console.warn('[Magalu Webhook] MAGALU_WEBHOOK_SECRET not set — skipping signature verification')
  }

  try {
    const notification: MagaluNotification = JSON.parse(rawBody)
    const { topic, data, tenant_id } = notification
    const { status, resource, params } = data

    console.log(
      `[Magalu Webhook] topic=${topic} status=${status} resource=${resource} id=${params.id} tenant=${tenant_id}`
    )

    switch (topic) {
      case 'orders':
        console.log(`[Magalu] Order ${status.toLowerCase()}: ${resource} (${params.id})`)
        break

      case 'skus':
        console.log(`[Magalu] SKU ${status.toLowerCase()}: ${resource} (${params.id})`)
        break

      case 'sac_ticket':
        console.log(`[Magalu] SAC ticket ${status.toLowerCase()}: ${resource} (${params.id})`)
        break

      default:
        console.log(`[Magalu] Unknown topic "${topic}": ${resource}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Magalu Webhook] Error processing notification:', error)
    // Return 200 to prevent infinite retries
    return NextResponse.json({ received: true, error: 'parse_error' })
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'magalu-webhooks' })
}
