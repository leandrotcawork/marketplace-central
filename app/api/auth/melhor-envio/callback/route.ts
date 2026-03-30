import { type NextRequest, NextResponse } from 'next/server'
import { upsertLogisticsProvider } from '@/lib/logistics-db'

const ME_TOKEN_URL = 'https://melhorenvio.com.br/oauth/token'

function buildRedirectUri(): string {
  if (process.env.ME_REDIRECT_URI) return process.env.ME_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/melhor-envio/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/melhor-envio/callback'
}

/**
 * GET /api/auth/melhor-envio/callback?code=xxx
 *
 * Melhor Envios redireciona aqui após o usuário autorizar o app.
 * Troca o code por access_token + refresh_token e armazena criptografado.
 * Redireciona para /configuracoes?me_connected=1 em caso de sucesso.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined

  if (!code) {
    return new Response(page('Erro', 'Parâmetro "code" não encontrado na URL.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const clientId = process.env.ME_CLIENT_ID
  const clientSecret = process.env.ME_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response(
      page(
        'Configuração faltando',
        `Adicione no <code>.env.local</code>:<br><br>
        <code>ME_CLIENT_ID=seu_client_id</code><br>
        <code>ME_CLIENT_SECRET=seu_client_secret</code><br><br>
        O code recebido foi: <code>${esc(code)}</code><br>
        Guarde-o — ele expira em ~10 minutos.`
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const redirectUri = buildRedirectUri()

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenResponse = await fetch(ME_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    const data = await tokenResponse.json() as Record<string, unknown>

    if (!tokenResponse.ok || !data.access_token) {
      return new Response(
        page(
          'Erro ao trocar code por token',
          `Melhor Envios respondeu com status ${tokenResponse.status}:<br><br>
          <pre>${esc(JSON.stringify(data, null, 2))}</pre>
          <br>Possíveis causas:<br>
          - Code já foi usado (só funciona uma vez)<br>
          - Client ID/Secret incorretos<br>
          - Redirect URI diferente da cadastrada no ME`
        ),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    // Armazena tokens criptografados via marketplace_connections
    await upsertLogisticsProvider(
      {
        providerId: 'melhor-envio',
        displayName: 'Melhor Envios',
        providerType: 'shipping',
        authStrategy: 'oauth2',
        status: 'connected',
        lastValidatedAt: new Date().toISOString(),
        secretPayload: {
          access_token: String(data.access_token),
          refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
          expires_in: String(data.expires_in ?? 2592000),
          token_type: String(data.token_type ?? 'Bearer'),
        },
      },
      tenantId
    )

    // Redireciona de volta para a tela de configurações
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:3000'
    return NextResponse.redirect(`${appUrl}/configuracoes?me_connected=1`)
  } catch (error) {
    return new Response(
      page(
        'Erro de rede',
        `Não foi possível conectar ao Melhor Envios:<br><br>
        <pre>${esc(error instanceof Error ? error.message : String(error))}</pre>`
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}

function esc(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '')
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Melhor Envios OAuth — ${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 40px; }
    .card { max-width: 720px; margin: 0 auto; background: #1a2332; border: 1px solid #334155; border-radius: 12px; padding: 32px; }
    h1 { margin: 0 0 16px; font-size: 22px; }
    code { background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #0f172a; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`
}
