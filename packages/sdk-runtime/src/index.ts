export interface CatalogProduct {
  product_id: string;
  tenant_id: string;
  sku: string;
  name: string;
  status: string;
  cost: number;
}

export interface MarketplaceAccount {
  account_id: string;
  tenant_id: string;
  channel_code: string;
  display_name: string;
  status: string;
  connection_mode: string;
}

export interface CreateMarketplaceAccountRequest {
  account_id: string;
  channel_code: string;
  display_name: string;
  connection_mode: string;
}

export interface MarketplacePolicy {
  policy_id: string;
  tenant_id: string;
  account_id: string;
  commission_percent: number;
  fixed_fee_amount: number;
  default_shipping: number;
  tax_percent: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
}

export interface CreateMarketplacePolicyRequest {
  policy_id: string;
  account_id: string;
  commission_percent: number;
  fixed_fee_amount: number;
  default_shipping: number;
  min_margin_percent: number;
  sla_question_minutes: number;
  sla_dispatch_hours: number;
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
    listPricingSimulations: () => getJson<ListResponse<PricingSimulation>>("/pricing/simulations"),
    createMarketplaceAccount: (req: CreateMarketplaceAccountRequest) =>
      postJson<MarketplaceAccount>("/marketplaces/accounts", req),
    createMarketplacePolicy: (req: CreateMarketplacePolicyRequest) =>
      postJson<MarketplacePolicy>("/marketplaces/policies", req),
    runPricingSimulation: (req: RunPricingSimulationRequest) =>
      postJson<PricingSimulation>("/pricing/simulations", req),
    publishToVTEX: (req: PublishBatchRequest) =>
      postJson<PublishBatchResponse>("/connectors/vtex/publish", req),
    getBatchStatus: (batchId: string) =>
      getJson<BatchStatus>(`/connectors/vtex/publish/batch/${batchId}`),
    retryBatch: (batchId: string, products: VTEXProduct[]) =>
      postJson<PublishBatchResponse>(`/connectors/vtex/publish/batch/${batchId}/retry`, { supplemental_products: products }),
  };
}
