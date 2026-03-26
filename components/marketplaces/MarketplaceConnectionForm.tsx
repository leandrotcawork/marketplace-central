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

function getSecretFields(authStrategy: MarketplaceAuthStrategy): SecretField[] {
  switch (authStrategy) {
    case 'oauth2':
      return [
        { key: 'clientId', label: 'Client ID', placeholder: 'App ID do parceiro' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Segredo da app' },
        { key: 'refreshToken', label: 'Refresh Token', placeholder: 'Token de renovacao' },
      ]
    case 'lwa':
      return [
        { key: 'clientId', label: 'LWA Client ID', placeholder: 'Identificador Login with Amazon' },
        { key: 'clientSecret', label: 'LWA Client Secret', placeholder: 'Segredo LWA' },
        { key: 'refreshToken', label: 'Refresh Token', placeholder: 'Refresh token SP-API' },
        { key: 'awsAccessKeyId', label: 'AWS Access Key ID', placeholder: 'AKIA...' },
        { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', placeholder: 'Chave secreta IAM' },
        { key: 'sellerId', label: 'Seller ID', placeholder: 'ID do seller na Amazon Brasil' },
      ]
    case 'api_key':
      return [
        { key: 'apiKey', label: 'API Key', placeholder: 'Chave do seller portal' },
        { key: 'apiSecret', label: 'API Secret', placeholder: 'Segredo opcional' },
      ]
    case 'token':
      return [
        { key: 'accessToken', label: 'Access Token', placeholder: 'Token do canal' },
      ]
    case 'seller_portal':
      return [
        { key: 'portalUser', label: 'Usuario', placeholder: 'Usuario do seller portal' },
        { key: 'portalPassword', label: 'Senha', placeholder: 'Senha ou token' },
      ]
    default:
      return [
        { key: 'credential', label: 'Credencial', placeholder: 'Cole aqui a credencial principal' },
      ]
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
    lastValidatedAt: connection?.lastValidatedAt?.slice(0, 16) ?? '',
    lastError: connection?.lastError ?? '',
    secrets: {},
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

  const secretFields = getSecretFields(marketplace.authStrategy)

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
        setValidateResult({ ok: true, message: `Conexão válida — conta: ${payload.data?.accountId ?? ''}` })
      } else {
        setValidateResult({ ok: false, message: payload?.error ?? 'Falha na validação' })
      }
    } catch (error) {
      setValidateResult({ ok: false, message: error instanceof Error ? error.message : 'Erro ao validar' })
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

        <label className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Conta externa</span>
          <input
            value={draft.accountId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, accountId: event.target.value }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            placeholder="seller id / loja / conta"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Estrategia de auth</span>
          <input
            value={marketplace.authStrategy}
            readOnly
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ ...inputStyle, opacity: 0.8 }}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Status</span>
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as MarketplaceConnectionStatus,
              }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="disconnected">Desconectado</option>
            <option value="attention">Atencao</option>
            <option value="connected">Conectado</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs md:col-span-2">
          <span style={{ color: 'var(--text-secondary)' }}>Ultima validacao</span>
          <input
            type="datetime-local"
            value={draft.lastValidatedAt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, lastValidatedAt: event.target.value }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </label>

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

        <label className="flex flex-col gap-1.5 text-xs md:col-span-2">
          <span style={{ color: 'var(--text-secondary)' }}>Ultimo erro</span>
          <textarea
            value={draft.lastError}
            onChange={(event) =>
              setDraft((current) => ({ ...current, lastError: event.target.value }))
            }
            className="min-h-24 rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            placeholder="Use para registrar token expirado, role pendente, homologacao etc."
          />
        </label>
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
          {connection?.hasStoredSecret && (
            <button
              type="button"
              onClick={handleValidate}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
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
          className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
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
