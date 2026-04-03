import { useState, useEffect, useCallback } from "react";
import { ProductPicker, Button, SurfaceCard } from "@marketplace-central/ui";
import type {
  CatalogProduct as UICatalogProduct,
  TaxonomyNode,
  Classification,
} from "@marketplace-central/ui";
import type {
  CatalogProduct,
  MarketplacePolicy,
  PricingSimulation,
  RunPricingSimulationRequest,
} from "@marketplace-central/sdk-runtime";
import { ToggleLeft, ToggleRight } from "lucide-react";

/* ── Client interface ── */

export interface SimulatorClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  runPricingSimulation: (req: RunPricingSimulationRequest) => Promise<PricingSimulation>;
}

interface PricingSimulatorPageProps {
  client: SimulatorClient;
}

/* ── Result with product context for display ── */

interface SimulationResultRow {
  product: CatalogProduct;
  basePrice: number;
  simulation: PricingSimulation;
}

/* ── Helpers ── */

function toPickerProduct(p: CatalogProduct): UICatalogProduct {
  return {
    product_id: p.product_id,
    sku: p.sku,
    name: p.name,
    ean: p.ean,
    reference: p.reference,
    brand_name: p.brand_name,
    cost_amount: p.cost_amount,
    price_amount: p.price_amount,
    stock_quantity: p.stock_quantity,
    taxonomy_node_id: p.taxonomy_node_id,
    taxonomy_name: p.taxonomy_name,
  };
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function marginColor(pct: number): string {
  if (pct >= 0.20) return "text-emerald-600";
  if (pct >= 0.10) return "text-amber-600";
  return "text-red-600";
}

function marginBg(pct: number): string {
  if (pct >= 0.20) return "bg-emerald-50";
  if (pct >= 0.10) return "bg-amber-50";
  return "bg-red-50";
}

function statusBadge(status: string) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        healthy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      {status}
    </span>
  );
}

/* ── Component ── */

export function PricingSimulatorPage({ client }: PricingSimulatorPageProps) {
  /* Data loading state */
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Selection state */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [useSuggestedPrice, setUseSuggestedPrice] = useState(false);

  /* Simulation state */
  const [simulating, setSimulating] = useState(false);
  const [results, setResults] = useState<SimulationResultRow[]>([]);
  const [simError, setSimError] = useState<string | null>(null);

  /* Load data on mount */
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [prodRes, taxRes, clsRes, polRes] = await Promise.all([
          client.listCatalogProducts(),
          client.listTaxonomyNodes(),
          client.listClassifications(),
          client.listMarketplacePolicies(),
        ]);
        if (cancelled) return;
        setProducts(prodRes.items);
        setTaxonomyNodes(taxRes.items);
        setClassifications(clsRes.items);
        setPolicies(polRes.items);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.error?.message ?? "Failed to load data.");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [client]);

  /* Run simulation for each selected product x selected policy */
  const handleSimulate = useCallback(async () => {
    if (selectedIds.length === 0 || !selectedPolicyId) return;

    const policy = policies.find((p) => p.policy_id === selectedPolicyId);
    if (!policy) return;

    setSimulating(true);
    setSimError(null);
    setResults([]);

    const rows: SimulationResultRow[] = [];

    try {
      for (const productId of selectedIds) {
        const product = products.find((p) => p.product_id === productId);
        if (!product) continue;

        const basePrice =
          useSuggestedPrice && product.suggested_price
            ? product.suggested_price
            : product.price_amount;

        const req: RunPricingSimulationRequest = {
          simulation_id: `sim_${Date.now()}_${product.product_id}`,
          product_id: product.product_id,
          account_id: policy.account_id,
          base_price_amount: basePrice,
          cost_amount: product.cost_amount,
          commission_percent: policy.commission_percent,
          fixed_fee_amount: policy.fixed_fee_amount,
          shipping_amount: policy.default_shipping,
          min_margin_percent: policy.min_margin_percent,
        };

        const sim = await client.runPricingSimulation(req);
        rows.push({ product, basePrice, simulation: sim });
      }
      setResults(rows);
    } catch (err: any) {
      setSimError(err?.error?.message ?? "Simulation failed. Please try again.");
    } finally {
      setSimulating(false);
    }
  }, [selectedIds, selectedPolicyId, products, policies, useSuggestedPrice, client]);

  /* Picker products mapped to UI type */
  const pickerProducts = products.map(toPickerProduct);

  const selectedPolicy = policies.find((p) => p.policy_id === selectedPolicyId);

  const canSimulate = selectedIds.length > 0 && !!selectedPolicyId && !simulating;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select products and a marketplace policy, then run a margin simulation.
        </p>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Step 1: Product selection */}
      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">1. Select Products</h3>
        <ProductPicker
          products={pickerProducts}
          taxonomyNodes={taxonomyNodes}
          classifications={classifications}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          loading={loadingData}
        />
      </SurfaceCard>

      {/* Step 2: Policy selection */}
      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">2. Select Marketplace Policy</h3>
        <select
          value={selectedPolicyId}
          onChange={(e) => setSelectedPolicyId(e.target.value)}
          aria-label="Marketplace policy"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Choose a policy...</option>
          {policies.map((p) => (
            <option key={p.policy_id} value={p.policy_id}>
              {p.policy_id} &mdash; commission {(p.commission_percent * 100).toFixed(1)}%, min margin {(p.min_margin_percent * 100).toFixed(1)}%
            </option>
          ))}
        </select>
        {selectedPolicy && (
          <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-3">
            <span>Commission: {(selectedPolicy.commission_percent * 100).toFixed(1)}%</span>
            <span>Fixed fee: {formatCurrency(selectedPolicy.fixed_fee_amount)}</span>
            <span>Shipping: {formatCurrency(selectedPolicy.default_shipping)}</span>
            <span>Min margin: {(selectedPolicy.min_margin_percent * 100).toFixed(1)}%</span>
          </div>
        )}
      </SurfaceCard>

      {/* Step 3: Toggle + Run */}
      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">3. Run Simulation</h3>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setUseSuggestedPrice((v) => !v)}
            className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
            aria-label="Toggle price source"
          >
            {useSuggestedPrice ? (
              <ToggleRight className="h-5 w-5 text-blue-600" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-slate-400" />
            )}
            {useSuggestedPrice ? "Using suggested price" : "Using my price"}
          </button>
          <Button
            variant="primary"
            onClick={handleSimulate}
            loading={simulating}
            disabled={!canSimulate}
          >
            Run Simulation
          </Button>
        </div>
      </SurfaceCard>

      {/* Error */}
      {simError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {simError}
        </div>
      )}

      {/* Step 4: Results table */}
      {results.length > 0 && (
        <SurfaceCard>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Results</h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Product</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Cost (R$)</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Base Price (R$)</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Margin (R$)</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Margin %</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((row) => (
                  <tr key={row.simulation.simulation_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{row.product.name}</span>
                      <span className="ml-1 text-slate-400 text-xs">({row.product.sku})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 font-mono">
                      {formatCurrency(row.product.cost_amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 font-mono">
                      {formatCurrency(row.basePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                      {formatCurrency(row.simulation.margin_amount)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${marginColor(row.simulation.margin_percent)}`}>
                      <span className={`inline-block px-2 py-0.5 rounded ${marginBg(row.simulation.margin_percent)}`}>
                        {(row.simulation.margin_percent * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusBadge(row.simulation.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
