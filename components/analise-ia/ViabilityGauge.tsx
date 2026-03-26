interface ViabilityGaugeProps {
  score: number // 1-10
  marketplaceName: string
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'var(--accent-success)'
  if (score >= 5) return 'var(--accent-warning)'
  return 'var(--accent-danger)'
}

function getScoreLabel(score: number): string {
  if (score >= 8) return 'Alta'
  if (score >= 5) return 'Média'
  return 'Baixa'
}

export function ViabilityGauge({ score, marketplaceName }: ViabilityGaugeProps) {
  const clampedScore = Math.max(1, Math.min(10, score))
  const widthPercent = (clampedScore / 10) * 100
  const color = getScoreColor(clampedScore)
  const label = getScoreLabel(clampedScore)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className="text-xs truncate"
          style={{ color: 'var(--text-secondary)', maxWidth: '60%' }}
        >
          {marketplaceName}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs font-medium"
            style={{ color, fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {clampedScore.toFixed(1)}/10
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color,
              backgroundColor: `${color}20`,
              fontSize: '10px',
            }}
          >
            {label}
          </span>
        </div>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}
