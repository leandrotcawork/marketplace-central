'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package,
  Store,
  DollarSign,
  Search,
  Grid3x3,
  Bot,
  BarChart3,
  Rocket,
  Settings,
  ChevronLeft,
  ChevronRight,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProductStore } from '@/stores/productStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useClassificationStore } from '@/stores/classificationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useMarketplaceCommissionScope } from '@/hooks/useMarketplaceCommissionScope'
import type { StatusValue } from '@/types'

interface NavItem {
  number: number
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  href: string
  statusKey: keyof SidebarStatusMap
}

type SidebarStatusMap = {
  catalogo: StatusValue
  marketplaces: StatusValue
  simulador: StatusValue
  concorrencia: StatusValue
  grupos: StatusValue
  classificacoes: StatusValue
  analiseIa: StatusValue
  dashboard: StatusValue
  publicar: StatusValue
}

function useSidebarStatus(): SidebarStatusMap {
  const { products, isLoaded } = useProductStore()
  const { marketplaces } = useMarketplaceStore()
  const { competitorPrices, aiAnalyses, publications } = useAnalysisStore()
  const { classifications } = useClassificationStore()
  const { groups } = useGroupStore()

  const hasProducts = products.length > 0
  const activeMarketplaces = marketplaces.filter((m) => m.active).length
  const hasCompetitors = competitorPrices.length > 0
  const hasAnalyses = aiAnalyses.length > 0
  const hasPublications = publications.length > 0
  const publishedCount = publications.filter(
    (p) => p.status === 'published' || p.status === 'partial'
  ).length

  return {
    catalogo: !isLoaded ? 'idle' : hasProducts ? 'complete' : 'progress',
    marketplaces: activeMarketplaces === 0 ? 'idle' : activeMarketplaces < 3 ? 'progress' : 'complete',
    simulador: !hasProducts ? 'idle' : 'complete',
    concorrencia: !hasProducts ? 'idle' : hasCompetitors ? 'complete' : 'progress',
    grupos: groups.length === 0 ? 'idle' : 'complete',
    classificacoes: classifications.length === 0 ? 'idle' : 'complete',
    analiseIa: !hasProducts ? 'idle' : hasAnalyses ? 'complete' : 'progress',
    dashboard: !hasProducts ? 'idle' : hasAnalyses ? 'complete' : 'progress',
    publicar: !hasPublications ? 'idle' : publishedCount > 0 ? 'complete' : 'progress',
  }
}

function StatusDot({ status }: { status: StatusValue }) {
  const colorClass =
    status === 'complete'
      ? 'text-[var(--accent-success)]'
      : status === 'progress'
      ? 'text-[var(--accent-warning)]'
      : 'text-[var(--text-secondary)]'

  return (
    <Circle
      size={8}
      className={cn('fill-current', colorClass)}
    />
  )
}

const NAV_ITEMS: NavItem[] = [
  { number: 1, icon: Package, label: 'Catálogo', href: '/catalogo', statusKey: 'catalogo' },
  { number: 2, icon: Store, label: 'Marketplaces', href: '/marketplaces', statusKey: 'marketplaces' },
  { number: 3, icon: DollarSign, label: 'Simulador', href: '/simulador', statusKey: 'simulador' },
  { number: 4, icon: Search, label: 'Concorrência', href: '/concorrencia', statusKey: 'concorrencia' },
  { number: 5, icon: Grid3x3, label: 'Grupos', href: '/grupos', statusKey: 'grupos' },
  { number: 6, icon: Grid3x3, label: 'Classificações', href: '/classificacoes', statusKey: 'classificacoes' },
  { number: 7, icon: Bot, label: 'Análise IA', href: '/analise-ia', statusKey: 'analiseIa' },
  { number: 8, icon: BarChart3, label: 'Dashboard', href: '/dashboard', statusKey: 'dashboard' },
  { number: 9, icon: Rocket, label: 'Publicar', href: '/publicar', statusKey: 'publicar' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const statuses = useSidebarStatus()
  useMarketplaceCommissionScope()

  return (
    <aside
      className={cn(
        'relative flex flex-col flex-shrink-0 h-screen border-r transition-all duration-300 overflow-hidden',
        'border-[var(--border-color)]',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Logo / Header */}
      <div
        className={cn(
          'flex items-center h-16 border-b px-4 flex-shrink-0',
          'border-[var(--border-color)]',
          collapsed ? 'justify-center' : 'gap-3'
        )}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <BarChart3 size={16} className="text-white" />
        </div>
        {!collapsed && (
          <span
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
          >
            Marketplace Central
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const status = statuses[item.statusKey]

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center rounded-lg transition-colors duration-150',
                    'text-sm relative group',
                    collapsed ? 'h-11 w-11 justify-center mx-auto' : 'h-10 px-3 gap-3',
                    isActive
                      ? 'text-white'
                      : 'hover:text-[var(--text-primary)]'
                  )}
                  style={{
                    backgroundColor: isActive ? 'var(--accent-primary)' : undefined,
                    color: isActive ? 'white' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = ''
                    }
                  }}
                >
                  {/* Number badge */}
                  {!collapsed && (
                    <span
                      className="w-5 h-5 rounded text-xs flex items-center justify-center flex-shrink-0 font-mono"
                      style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary)',
                        color: isActive ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {item.number}
                    </span>
                  )}

                  {/* Icon */}
                  <Icon size={18} className="flex-shrink-0" />

                  {/* Label */}
                  {!collapsed && (
                    <span className="flex-1 truncate" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                      {item.label}
                    </span>
                  )}

                  {/* Status badge */}
                  {!collapsed ? (
                    <span className="flex-shrink-0">
                      <StatusDot status={status} />
                    </span>
                  ) : (
                    <span
                      className="absolute top-1 right-1"
                    >
                      <StatusDot status={status} />
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Settings link */}
      <div
        className="flex-shrink-0 border-t px-2 pt-2"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {(() => {
          const isActive = pathname === '/configuracoes'
          return (
            <Link
              href="/configuracoes"
              className={cn(
                'flex items-center rounded-lg transition-colors duration-150',
                'text-sm relative group',
                collapsed ? 'h-11 w-11 justify-center mx-auto' : 'h-10 px-3 gap-3',
              )}
              style={{
                backgroundColor: isActive ? 'var(--accent-primary)' : undefined,
                color: isActive ? 'white' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = ''
              }}
            >
              <Settings size={18} className="flex-shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  Configurações
                </span>
              )}
            </Link>
          )
        })()}
      </div>

      {/* Collapse toggle */}
      <div
        className="flex-shrink-0 p-2"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className={cn(
            'flex items-center rounded-lg h-9 transition-colors duration-150 w-full',
            collapsed ? 'justify-center' : 'px-3 gap-2'
          )}
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = ''
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span className="text-xs" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                Recolher
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
