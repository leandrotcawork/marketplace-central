export type MarketplaceCapabilityStatus = 'supported' | 'partial' | 'planned' | 'blocked'
export type MarketplaceRolloutStage = 'v1' | 'wave_2' | 'blocked'
export type MarketplaceExecutionMode = 'live' | 'planned' | 'blocked'
export type MarketplaceAuthStrategy =
  | 'oauth2'
  | 'lwa'
  | 'api_key'
  | 'token'
  | 'seller_portal'
  | 'unknown'
export type MarketplaceRuleType = 'base' | 'group_override'
export type MarketplaceRuleSourceType =
  | 'official_doc'
  | 'seller_portal'
  | 'contract'
  | 'manual_assumption'
  | 'pending_doc'
export type MarketplaceReviewStatus = 'validated' | 'manual_assumption' | 'missing'
export type MarketplaceConnectionStatus = 'disconnected' | 'connected' | 'attention' | 'blocked'
export type MarketplaceSyncJobType = 'publish' | 'price' | 'stock' | 'order_sync'
export type MarketplaceSyncStatus = 'draft' | 'queued' | 'syncing' | 'published' | 'failed' | 'partial'

export interface ProductDimensions {
  heightCm: number | null
  widthCm: number | null
  lengthCm: number | null
  weightG: number | null
}

export interface Product {
  id: string
  sku: string
  referencia?: string
  ean?: string
  name: string
  category: string
  primaryTaxonomyNodeId?: string
  primaryTaxonomyGroupName?: string
  cost: number
  basePrice: number
  stock: number
  unit: string
  /** Dimensões do produto para cálculo de frete — populado manualmente via productDimensionsStore */
  heightCm?: number | null
  widthCm?: number | null
  lengthCm?: number | null
  weightG?: number | null
}

export interface MarketplaceCapabilityProfile {
  publish: MarketplaceCapabilityStatus
  priceSync: MarketplaceCapabilityStatus
  stockSync: MarketplaceCapabilityStatus
  orders: MarketplaceCapabilityStatus
  messages: MarketplaceCapabilityStatus
  questions: MarketplaceCapabilityStatus
  freightQuotes: MarketplaceCapabilityStatus
  webhooks: MarketplaceCapabilityStatus
  sandbox: MarketplaceCapabilityStatus
}

export interface MarketplaceCommercialProfile {
  commissionPercent: number // decimal 0-1
  fixedFeeAmount: number
  freightFixedAmount: number
  sourceType: MarketplaceRuleSourceType
  sourceRef?: string
  evidenceDate?: string
  reviewStatus: MarketplaceReviewStatus
  notes?: string
}

export interface MarketplaceChannel {
  id: string
  name: string
  active: boolean
  rolloutStage: MarketplaceRolloutStage
  executionMode: MarketplaceExecutionMode
  authStrategy: MarketplaceAuthStrategy
  connectionStatus: MarketplaceConnectionStatus
  notes?: string
  capabilities: MarketplaceCapabilityProfile
  commercialProfile: MarketplaceCommercialProfile
}

export type Marketplace = MarketplaceChannel

export interface MarketplaceCommissionRule {
  id: string
  channelId: string
  groupId: string
  groupName: string
  categoryLabel: string
  ruleType: MarketplaceRuleType
  commissionPercent: number
  fixedFeeAmount: number
  freightFixedAmount: number
  listingTypeId?: string
  sourceType: MarketplaceRuleSourceType
  sourceRef?: string
  evidenceDate?: string
  reviewStatus: MarketplaceReviewStatus
  notes?: string
}

export interface MarketplaceScopedGroup {
  id: string
  name: string
  categoryLabel: string
}

export interface MarginResult {
  productId: string
  productGroupId?: string
  marketplaceId: string
  sellingPrice: number
  commission: number
  commissionAmount: number
  fixedFeeAmount: number
  freightFixedAmount: number
  totalFees: number
  margin: number
  marginPercent: number
  health: 'good' | 'warning' | 'critical'
  ruleType: MarketplaceRuleType
  reviewStatus: MarketplaceReviewStatus
  sourceType: MarketplaceRuleSourceType
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
  connectionId?: string
  syncJobId?: string
  remoteListingId?: string
  productGroupId?: string
  price: number
  margin: number
  commissionPercent: number
  fixedFeeAmount: number
  freightFixedAmount: number
  totalFees: number
  status: MarketplaceSyncStatus
  ruleType: MarketplaceRuleType
  reviewStatus: MarketplaceReviewStatus
  sourceType: MarketplaceRuleSourceType
  errorMessage?: string
  publishedAt?: string
  syncedAt?: string
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

export interface MarketplaceConnection {
  connectionId: string
  channelId: string
  displayName: string
  accountId?: string
  authStrategy: MarketplaceAuthStrategy
  status: MarketplaceConnectionStatus
  hasStoredSecret: boolean
  lastValidatedAt?: string
  lastError?: string
  updatedAt: string
}

export interface MarketplaceSyncJob {
  id: string
  channelId: string
  connectionId?: string
  productId?: string
  publicationId?: string
  jobType: MarketplaceSyncJobType
  status: MarketplaceSyncStatus
  externalReference?: string
  requestPayload?: unknown
  resultPayload?: unknown
  errorMessage?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface MarketplaceRemoteListing {
  id: string
  channelId: string
  connectionId?: string
  productId: string
  externalListingId: string
  externalSku?: string
  status: MarketplaceSyncStatus
  lastPrice?: number
  lastStock?: number
  lastSyncedAt?: string
  rawPayload?: unknown
  createdAt: string
  updatedAt: string
}

export type MarketplaceCommissionImportStatus =
  | 'importable'
  | 'conflict'
  | 'missing'
  | 'error'

export interface MarketplaceCommissionImportProductPreview {
  productId: string
  sku: string
  name: string
  groupId: string
  groupName: string
  basePrice: number
  status: MarketplaceCommissionImportStatus
  categoryId?: string
  categoryName?: string
  listingTypeId?: string
  commissionPercent?: number
  fixedFeeAmount?: number
  saleFeeAmount?: number
  freightFixedAmount?: number
  sourceRef?: string
  error?: string
}

export interface MarketplaceCommissionImportGroupPreview {
  groupId: string
  groupName: string
  categoryLabel: string
  status: MarketplaceCommissionImportStatus
  productCount: number
  resolvedProductCount: number
  categoryId?: string
  categoryName?: string
  listingTypeId?: string
  commissionPercent?: number
  fixedFeeAmount?: number
  saleFeeAmount?: number
  freightFixedAmount?: number
  sourceRef?: string
  notes?: string
  sampleProducts: MarketplaceCommissionImportProductPreview[]
}

export interface MarketplaceProductImportOverride {
  channelId: string
  productId: string
  status: MarketplaceCommissionImportStatus
  categoryId?: string
  listingTypeId?: string
  commissionPercent?: number
  fixedFeeAmount?: number
  freightFixedAmount?: number
  importedAt: string
}

export interface MarketplaceCommissionImportResult {
  channelId: string
  importedGroups: MarketplaceCommissionImportGroupPreview[]
  conflictGroups: MarketplaceCommissionImportGroupPreview[]
  missingGroups: MarketplaceCommissionImportGroupPreview[]
  errorGroups: MarketplaceCommissionImportGroupPreview[]
  productPreviews: MarketplaceCommissionImportProductPreview[]
  generatedAt: string
  listingTypeId: string
}

export type StatusValue = 'idle' | 'progress' | 'complete'
