import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/webhooks/leroy
 *
 * Receives Mirakl notification callbacks for Leroy Merlin.
 * Must respond 200 quickly to prevent retry storms.
 *
 * Planned webhook events (pending homologation):
 *   - ORDER_CREATED: New order placed by buyer
 *   - ORDER_LINE_UPDATED: Order line state change
 *   - OFFER_UPDATED: Offer status change (approved, rejected)
 *   - MESSAGE_RECEIVED: New message in a thread
 *
 * Status: Stub — webhooks blocked until Leroy Merlin completes homologation.
 */

interface MiraklNotification {
  event_type: string
  event_date: string
  payload: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    const notification: MiraklNotification = await request.json()
    const { event_type, payload } = notification

    console.log(
      `[Leroy Webhook] event=${event_type} payload_keys=${Object.keys(payload).join(',')}`
    )

    switch (event_type) {
      case 'ORDER_CREATED':
        console.log(`[Leroy] New order: ${JSON.stringify(payload)}`)
        break

      case 'ORDER_LINE_UPDATED':
        console.log(`[Leroy] Order line updated: ${JSON.stringify(payload)}`)
        break

      case 'OFFER_UPDATED':
        console.log(`[Leroy] Offer updated: ${JSON.stringify(payload)}`)
        break

      case 'MESSAGE_RECEIVED':
        console.log(`[Leroy] Message received: ${JSON.stringify(payload)}`)
        break

      default:
        console.log(`[Leroy] Unknown event "${event_type}": ${JSON.stringify(payload)}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Leroy Webhook] Error processing notification:', error)
    return NextResponse.json({ received: true, error: 'parse_error' })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'leroy-webhooks' })
}
