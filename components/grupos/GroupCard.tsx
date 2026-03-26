'use client'

import type { Group } from '@/types'

interface GroupCardProps {
  group: Group
}

export function GroupCard({ group }: GroupCardProps) {
  const productCount = group.productIds.length

  return (
    <div
      className="flex items-start justify-between p-4 rounded-lg border"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {group.levelLabel}
          </span>
        </div>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          {group.name}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {productCount} produto{productCount !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
