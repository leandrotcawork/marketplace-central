import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import { ToggleLeft, ToggleRight, ChevronRight, ChevronDown } from "lucide-react";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  MarketplacePolicy,
  BatchSimulationRequest,
  BatchSimulationItem,
} from "@marketplace-central/sdk-runtime";

export interface SimulatorClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  runBatchSimulation: (req: BatchSimulationRequest) => Promise<{ items: BatchSimulationItem[] }>;
  getMelhorEnvioStatus: () => Promise<{ connected: boolean }>;
}

interface Props { client: SimulatorClient; }

function fmt(v: number | null | undefined) {
  return v == null ? "—" : `R$ ${v.toFixed(2)}`;
}
function marginColor(pct: number) {
  if (pct >= 0.20) return "text-emerald-700";
  if (pct >= 0.10) return "text-amber-700";
  return "text-red-700";
}
function marginBg(pct: number) {
  if (pct >= 0.20) return "bg-emerald-100";
  if (pct >= 0.10) return "bg-amber-100";
  return "bg-red-100";
}

export function PricingSimulatorPage({ client }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originCep, setOriginCep] = useState("");
  const [destinationCep, setDestinationCep] = useState("");
  const [priceSource, setPriceSource] = useState<"my_price" | "suggested_price">("my_price");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchSimulationItem[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [prodRes, clsRes, polRes, taxRes] = await Promise.all([
          client.listCatalogProducts(),
          client.listClassifications(),
          client.listMarketplacePolicies(),
          client.listTaxonomyNodes(),
        ]);
        if (cancelled) return;
        setProducts(prodRes.items);
        setClassifications(clsRes.items);
        setPolicies(polRes.items);
        setTaxonomyNodes(taxRes.items);
      } catch {
        if (!cancelled) setLoadError("Failed to load data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [client]);

  const resultMap = useMemo(() => {
    const m: Record<string, BatchSimulationItem> = {};
    for (const item of results) {
      m[`${item.product_id}::${item.policy_id}`] = item;
    }
    return m;
  }, [results]);

  const hasResults = results.length > 0;

  const filtered = useMemo(() => {
    let items = products.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchTax = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      return matchSearch && matchTax;
    });
    return items;
  }, [products, search, taxonomyFilter]);

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleClassification(cls: Classification) {
    const allSelected = cls.product_ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) cls.product_ids.forEach((id) => next.delete(id));
      else cls.product_ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleExpand(policyId: string) {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId); else next.add(policyId);
      return next;
    });
  }

  const cepDigits = (s: string) => s.replace(/\D/g, "");
  const canRun = selectedIds.size > 0
    && cepDigits(originCep).length >= 8
    && cepDigits(destinationCep).length >= 8
    && !running;

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setResults([]);
    try {
      const res = await client.runBatchSimulation({
        product_ids: Array.from(selectedIds),
        policy_ids: policies.map((p) => p.policy_id),
        origin_cep: cepDigits(originCep),
        destination_cep: cepDigits(destinationCep),
        price_source: priceSource,
        price_overrides: priceOverrides,
      });
      setResults(res.items);
    } catch (err: any) {
      setRunError(err?.error?.message ?? "Simulation failed.");
    } finally {
      setRunning(false);
    }
  }, [selectedIds, policies, originCep, destinationCep, priceSource, priceOverrides, client]);

  function commitOverride(productId: string, policyId: string, raw: string) {
    const val = parseFloat(raw.replace(",", "."));
    if (!isFinite(val) || val <= 0) return;
    const key = `${productId}::${policyId}`;
    setPriceOverrides((prev) => ({ ...prev, [key]: val }));
    // Recalculate this cell locally.
    setResults((prev) => prev.map((item) => {
      if (item.product_id !== productId || item.policy_id !== policyId) return item;
      const policy = policies.find((p) => p.policy_id === policyId);
      if (!policy) return item;
      const commissionAmt = val * policy.commission_percent;
      const marginAmt = val - item.cost_amount - commissionAmt - item.fixed_fee_amount - item.freight_amount;
      const marginPct = val > 0 ? marginAmt / val : 0;
      const status = marginPct >= policy.min_margin_percent ? "healthy" : "warning";
      return { ...item, selling_price: val, commission_amount: commissionAmt, margin_amount: marginAmt, margin_percent: marginPct, status };
    }));
  }

  // Summary stats
  const avgMargin = results.length > 0
    ? results.reduce((s, r) => s + r.margin_percent, 0) / results.length : 0;
  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const criticalCount = results.filter((r) => r.status !== "healthy" && r.status !== "warning").length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* Command bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="origin-cep" className="block text-xs font-medium text-slate-700">Origin CEP</label>
            <input
              id="origin-cep"
              aria-label="Origin CEP"
              value={originCep}
              onChange={(e) => setOriginCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="dest-cep" className="block text-xs font-medium text-slate-700">Destination CEP</label>
            <input
              id="dest-cep"
              aria-label="Destination CEP"
              value={destinationCep}
              onChange={(e) => setDestinationCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => setPriceSource((v) => v === "my_price" ? "suggested_price" : "my_price")}
              className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
              aria-label="Toggle price source"
            >
              {priceSource === "suggested_price"
                ? <ToggleRight className="h-5 w-5 text-blue-600" />
                : <ToggleLeft className="h-5 w-5 text-slate-400" />}
              {priceSource === "suggested_price" ? "Using suggested price" : "Using my price"}
            </button>
          </div>
          <div className="ml-auto pb-0.5">
            <Button variant="primary" onClick={handleRun} loading={running} disabled={!canRun}>
              Run Simulation
            </Button>
          </div>
        </div>
        {runError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{runError}</div>
        )}
      </div>

      {/* Classification pills (scope selector) */}
      {classifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {classifications.map((cls) => {
            const allSelected = cls.product_ids.length > 0 && cls.product_ids.every((id) => selectedIds.has(id));
            return (
              <button
                key={cls.classification_id}
                type="button"
                aria-label={`${cls.name} Ã—${cls.product_count}`}
                onClick={() => toggleClassification(cls)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                  allSelected
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                }`}
              >
                {cls.name} <span className="opacity-75">Ã—{cls.product_count}</span>
              </button>
            );
          })}
          {selectedIds.size > 0 && (
            <span className="text-sm text-slate-500 ml-2">{selectedIds.size} selected</span>
          )}
        </div>
      )}

      {/* Summary banner */}
      {hasResults && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap gap-6 items-center text-sm">
          <span className="font-medium text-slate-700">
            Avg margin <span className={marginColor(avgMargin)}>{(avgMargin * 100).toFixed(1)}%</span>
          </span>
          <span className="text-emerald-700">Healthy: {healthyCount}</span>
          <span className="text-amber-700">Warning: {warningCount}</span>
          {criticalCount > 0 && <span className="text-red-700">Critical: {criticalCount}</span>}
          <button onClick={() => setResults([])} className="ml-auto text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
            Clear Results
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={taxonomyFilter}
          onChange={(e) => setTaxonomyFilter(e.target.value)}
          aria-label="Taxonomy filter"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Taxonomy</option>
          {taxonomyNodes.map((t) => <option key={t.node_id} value={t.node_id}>{t.name}</option>)}
        </select>
      </div>

      {/* Product table */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        loading={loadingData}
        renderHeader={() => (
          <tr>
            <th className="px-3 py-3 w-10"></th>
            <th className="px-4 py-3 font-medium text-slate-600 text-left">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-left">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            {!hasResults && <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>}
            {hasResults && policies.flatMap((pol) => {
              const isExpanded = expandedPolicies.has(pol.policy_id);
              if (isExpanded) {
                return [
                  <th key={`${pol.policy_id}_sp`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Sell Price</th>,
                  <th key={`${pol.policy_id}_cm`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Commission</th>,
                  <th key={`${pol.policy_id}_fr`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Freight</th>,
                  <th key={`${pol.policy_id}_ff`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">Fixed Fee</th>,
                  <th key={`${pol.policy_id}_mg`} className="px-3 py-3 font-medium text-slate-600 text-right text-xs">
                    <button
                      type="button"
                      aria-label={`Expand ${pol.policy_id}`}
                      onClick={() => toggleExpand(pol.policy_id)}
                      className="flex items-center gap-1 text-blue-700 font-semibold cursor-pointer"
                    >
                      {pol.policy_id} <ChevronDown className="h-3 w-3" />
                    </button>
                    Margin
                  </th>,
                ];
              }
              return [
                <th key={pol.policy_id} className="px-4 py-3 font-medium text-slate-600 text-right text-xs">
                  <button
                    type="button"
                    aria-label={`Expand ${pol.policy_id}`}
                    onClick={() => toggleExpand(pol.policy_id)}
                    className="flex items-center gap-1 text-slate-700 cursor-pointer hover:text-blue-600"
                  >
                    {pol.policy_id} <ChevronRight className="h-3 w-3" />
                  </button>
                </th>,
              ];
            })}
          </tr>
        )}
        renderRow={(p) => {
          const checked = selectedIds.has(p.product_id);
          return (
            <tr
              key={p.product_id}
              className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${checked ? "bg-blue-50/30" : ""}`}
              onClick={() => toggleProduct(p.product_id)}
            >
              <td className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`Select product ${p.sku}`}
                  onChange={() => toggleProduct(p.product_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.cost_amount)}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.price_amount)}</td>
              {!hasResults && (
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.stock_quantity}</td>
              )}
              {hasResults && policies.flatMap((pol) => {
                const item = resultMap[`${p.product_id}::${pol.policy_id}`];
                const isExpanded = expandedPolicies.has(pol.policy_id);
                if (isExpanded) {
                  const overrideKey = `${p.product_id}::${pol.policy_id}`;
                  return [
                    <td key={`${overrideKey}_sp`} className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {item ? (
                        <input
                          type="text"
                          defaultValue={item.selling_price.toFixed(2)}
                          aria-label={`Selling price ${p.sku} ${pol.policy_id}`}
                          onBlur={(e) => commitOverride(p.product_id, pol.policy_id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") e.currentTarget.value = item.selling_price.toFixed(2); }}
                          className="w-20 px-1.5 py-0.5 text-right text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>,
                    <td key={`${overrideKey}_cm`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? fmt(item.commission_amount) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_fr`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? (
                        <span title={item.freight_source}>{fmt(item.freight_amount)}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_ff`} className="px-3 py-2 text-right font-mono text-xs text-slate-600 tabular-nums">
                      {item ? fmt(item.fixed_fee_amount) : <span className="text-slate-300">—</span>}
                    </td>,
                    <td key={`${overrideKey}_mg`} className="px-3 py-2 text-right">
                      {item ? (
                        <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}>
                          {(item.margin_percent * 100).toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>,
                  ];
                }
                return [
                  <td key={`${p.product_id}::${pol.policy_id}_col`} className="px-4 py-2 text-right">
                    {item ? (
                      <span className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}>
                        {(item.margin_percent * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>,
                ];
              })}
            </tr>
          );
        }}
        emptyState={<p className="text-sm text-slate-500">No products match your filters.</p>}
      />
    </div>
  );
}
