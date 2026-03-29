'use client'

import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import type {
  Marketplace,
  MarketplaceAuthStrategy,
  MarketplaceConnection,
  MarketplaceConnectionStatus,
} from '@/types'

type ConnectionDraft = {
  displayName: string
  accountId: string
  status: MarketplaceConnectionStatus
  lastValidatedAt: string
  lastError: string
  secrets: Record<string, string>
}

interface MarketplaceConnectionFormProps {
  marketplace: Marketplace
  connection?: MarketplaceConnection
  saving?: boolean
  onSave: (payload: {
    channelId: string
    displayName: string
    accountId?: string
    authStrategy: MarketplaceAuthStrategy
    status: MarketplaceConnectionStatus
    lastValidatedAt?: string
    lastError?: string
    secrets?: Record<string, string>
  }) => Promise<void> | void
  onValidate?: (channelId: string) => Promise<void> | void
}

type SecretField = {
  key: string
  label: string
  placeholder: string
}

function getSecretFields(marketplaceId: string, authStrategy: MarketplaceAuthStrategy): SecretField[] {
  switch (marketplaceId) {
    case 'mercado-livre':
      return [{ key: 'refreshToken', label: 'Refresh Token', placeholder: 'Token de renovacao' }]
    case 'amazon':
      return [
        { key: 'refreshToken', label: 'Refresh Token', placeholder: 'Refresh token SP-API' },
      ]
    case 'magalu':
      return []
    case 'leroy':
      return []
    case 'madeira':
      return []
    default:
      break
  }

  switch (authStrategy) {
    case 'oauth2':
    case 'api_key':
    case 'token':
    case 'seller_portal':
      return []
    case 'lwa':
      return [{ key: 'refreshToken', label: 'Refresh Token', placeholder: 'Refresh token SP-API' }]
    default:
      return []
  }
}

function buildDraft(
  marketplace: Marketplace,
  connection?: MarketplaceConnection
): ConnectionDraft {
  return {
    displayName: connection?.displayName ?? marketplace.name,
    accountId: connection?.accountId ?? '',
    status: connection?.status ?? marketplace.connectionStatus,
    lastValidatedAt: connection?.lastValidatedAt ?? '',
    lastError: connection?.lastError ?? '',
    secrets: {},
  }
}

const statusStyles: Record<MarketplaceConnectionStatus, { color: string; bg: string; label: string }> = {
  connected:    { color: 'var(--accent-success)', bg: 'rgba(16,185,129,0.12)', label: 'Conectado' },
  attention:    { color: 'var(--accent-warning)', bg: 'rgba(245,158,11,0.12)',  label: 'Atencao' },
  disconnected: { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)',      label: 'Desconectado' },
  blocked:      { color: 'var(--accent-danger)',  bg: 'rgba(239,68,68,0.12)',   label: 'Bloqueado' },
}

function formatValidatedAt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function MarketplaceConnectionForm({
  marketplace,
  connection,
  saving,
  onSave,
  onValidate,
}: MarketplaceConnectionFormProps) {
  const [draft, setDraft] = useState<ConnectionDraft>(() => buildDraft(marketplace, connection))
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    setDraft(buildDraft(marketplace, connection))
  }, [connection, marketplace])

  const secretFields = getSecretFields(marketplace.id, marketplace.authStrategy)
  const statusStyle = statusStyles[draft.status] ?? statusStyles.disconnected

  async function handleValidate() {
    if (!connection?.hasStoredSecret) return
    setValidating(true)
    setValidateResult(null)
    try {
      const res = await fetch(
        `/api/marketplace-connections/${encodeURIComponent(marketplace.id)}/validate`,
        { method: 'POST' }
      )
      const payload = await res.json()
      if (payload?.success) {
        const accountId = payload.data?.accountId ?? ''
        const now = new Date().toISOString()
        setDraft((current) => ({
          ...current,
          accountId,
          status: 'connected',
          lastValidatedAt: now,
          lastError: '',
        }))
        setValidateResult({ ok: true, message: `Conexão válida — conta: ${accountId}` })
      } else {
        const error = payload?.error ?? 'Falha na validação'
        setDraft((current) => ({
          ...current,
          status: 'attention',
          lastError: error,
        }))
        setValidateResult({ ok: false, message: error })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao validar'
      setDraft((current) => ({
        ...current,
        status: 'attention',
        lastError: message,
      }))
      setValidateResult({ ok: false, message })
    } finally {
      setValidating(false)
      if (onValidate) await onValidate(marketplace.id)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const secrets = Object.fromEntries(
      Object.entries(draft.secrets).filter(([, value]) => value.trim().length > 0)
    )

    await onSave({
      channelId: marketplace.id,
      displayName: draft.displayName.trim() || marketplace.name,
      accountId: draft.accountId.trim() || undefined,
      authStrategy: marketplace.authStrategy,
      status: draft.status,
      lastValidatedAt: draft.lastValidatedAt || undefined,
      lastError: draft.lastError.trim() || undefined,
      secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
    })

    setDraft((current) => ({
      ...current,
      secrets: {},
    }))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Conexao do canal
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Credenciais ficam apenas no servidor. Campos vazios nao sobrescrevem o segredo salvo.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Client ID, client secret, API keys e tokens de plataforma devem ficar no `.env`.
          </p>
        </div>
        <span
          className="rounded-full px-2 py-1 text-[11px] font-medium"
          style={{
            color: connection?.hasStoredSecret ? 'var(--accent-success)' : 'var(--text-secondary)',
            backgroundColor: connection?.hasStoredSecret
              ? 'rgba(16,185,129,0.12)'
              : 'var(--bg-tertiary)',
          }}
        >
          {connection?.hasStoredSecret ? 'Segredo salvo' : 'Sem segredo salvo'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Nome da conexao — editável */}
        <label className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Nome da conexao</span>
          <input
            value={draft.displayName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, displayName: event.target.value }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </label>

        {/* Conta externa — read-only, preenchida pelo validate */}
        <div className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Conta externa</span>
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ ...inputStyle, color: draft.accountId ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: draft.accountId ? 'var(--font-jetbrains-mono)' : undefined }}
          >
            {draft.accountId || 'Preenchido automaticamente ao validar'}
          </div>
        </div>

        {/* Estrategia de auth — badge estático */}
        <div className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Estrategia de auth</span>
          <div className="flex items-center px-1 py-1">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            >
              {marketplace.authStrategy}
            </span>
          </div>
        </div>

        {/* Status — read-only badge, preenchido pelo validate */}
        <div className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Status</span>
          <div className="flex items-center px-1 py-1">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {statusStyle.label}
            </span>
          </div>
        </div>

        {/* Ultima validacao — read-only, preenchida pelo validate */}
        <div className="flex flex-col gap-1.5 text-xs md:col-span-2">
          <span style={{ color: 'var(--text-secondary)' }}>Ultima validacao</span>
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ ...inputStyle, color: draft.lastValidatedAt ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {formatValidatedAt(draft.lastValidatedAt)}
          </div>
        </div>

        {/* Secret fields (ex: Refresh Token para ML) */}
        {secretFields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5 text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>{field.label}</span>
            <input
              type={field.key.toLowerCase().includes('secret') || field.key.toLowerCase().includes('password') ? 'password' : 'text'}
              value={draft.secrets[field.key] ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  secrets: {
                    ...current.secrets,
                    [field.key]: event.target.value,
                  },
                }))
              }
              className="rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              placeholder={field.placeholder}
            />
          </label>
        ))}

        {secretFields.length === 0 && (
          <div
            className="rounded-lg border px-3 py-3 text-xs md:col-span-2"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            Este canal está configurado para ler credenciais sensíveis diretamente do servidor via
            `.env`. Use esta tela apenas para metadata da conexão, validação e OAuth quando houver.
          </div>
        )}

        {/* Ultimo erro — read-only, preenchido pelo validate */}
        {draft.lastError && (
          <div className="flex flex-col gap-1.5 text-xs md:col-span-2">
            <span style={{ color: 'var(--text-secondary)' }}>Ultimo erro</span>
            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: 'rgba(239,68,68,0.3)',
                backgroundColor: 'rgba(239,68,68,0.06)',
                color: 'var(--accent-danger)',
              }}
            >
              {draft.lastError}
            </div>
          </div>
        )}
      </div>

      {validateResult && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: validateResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: validateResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)',
            border: `1px solid ${validateResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {validateResult.message}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {marketplace.id === 'mercado-livre' && (
            <a
              href="/api/auth/mercado-livre/start"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'rgba(255,230,0,0.15)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(255,230,0,0.3)',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              Autorizar no Mercado Livre
            </a>
          )}
          {connection?.hasStoredSecret && (
            <button
              type="button"
              onClick={handleValidate}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                fontFamily: 'var(--font-dm-sans)',
              }}
              disabled={validating || saving}
            >
              {validating ? 'Testando...' : 'Testar conexao'}
            </button>
          )}
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
          disabled={saving}
        >
          {saving ? 'Salvando...' : 'Salvar conexao'}
        </button>
      </div>
    </form>
  )
}

const inputStyle = {
  borderColor: 'var(--border-color)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
} satisfies CSSProperties
