'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MelhorEnvioPanel } from '@/components/settings/MelhorEnvioPanel'

function ConfiguracoesContent() {
  const searchParams = useSearchParams()
  const meConnected = searchParams.get('me_connected') === '1'
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (meConnected) {
      setFeedback('Melhor Envios conectado com sucesso!')
      const timer = setTimeout(() => setFeedback(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [meConnected])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Configurações"
        subtitle="Integrações de frete e preferências operacionais"
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6 max-w-2xl">
        {feedback && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: 'var(--accent-success)',
            }}
          >
            {feedback}
          </div>
        )}

        <MelhorEnvioPanel connectedOnLoad={meConnected} />
      </div>
    </div>
  )
}

export default function ConfiguracoesPage() {
  return (
    <Suspense>
      <ConfiguracoesContent />
    </Suspense>
  )
}
