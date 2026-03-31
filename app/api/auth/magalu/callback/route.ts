import { cookies } from 'next/headers'
import { type NextRequest } from 'next/server'

const MAGALU_TOKEN_URL = 'https://id.magalu.com/oauth/token'

function buildRedirectUri(): string {
  if (process.env.MAGALU_REDIRECT_URI) return process.env.MAGALU_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/magalu/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/magalu/callback'
}

/**
 * GET /api/auth/magalu/callback?code=xxx
 *
 * Magalu ID redireciona aqui apos o usuario autorizar o app.
 * Troca o code por access_token + refresh_token.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const errorDescription = request.nextUrl.searchParams.get('error_description')
  const state = request.nextUrl.searchParams.get('state')
  const redirectUri = buildRedirectUri()

  const cookieStore = await cookies()
  const storedState = cookieStore.get('magalu_oauth_state')?.value
  cookieStore.delete('magalu_oauth_state')

  if (error) {
    return new Response(
      page(
        'Autorizacao negada',
        `Magalu retornou erro: <code>${esc(error)}</code><br>
        ${errorDescription ? `<small>${esc(errorDescription)}</small>` : ''}`
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  if (!code) {
    return new Response(page('Erro', 'Parametro "code" nao encontrado na URL.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (storedState && state && storedState !== state) {
    return new Response(
      page(
        'State invalido',
        'O parametro state nao confere com o cookie salvo. Refaça a autorizacao.'
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const clientId = process.env.MAGALU_CLIENT_ID
  const clientSecret = process.env.MAGALU_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response(
      page(
        'Configuracao faltando',
        `Adicione no <code>.env.local</code>:<br><br>
        <code>MAGALU_CLIENT_ID=seu_client_id</code><br>
        <code>MAGALU_CLIENT_SECRET=seu_client_secret</code><br><br>
        O code recebido foi: <code>${esc(code)}</code><br>
        Guarde-o — ele expira em ~10 minutos.`
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  try {
    const tokenResponse = await fetch(MAGALU_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    })

    const data = (await tokenResponse.json()) as Record<string, unknown>

    if (!tokenResponse.ok || !data.access_token) {
      return new Response(
        page(
          'Erro ao trocar code por token',
          `Magalu respondeu com status ${tokenResponse.status}:<br><br>
          <pre>${esc(JSON.stringify(data, null, 2))}</pre>
          <br>Possiveis causas:<br>
          - Code ja foi usado (so funciona uma vez)<br>
          - Client ID/Secret incorretos<br>
          - Redirect URI diferente da cadastrada no Magalu`
        ),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    return new Response(
      page(
        'Autorizacao concluida!',
        `<p style="color:#10b981;font-weight:bold;font-size:18px">Tokens obtidos com sucesso</p>

        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8;width:160px">access_token</td>
            <td style="padding:8px;border:1px solid #333;font-family:monospace;font-size:12px;word-break:break-all">${esc(data.access_token)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">refresh_token</td>
            <td style="padding:8px;border:1px solid #333;font-family:monospace;font-size:12px;word-break:break-all;color:#fbbf24">${esc(String(data.refresh_token ?? ''))}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">expires_in</td>
            <td style="padding:8px;border:1px solid #333">${esc(String(data.expires_in ?? ''))}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">token_type</td>
            <td style="padding:8px;border:1px solid #333">${esc(String(data.token_type ?? 'Bearer'))}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">scope</td>
            <td style="padding:8px;border:1px solid #333">${esc(String(data.scope ?? 'N/A'))}</td>
          </tr>
        </table>

        <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#94a3b8;margin:0 0 8px">Proximo passo — cole na tela <strong>Marketplaces → Magalu → Conexao</strong>:</p>
          <ul style="margin:0;padding-left:20px;color:#e2e8f0">
            <li><strong>Access Token:</strong> ${esc(String(data.access_token))}</li>
            <li><strong>Refresh Token:</strong> <code style="color:#fbbf24">${esc(String(data.refresh_token ?? ''))}</code></li>
          </ul>
        </div>

        <details style="margin-top:16px">
          <summary style="color:#64748b;cursor:pointer;font-size:13px">Debug: raw Magalu response</summary>
          <pre style="margin-top:8px;font-size:11px">${esc(JSON.stringify(data, null, 2))}</pre>
        </details>`
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  } catch (error) {
    return new Response(
      page(
        'Erro de rede',
        `Nao foi possivel conectar ao Magalu:<br><br><pre>${esc(error instanceof Error ? error.message : String(error))}</pre>`
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
  <title>Magalu OAuth — ${title}</title>
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
