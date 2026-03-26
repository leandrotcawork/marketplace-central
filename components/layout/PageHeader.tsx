import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-6 py-4 border-b flex-shrink-0',
        className
      )}
      style={{ borderColor: 'var(--border-color)' }}
    >
      <div>
        <h1
          className="text-xl font-semibold leading-tight"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-sm mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
