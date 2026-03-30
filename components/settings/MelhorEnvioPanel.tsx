'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useShippingStore } from '@/stores/shippingStore'

interface ConnectionStatus {
  connected: boolean
  email?: string
  name?: string
  error?: string
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return digits
}

export function MelhorEnvioPanel({ connectedOnLoad }: { connectedOnLoad?: boolean }) {
  const { fromCep, toCep, setFromCep, setToCep } = useShippingStore()

  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void checkConnection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedOnLoad])

  async function checkConnection() {
    setLoading(true)
    try {
      const response = await fetch('/api/melhor-envio/quote')
      const data = await response.json()
      setStatus({ connected: Boolean(data.connected), email: data.email, name: data.name, error: data.error })
    } catch {
      setStatus({ connected: false, error: 'Falha ao verificar conexão' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="rounded-2xl border p-6 flex flex-col gap-5"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Melhor Envios
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Cotação automática de frete via OAuth2. O token é armazenado criptografado.
          </p>
        </div>

        {loading ? (
          <Loader2 size={18} className="animate-spin flex-shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
        ) : status?.connected ? (
          <CheckCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-success)' }} />
        ) : (
          <XCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-danger)' }} />
        )}
      </div>

      {/* Connection status */}
      {!loading && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: status?.connected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${status?.connected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: status?.connected ? 'var(--accent-success)' : 'var(--accent-danger)',
          }}
        >
          {status?.connected
            ? `Conectado${status.name ? ` como ${status.name}` : ''}${status.email ? ` (${status.email})` : ''}`
            : status?.error ?? 'Não conectado'}
        </div>
      )}

      {/* OAuth connect button */}
      {!loading && !status?.connected && (
        <a
          href="/api/auth/melhor-envio/start"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium self-start transition-opacity hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          <ExternalLink size={14} />
          Conectar com Melhor Envios
        </a>
      )}

      {!loading && status?.connected && (
        <a
          href="/api/auth/melhor-envio/start"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium self-start transition-opacity hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          <ExternalLink size={14} />
          Reconectar / trocar conta
        </a>
      )}

      {/* CEP configuration */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            CEP de Origem (armazém)
          </label>
          <input
            type="text"
            placeholder="00000-000"
            value={fromCep}
            onChange={(e) => setFromCep(formatCep(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            CEP de Destino (simulação padrão)
          </label>
          <input
            type="text"
            placeholder="00000-000"
            value={toCep}
            onChange={(e) => setToCep(formatCep(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          />
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Os CEPs são usados nas cotações da importação de comissões e no simulador de margem.
        O destino pode ser alterado por cotação individual.
      </p>
    </div>
  )
}
