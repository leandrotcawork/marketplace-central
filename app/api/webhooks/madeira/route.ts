import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/webhooks/madeira
 *
 * Receives Madeira Madeira webhook notifications.
 * Must respond 200 quickly to prevent retry storms.
 *
 * Known supported events (tentative — pending full partner docs):
 *   - order.created: New order placed
 *   - order.status.changed: Order status transition
 *   - product.approved: Product listing approved
 *   - product.rejected: Product listing rejected
 *
 * Status: Stub — webhook support is partial, pending full documentation from partner.
 */

interface MadeiraNotification {
  event: string
  timestamp: string
  data: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    const notification: MadeiraNotification = await request.json()
    const { event, data } = notification

    console.log(
      `[Madeira Webhook] event=${event} data_keys=${Object.keys(data).join(',')}`
    )

    switch (event) {
      case 'order.created':
        console.log(`[Madeira] New order: ${JSON.stringify(data)}`)
        break

      case 'order.status.changed':
        console.log(`[Madeira] Order status changed: ${JSON.stringify(data)}`)
        break

      case 'product.approved':
        console.log(`[Madeira] Product approved: ${JSON.stringify(data)}`)
        break

      case 'product.rejected':
        console.log(`[Madeira] Product rejected: ${JSON.stringify(data)}`)
        break

      default:
        console.log(`[Madeira] Unknown event "${event}": ${JSON.stringify(data)}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Madeira Webhook] Error processing notification:', error)
    return NextResponse.json({ received: true, error: 'parse_error' })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'madeira-webhooks' })
}
