export interface Product {
  id: string
  sku: string
  referencia?: string
  ean?: string
  name: string
  category: string
  cost: number
  basePrice: number
  stock: number
  unit: string
}

export interface Marketplace {
  id: string
  name: string
  commission: number // decimal 0-1
  fixedFee: number
  active: boolean
  notes?: string
}

export interface MarginResult {
  productId: string
  marketplaceId: string
  sellingPrice: number
  commission: number
  margin: number
  marginPercent: number
  health: 'good' | 'warning' | 'critical'
}

export interface CompetitorPrice {
  productId: string
  competitorName: string
  marketplace: string
  price: number
  diff: number
  scrapedAt: string
}

export interface AIAnalysis {
  productId: string
  recommendations: Record<string, number>
  viability: Record<string, number>
  justification: string
  strategy: 'penetracao' | 'premium' | 'competitivo'
  alerts: string[]
}

export interface Publication {
  id: string
  productId: string
  marketplaceId: string
  price: number
  margin: number
  status: 'draft' | 'ready' | 'published'
  publishedAt?: string
}

export interface Pack {
  id: string
  name: string
  description?: string
  marketplaceIds: string[]
  productIds: string[]
  analysis?: {
    competitorPrices?: any[]
    aiAnalyses?: any[]
    opportunities?: any[]
  }
  createdAt: string
  updatedAt: string
}

export type StatusValue = 'idle' | 'progress' | 'complete'

export interface SidebarStatus {
  catalogo: StatusValue
  marketplaces: StatusValue
  simulador: StatusValue
  concorrencia: StatusValue
  analiseIa: StatusValue
  dashboard: StatusValue
  publicar: StatusValue
}
