'use client'

interface MarginIndicatorProps {
  health: 'good' | 'warning' | 'critical'
  marginPercent: number
  size?: 'sm' | 'md'
}

export function MarginIndicator({ health, marginPercent, size = 'md' }: MarginIndicatorProps) {
  const colorMap = {
    good: {
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'var(--accent-success)',
      text: 'var(--accent-success)',
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'var(--accent-warning)',
      text: 'var(--accent-warning)',
    },
    critical: {
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'var(--accent-danger)',
      text: 'var(--accent-danger)',
    },
  }

  const colors = colorMap[health]
  const paddingClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${paddingClass} ${health === 'critical' ? 'animate-pulse' : ''}`}
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.text,
        fontFamily: 'var(--font-jetbrains-mono)',
      }}
    >
      {marginPercent.toFixed(1)}%
    </span>
  )
}
