import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const MAGALU_AUTH_URL = 'https://id.magalu.com/login'

function buildRedirectUri(): string {
  if (process.env.MAGALU_REDIRECT_URI) return process.env.MAGALU_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/magalu/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/magalu/callback'
}

export async function GET() {
  const clientId = process.env.MAGALU_CLIENT_ID

  if (!clientId) {
    return Response.json(
      {
        success: false,
        error: 'MAGALU_CLIENT_ID nao configurado no .env.local',
      },
      { status: 500 }
    )
  }

  const redirectUri = buildRedirectUri()
  const state = randomBytes(16).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set('magalu_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: redirectUri.startsWith('https://'),
    path: '/',
    maxAge: 60 * 10,
  })

  const authUrl = new URL(MAGALU_AUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('choose_tenants', 'true')
  authUrl.searchParams.set('state', state)

  const scopes =
    process.env.MAGALU_SCOPES || process.env.MAGALU_SCOPES_DEFAULT || ''
  if (scopes.trim().length > 0) {
    authUrl.searchParams.set('scope', scopes.trim())
  }

  return NextResponse.redirect(authUrl)
}
