import { NextResponse } from 'next/server'

const ME_AUTH_URL = 'https://melhorenvio.com.br/oauth/authorize'

function buildRedirectUri(): string {
  if (process.env.ME_REDIRECT_URI) return process.env.ME_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/melhor-envio/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/melhor-envio/callback'
}

/**
 * GET /api/auth/melhor-envio/start
 *
 * Redireciona para o fluxo OAuth2 do Melhor Envios.
 * Requer ME_CLIENT_ID no .env.local
 */
export async function GET() {
  const clientId = process.env.ME_CLIENT_ID

  if (!clientId) {
    return Response.json(
      { success: false, error: 'ME_CLIENT_ID não configurado no .env.local' },
      { status: 500 }
    )
  }

  const redirectUri = buildRedirectUri()
  const authUrl = new URL(ME_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'shipping-calculate')

  return NextResponse.redirect(authUrl)
}
