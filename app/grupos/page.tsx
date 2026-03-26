'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GroupCard } from '@/components/grupos/GroupCard'
import { useGroupStore } from '@/stores/groupStore'

export default function GruposPage() {
  const { groups, isLoading, error, lastSyncedAt, fetchFromMetalShopping } = useGroupStore()
  const [filter, setFilter] = useState<number | 'all'>('all')

  const filteredGroups = filter === 'all'
    ? groups
    : groups.filter((g) => g.level === filter)

  const levelLabels = Array.from(
    new Map(groups.map((g) => [g.level, g.levelLabel])).entries()
  ).sort((a, b) => a[0] - b[0])

  const syncedDate = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Grupos do Catálogo"
        subtitle={
          groups.length > 0
            ? `${groups.length} grupo${groups.length !== 1 ? 's' : ''} importado${groups.length !== 1 ? 's' : ''}${syncedDate ? ` · Sincronizado ${syncedDate}` : ''}`
            : 'Taxonomia de produtos do MetalShopping'
        }
        actions={
          <button
            onClick={() => fetchFromMetalShopping()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Importando...' : groups.length > 0 ? 'Sincronizar' : 'Importar Grupos'}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div
            className="mb-6 p-4 rounded-lg border text-sm"
            style={{
              borderColor: 'var(--accent-danger)',
              backgroundColor: 'rgba(239,68,68,0.08)',
              color: 'var(--accent-danger)',
            }}
          >
            {error}
          </div>
        )}

        {groups.length === 0 && !isLoading && !error && (
          <div className="text-center py-16">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              <RefreshCw size={24} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              Nenhum grupo importado ainda
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Clique em &quot;Importar Grupos&quot; para buscar a taxonomia do MetalShopping.
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <>
            {/* Level filter tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: filter === 'all' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: filter === 'all' ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                Todos ({groups.length})
              </button>
              {levelLabels.map(([level, label]) => {
                const count = groups.filter((g) => g.level === level).length
                return (
                  <button
                    key={level}
                    onClick={() => setFilter(level)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor: filter === level ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: filter === level ? 'white' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredGroups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
