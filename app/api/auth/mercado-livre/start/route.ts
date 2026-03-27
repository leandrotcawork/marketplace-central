import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const MELI_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function buildRedirectUri(): string {
  if (process.env.MELI_REDIRECT_URI) return process.env.MELI_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/mercado-livre/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/mercado-livre/callback'
}

export async function GET() {
  const clientId = process.env.MELI_CLIENT_ID

  if (!clientId) {
    return Response.json(
      {
        success: false,
        error: 'MELI_CLIENT_ID não configurado no .env.local',
      },
      { status: 500 }
    )
  }

  const redirectUri = buildRedirectUri()
  const codeVerifier = toBase64Url(randomBytes(32))
  const codeChallenge = toBase64Url(
    createHash('sha256').update(codeVerifier).digest()
  )

  const cookieStore = await cookies()
  cookieStore.set('meli_code_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: redirectUri.startsWith('https://'),
    path: '/',
    maxAge: 60 * 10,
  })

  const authUrl = new URL(MELI_AUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(authUrl)
}
