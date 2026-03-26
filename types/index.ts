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

export interface Classification {
  id: string
  name: string
  aiContext: string
  productIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string           // taxonomy_node_id e.g. "tx_11"
  name: string         // e.g. "ASSENTO PLASTICO"
  level: number        // 0 = Grupo, 1 = Categoria, 2 = Subgrupo
  levelLabel: string   // from catalog_taxonomy_level_defs.label
  productIds: string[] // product_ids where primary_taxonomy_node_id = this node
  syncedAt: string     // ISO timestamp of last import
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
