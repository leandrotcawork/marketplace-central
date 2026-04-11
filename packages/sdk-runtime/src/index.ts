export interface CatalogProduct {
  product_id: string;
  sku: string;
  name: string;
  description: string;
  brand_name: string;
  status: string;
  cost_amount: number;
  price_amount: number;
  stock_quantity: number;
  ean: string;
  reference: string;
  taxonomy_node_id: string;
  taxonomy_name: string;
  suggested_price: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  weight_g: number | null;
}

export interface TaxonomyNode {
  node_id: string;
  name: string;
  level: number;
  level_label: string;
  parent_node_id: string;
  is_active: boolean;
  product_count: number;
}

export interface ProductEnrichment {
  product_id: string;
  tenant_id?: string;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  weight_g: number | null;
  suggested_price_amount: number | null;
}

export interface Classification {
  classification_id: string;
  tenant_id?: string;
  name: string;
  ai_context: string;
  product_ids: string[];
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateClassificationRequest {
  name: string;
  ai_context: string;
  product_ids: string[];
}

export interface UpdateClassificationRequest {
  name: string;
  ai_context: string;
  product_ids: string[];
}

export interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
}

export type CapabilityStatus = 'supported' | 'partial' | 'planned' | 'blocked'

export interface CapabilityProfile {
  publish: CapabilityStatus
  price_sync: CapabilityStatus
  stock_sync: CapabilityStatus
  orders: CapabilityStatus
  messages: CapabilityStatus
  questions: CapabilityStatus
  freight_quotes: CapabilityStatus
  webhooks: CapabilityStatus
  sandbox: CapabilityStatus
}

export interface PluginMetadata {
  icon_url?: string
  color?: string
  docs_url?: string
  rollout_stage: 'v1' | 'wave_2' | 'blocked'
  execution_mode: 'live' | 'blocked'
}

export interface MarketplaceDefinition {
  code: string
  display_name: string
  auth_strategy: 'oauth2' | 'lwa' | 'api_key' | 'token' | 'unknown'
  is_active: boolean
  capability_profile: CapabilityProfile
  metadata: PluginMetadata
}

export interface IntegrationProviderDefinition {
  provider_code: string;
  tenant_id: string;
  family: "marketplace";
  display_name: string;
  auth_strategy: "oauth2" | "api_key" | "token" | "none" | "unknown";
  install_mode: "interactive" | "manual" | "hybrid";
  metadata?: Record<string, unknown>;
  declared_capabilities: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationInstallation {
  installation_id: string;
  tenant_id: string;
  provider_code: string;
  family: "marketplace";
  display_name: string;
  status:
    | "draft"
    | "pending_connection"
    | "connected"
    | "degraded"
    | "requires_reauth"
    | "disconnected"
    | "suspended"
    | "failed";
  health_status: "healthy" | "warning" | "critical";
  external_account_id: string;
  external_account_name: string;
  active_credential_id?: string;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationOperationRun {
  operation_run_id: string;
  installation_id: string;
  operation_type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  result_code: string;
  failure_code: string;
  attempt_count: number;
  actor_type: string;
  actor_id: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationFeeSyncAccepted {
  installation_id: string;
  operation_run_id: string;
  status: "queued";
}

export interface IntegrationAuthorizeResponse {
  installation_id: string;
  provider_code: string;
  state: string;
  auth_url: string;
  expires_in: number;
}

export interface IntegrationAuthStatusResponse {
  installation_id: string;
  status:
    | "draft"
    | "pending_connection"
    | "connected"
    | "degraded"
    | "requires_reauth"
    | "disconnected"
    | "suspended"
    | "failed";
  health_status: "healthy" | "warning" | "critical";
  provider_code?: string;
  external_account_id?: string;
}

export interface CreateIntegrationInstallationRequest {
  installation_id: string;
  provider_code: string;
  family: "marketplace";
  display_name: string;
}

export interface MarketplaceFeeSchedule {
  id: string;
  marketplace_code: string;
  category_id: string;
  listing_type: string;
  commission_percent: number;
  fixed_fee_amount: number;
  notes: string;
  source: 'api_sync' | 'seeded' | 'manual';
  synced_at: string;
}

export interface MarketplaceAccount {
  account_id: string;
  tenant_id: string;
  channel_code: string;
  marketplace_code: string;
  display_name: string;
  status: string;
  connection_mode: string;
}

export interface CreateMarketplaceAccountRequest {
  account_id: string;
  channel_code: string;
  display_name: string;
  connection_mode: string;
  marketplace_code?: string;
  credentials_json?: Record<string, string>;
}

export type ShippingProvider = "fixed" | "melhor_envio" | "marketplace";

export interface MarketplacePolicy {
  policy_id: string;
  tenant_id: string;
  account_id: string;
  marketplace_code: string;
  commission_percent: number;
  commission_override: number | null;
  fixed_fee_amount: number;
  default_shipping: number;
  tax_percent: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
  shipping_provider: string;
}

export interface CreateMarketplacePolicyRequest {
  policy_id: string;
  account_id: string;
  commission_percent: number;
  commission_override?: number | null;
  fixed_fee_amount: number;
  default_shipping: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
  shipping_provider?: string;
}

export interface PricingSimulation {
  simulation_id: string;
  tenant_id: string;
  product_id: string;
  account_id: string;
  margin_amount: number;
  margin_percent: number;
  status: string;
}

export interface RunPricingSimulationRequest {
  simulation_id: string;
  product_id: string;
  account_id: string;
  base_price_amount: number;
  cost_amount: number;
  commission_percent: number;
  fixed_fee_amount: number;
  shipping_amount: number;
  min_margin_percent: number;
}

export interface BatchSimulationRequest {
  product_ids: string[];
  policy_ids: string[];
  origin_cep: string;
  destination_cep: string;
  price_source: "my_price" | "suggested_price";
  price_overrides?: Record<string, number>;
}

export interface BatchSimulationItem {
  product_id: string;
  policy_id: string;
  selling_price: number;
  cost_amount: number;
  commission_amount: number;
  freight_amount: number;
  fixed_fee_amount: number;
  margin_amount: number;
  margin_percent: number;
  status: string;
  freight_source: string;
}

export interface ListResponse<T> {
  items: T[];
}

export interface ErrorResponse {
  error: {
    code: "invalid_request" | "not_found" | "conflict" | "internal_error";
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface MarketplaceCentralClientError {
  status: number;
  error: ErrorResponse["error"];
}

export interface VTEXProduct {
  product_id: string;
  name: string;
  description: string;
  sku_name: string;
  ean: string;
  category: string;
  brand: string;
  cost: number;
  base_price: number;
  image_urls: string[];
  specs: Record<string, string>;
  stock_qty: number;
  warehouse_id: string;
  trade_policy_id: string;
}

export interface PublishBatchRequest {
  vtex_account: string;
  products: VTEXProduct[];
}

export interface BatchRejection {
  product_id: string;
  error_code: string;
}

export interface PublishBatchResponse {
  batch_id: string;
  total_products: number;
  validated: number;
  rejected: number;
  rejections: BatchRejection[];
}

export interface BatchOperation {
  product_id: string;
  status: "pending" | "in_progress" | "succeeded" | "failed";
  current_step: string;
  error_code: string | null;
}

export interface BatchStatus {
  batch_id: string;
  vtex_account: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  in_progress: number;
  operations: BatchOperation[];
}

export function createMarketplaceCentralClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${options.baseUrl}${path}`, { method: "GET" });
    const data = await response.json();
    if (!response.ok) {
      throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
    }
    return data as T;
  }

  async function putJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
    }
    return data as T;
  }

  async function deleteJson(path: string): Promise<void> {
    const response = await fetchImpl(`${options.baseUrl}${path}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
    }
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw { status: response.status, error: (data as ErrorResponse).error } satisfies MarketplaceCentralClientError;
    }
    return data as T;
  }

  return {
    listCatalogProducts: () => getJson<ListResponse<CatalogProduct>>("/catalog/products"),
    listMarketplaceAccounts: () => getJson<ListResponse<MarketplaceAccount>>("/marketplaces/accounts"),
    listMarketplacePolicies: () => getJson<ListResponse<MarketplacePolicy>>("/marketplaces/policies"),
    listMarketplaceDefinitions: () => getJson<ListResponse<MarketplaceDefinition>>("/marketplaces/definitions"),
    listIntegrationProviders: () => getJson<ListResponse<IntegrationProviderDefinition>>("/integrations/providers"),
    listIntegrationInstallations: () => getJson<ListResponse<IntegrationInstallation>>("/integrations/installations"),
    listIntegrationOperationRuns: (installationId: string) =>
      getJson<ListResponse<IntegrationOperationRun>>(`/integrations/installations/${installationId}/operations`),
    startIntegrationAuthorization: (installationId: string) =>
      postJson<IntegrationAuthorizeResponse>(`/integrations/installations/${installationId}/auth/authorize`, {}),
    getIntegrationAuthStatus: (installationId: string) =>
      getJson<IntegrationAuthStatusResponse>(`/integrations/installations/${installationId}/auth/status`),
    startIntegrationFeeSync: (installationId: string) =>
      postJson<IntegrationFeeSyncAccepted>(`/integrations/installations/${installationId}/fee-sync`, {}),
    listMarketplaceFeeSchedules: (marketplaceCode: string) =>
      getJson<ListResponse<MarketplaceFeeSchedule>>(`/marketplaces/fee-schedules?marketplace_code=${encodeURIComponent(marketplaceCode)}`),
    listPricingSimulations: () => getJson<ListResponse<PricingSimulation>>("/pricing/simulations"),
    createMarketplaceAccount: (req: CreateMarketplaceAccountRequest) =>
      postJson<MarketplaceAccount>("/marketplaces/accounts", req),
    createMarketplacePolicy: (req: CreateMarketplacePolicyRequest) =>
      postJson<MarketplacePolicy>("/marketplaces/policies", req),
    createIntegrationInstallation: (req: CreateIntegrationInstallationRequest) =>
      postJson<IntegrationInstallation>("/integrations/installations", req),
    runPricingSimulation: (req: RunPricingSimulationRequest) =>
      postJson<PricingSimulation>("/pricing/simulations", req),
    runBatchSimulation: (req: BatchSimulationRequest) =>
      postJson<{ items: BatchSimulationItem[] }>("/pricing/simulations/batch", req),
    getMelhorEnvioStatus: () =>
      getJson<{ connected: boolean }>("/connectors/melhor-envio/status"),
    publishToVTEX: (req: PublishBatchRequest) =>
      postJson<PublishBatchResponse>("/connectors/vtex/publish", req),
    getBatchStatus: (batchId: string) =>
      getJson<BatchStatus>(`/connectors/vtex/publish/batch/${batchId}`),
    retryBatch: (batchId: string, products: VTEXProduct[]) =>
      postJson<PublishBatchResponse>(`/connectors/vtex/publish/batch/${batchId}/retry`, { supplemental_products: products }),

    // Catalog
    searchCatalogProducts: (query: string) =>
      getJson<ListResponse<CatalogProduct>>(`/catalog/products/search?q=${encodeURIComponent(query)}`),
    getCatalogProduct: (productId: string) =>
      getJson<CatalogProduct>(`/catalog/products/${productId}`),
    listTaxonomyNodes: () =>
      getJson<ListResponse<TaxonomyNode>>("/catalog/taxonomy"),
    getProductEnrichment: (productId: string) =>
      getJson<ProductEnrichment>(`/catalog/products/${productId}/enrichment`),
    updateProductEnrichment: (productId: string, data: Partial<ProductEnrichment>) =>
      putJson<ProductEnrichment>(`/catalog/products/${productId}/enrichment`, data),

    // Classifications
    listClassifications: () =>
      getJson<ListResponse<Classification>>("/classifications"),
    createClassification: (req: CreateClassificationRequest) =>
      postJson<Classification>("/classifications", req),
    getClassification: (id: string) =>
      getJson<Classification>(`/classifications/${id}`),
    updateClassification: (id: string, req: UpdateClassificationRequest) =>
      putJson<Classification>(`/classifications/${id}`, req),
    deleteClassification: (id: string) =>
      deleteJson(`/classifications/${id}`),
  };
}
