import { cookies } from 'next/headers'
import { type NextRequest } from 'next/server'

const MELI_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
function buildRedirectUri(): string {
  if (process.env.MELI_REDIRECT_URI) return process.env.MELI_REDIRECT_URI
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/auth/mercado-livre/callback`
  }
  return 'http://127.0.0.1:3000/api/auth/mercado-livre/callback'
}

/**
 * GET /api/auth/mercado-livre/callback?code=TG-xxx
 *
 * MeLi redirects here after user authorizes the app.
 * Exchanges the authorization code for access_token + refresh_token.
 *
 * Requires MELI_CLIENT_ID and MELI_CLIENT_SECRET in .env.local
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const redirectUri = buildRedirectUri()

  if (!code) {
    return new Response(page('Erro', 'Parâmetro "code" não encontrado na URL.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const clientId = process.env.MELI_CLIENT_ID
  const clientSecret = process.env.MELI_CLIENT_SECRET
  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('meli_code_verifier')?.value

  if (!clientId || !clientSecret) {
    return new Response(
      page(
        'Configuração faltando',
        `Adicione no <code>.env.local</code>:<br><br>
        <code>MELI_CLIENT_ID=seu_app_id</code><br>
        <code>MELI_CLIENT_SECRET=sua_secret_key</code><br><br>
        O code recebido foi: <code>${esc(code)}</code><br>
        Guarde-o — ele expira em ~10 minutos.`
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    })

    const response = await fetch(MELI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = await response.json()
    cookieStore.delete('meli_code_verifier')

    if (!response.ok || !data.access_token) {
      return new Response(
        page(
          'Erro ao trocar code por token',
          `MeLi respondeu com status ${response.status}:<br><br>
          <pre>${esc(JSON.stringify(data, null, 2))}</pre>
          <br>Possíveis causas:<br>
          - Code já foi usado (só funciona uma vez)<br>
          - Client ID/Secret incorretos<br>
          - Redirect URI diferente da cadastrada no MeLi`
        ),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    return new Response(
      page(
        'Autorização concluída!',
        `<p style="color:#10b981;font-weight:bold;font-size:18px">Tokens obtidos com sucesso</p>

        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8;width:160px">access_token</td>
            <td style="padding:8px;border:1px solid #333;font-family:monospace;font-size:12px;word-break:break-all">${esc(data.access_token)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">refresh_token</td>
            <td style="padding:8px;border:1px solid #333;font-family:monospace;font-size:12px;word-break:break-all;color:#fbbf24">${esc(data.refresh_token)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">user_id</td>
            <td style="padding:8px;border:1px solid #333;font-family:monospace">${esc(String(data.user_id))}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">expires_in</td>
            <td style="padding:8px;border:1px solid #333">${data.expires_in}s (~${Math.round(data.expires_in / 3600)}h)</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #333;color:#94a3b8">scope</td>
            <td style="padding:8px;border:1px solid #333">${esc(data.scope || 'N/A')}</td>
          </tr>
        </table>

        <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#94a3b8;margin:0 0 8px">Próximo passo — cole na tela <strong>Marketplaces → Mercado Livre → Conexão</strong>:</p>
          <ul style="margin:0;padding-left:20px;color:#e2e8f0">
            <li><strong>Client ID:</strong> ${esc(clientId)}</li>
            <li><strong>Client Secret:</strong> (já no .env)</li>
            <li><strong>Refresh Token:</strong> <code style="color:#fbbf24">${esc(data.refresh_token)}</code></li>
          </ul>
        </div>

        <p style="color:#64748b;font-size:13px">O refresh_token não expira enquanto for usado. O access_token renova automaticamente a cada 6h.</p>

        <details style="margin-top:16px">
          <summary style="color:#64748b;cursor:pointer;font-size:13px">Debug: raw ML response</summary>
          <pre style="margin-top:8px;font-size:11px">${esc(JSON.stringify(data, null, 2))}</pre>
          <p style="color:#64748b;font-size:12px">PKCE code_verifier cookie: ${codeVerifier ? 'found ✓' : 'NOT found ✗'}</p>
        </details>`
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  } catch (error) {
    return new Response(
      page(
        'Erro de rede',
        `Não foi possível conectar ao MeLi:<br><br><pre>${esc(error instanceof Error ? error.message : String(error))}</pre>`
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
  <title>MeLi OAuth — ${title}</title>
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
