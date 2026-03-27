import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/webhooks/mercado-livre
 *
 * Receives MeLi notification callbacks.
 * Must respond 200 within 20s or MeLi retries (up to 5 times).
 *
 * Payload example:
 * {
 *   "resource": "/orders/12345",
 *   "user_id": 123456789,
 *   "topic": "orders_v2",
 *   "application_id": 9876,
 *   "attempts": 1,
 *   "sent": "2026-03-27T12:00:00.000Z",
 *   "received": "2026-03-27T12:00:00.000Z"
 * }
 *
 * Topics: items, orders_v2, questions, messages, payments, shipments
 */

interface MeliNotification {
  resource: string
  user_id: number
  topic: string
  application_id: number
  attempts: number
  sent: string
  received: string
}

export async function POST(request: NextRequest) {
  try {
    const notification: MeliNotification = await request.json()

    const { topic, resource, user_id, attempts } = notification

    // Log for now — later we process each topic
    console.log(
      `[MeLi Webhook] topic=${topic} resource=${resource} user=${user_id} attempt=${attempts}`
    )

    switch (topic) {
      case 'orders_v2':
        // TODO: fetch order details from MeLi API and store
        console.log(`[MeLi] New/updated order: ${resource}`)
        break

      case 'questions':
        // TODO: fetch question and notify
        console.log(`[MeLi] New question: ${resource}`)
        break

      case 'messages':
        console.log(`[MeLi] New message: ${resource}`)
        break

      case 'items':
        // TODO: sync item status changes
        console.log(`[MeLi] Item updated: ${resource}`)
        break

      case 'payments':
        console.log(`[MeLi] Payment update: ${resource}`)
        break

      case 'shipments':
        console.log(`[MeLi] Shipment update: ${resource}`)
        break

      default:
        console.log(`[MeLi] Unknown topic "${topic}": ${resource}`)
    }

    // MeLi requires 200 OK — anything else triggers retry
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[MeLi Webhook] Error processing notification:', error)
    // Still return 200 to prevent infinite retries
    return NextResponse.json({ received: true, error: 'parse_error' })
  }
}

// MeLi may send a GET to verify the URL is reachable
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'mercado-livre-webhooks' })
}
