import type { ComponentType } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ComponentType<{ size?: number; className?: string }>
  trend?: 'up' | 'down' | 'neutral'
  accentColor?: string
}

const TREND_COLORS = {
  up: 'var(--accent-success)',
  down: 'var(--accent-danger)',
  neutral: 'var(--text-secondary)',
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = 'var(--accent-primary)',
}: KPICardProps) {
  const trendColor = trend ? TREND_COLORS[trend] : undefined

  return (
    <div
      className="relative rounded-xl border p-5 flex flex-col gap-3 overflow-hidden group transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
        boxShadow: '0 0 0 0 transparent',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 20px 2px ${accentColor}18`
        ;(e.currentTarget as HTMLDivElement).style.borderColor = `${accentColor}50`
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 0 transparent'
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)'
      }}
    >
      {/* Icon badge */}
      <div
        className="absolute top-4 right-4 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
      >
        <Icon size={18} className="flex-shrink-0" />
      </div>

      {/* Title */}
      <p
        className="text-xs font-medium uppercase tracking-wide pr-12"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </p>

      {/* Value */}
      <div className="flex items-end gap-2">
        <span
          className="text-3xl font-bold leading-none"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          {value}
        </span>
        {trend && (
          <span className="mb-0.5">
            {trend === 'up' && <TrendingUp size={16} style={{ color: trendColor }} />}
            {trend === 'down' && <TrendingDown size={16} style={{ color: trendColor }} />}
            {trend === 'neutral' && <Minus size={16} style={{ color: trendColor }} />}
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
