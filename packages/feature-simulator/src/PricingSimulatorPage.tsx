import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import { ToggleLeft, ToggleRight } from "lucide-react";
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
  const [melhorEnvioConnected, setMelhorEnvioConnected] = useState<boolean | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originCep, setOriginCep] = useState("");
  const [destinationCep, setDestinationCep] = useState("");
  const [priceSource, setPriceSource] = useState<"my_price" | "suggested_price">("my_price");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchSimulationItem[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<Set<string>>(new Set());
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "warning" | "critical">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [prodRes, clsRes, polRes, taxRes, melhorEnvioRes] = await Promise.all([
          client.listCatalogProducts(),
          client.listClassifications(),
          client.listMarketplacePolicies(),
          client.listTaxonomyNodes(),
          client.getMelhorEnvioStatus(),
        ]);
        if (cancelled) return;
        setProducts(prodRes.items);
        setClassifications(clsRes.items);
        setPolicies(polRes.items);
        setTaxonomyNodes(taxRes.items);
        setMelhorEnvioConnected(melhorEnvioRes.connected);
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

  const allowedByClassification = useMemo(() => {
    if (classificationFilter.size === 0) return null;
    const allowed = new Set<string>();
    for (const cls of classifications) {
      if (classificationFilter.has(cls.classification_id)) {
        cls.product_ids.forEach((id) => allowed.add(id));
      }
    }
    return allowed;
  }, [classifications, classificationFilter]);

  const filtered = useMemo(() => {
    let items = products.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchTax = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      const matchClassification = !allowedByClassification || allowedByClassification.has(p.product_id);
      return matchSearch && matchTax && matchClassification;
    });
    if (hasResults && healthFilter !== "all") {
      items = items.filter((p) => {
        const statuses = policies.map((pol) => resultMap[`${p.product_id}::${pol.policy_id}`]?.status).filter(Boolean);
        if (healthFilter === "healthy") return statuses.some((s) => s === "healthy");
        if (healthFilter === "warning") return statuses.some((s) => s === "warning");
        if (healthFilter === "critical") return statuses.some((s) => s !== "healthy" && s !== "warning");
        return true;
      });
    }
    return items;
  }, [products, search, taxonomyFilter, allowedByClassification, healthFilter, hasResults, policies, resultMap]);

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleClassificationFilter(classificationId: string) {
    const cls = classifications.find((c) => c.classification_id === classificationId);
    if (!cls) return;
    const willActivate = !classificationFilter.has(classificationId);
    setClassificationFilter((prev) => {
      const next = new Set(prev);
      if (willActivate) next.add(classificationId);
      else next.delete(classificationId);
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (willActivate) cls.product_ids.forEach((id) => next.add(id));
      else cls.product_ids.forEach((id) => next.delete(id));
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
  }

  function clearSimulationState() {
    setResults([]);
    setRunError(null);
    setPriceOverrides({});
  }

  function csvCell(value: string | number) {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    if (!hasResults) return;
    const headers = ["Produto", "SKU", "Custo", ...policies.map((p) => `${p.policy_id} margem%`)];
    const lines = [headers.map(csvCell).join(",")];
    for (const p of filtered) {
      const cells: (string | number)[] = [p.name, p.sku, p.cost_amount.toFixed(2)];
      for (const pol of policies) {
        const item = resultMap[`${p.product_id}::${pol.policy_id}`];
        cells.push(item ? (item.margin_percent * 100).toFixed(1) : "");
      }
      lines.push(cells.map(csvCell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simulacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Summary stats
  const avgMargin = results.length > 0
    ? results.reduce((s, r) => s + r.margin_percent, 0) / results.length : 0;
  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const warningCount = results.filter((r) => r.status === "warning").length;
  const criticalCount = results.filter((r) => r.status !== "healthy" && r.status !== "warning").length;

  return (
    <div className="space-y-4">
      {/* Page header — legacy "Simulador de Margens" pattern */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>
        <div
          aria-label="Simulator stats"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600"
        >
          <span>
            <strong className="text-slate-900">{filtered.length}</strong> produtos ×{" "}
            <strong className="text-slate-900">{policies.length}</strong> marketplaces
          </span>
          {hasResults && (
            <>
              <span className="text-slate-300" aria-hidden>•</span>
              <span>
                Margem média:{" "}
                <strong className={marginColor(avgMargin)}>{(avgMargin * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-300" aria-hidden>•</span>
              <span className="text-emerald-700">
                Saudáveis: <strong>{healthyCount}</strong>
              </span>
              <span className="text-amber-700">
                Atenção: <strong>{warningCount}</strong>
              </span>
              {criticalCount > 0 && (
                <span className="text-red-700">
                  Críticos: <strong>{criticalCount}</strong>
                </span>
              )}
              <button
                type="button"
                onClick={() => setResults([])}
                className="ml-2 text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                Clear Results
              </button>
            </>
          )}
        </div>
      </div>

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
              onClick={() => {
                setPriceSource((v) => (v === "my_price" ? "suggested_price" : "my_price"));
                if (hasResults) clearSimulationState();
              }}
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
      {melhorEnvioConnected !== null && (
        <div className="text-xs text-slate-500">
          Melhor Envios: {melhorEnvioConnected ? "connected" : "disconnected"}
        </div>
      )}
    </div>

      {/* Classification pills (filter — narrows the visible products) */}
      {classifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {classifications.map((cls) => {
            const active = classificationFilter.has(cls.classification_id);
            return (
              <button
                key={cls.classification_id}
                type="button"
                aria-label={`${cls.name} ×${cls.product_count}`}
                aria-pressed={active}
                onClick={() => toggleClassificationFilter(cls.classification_id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                }`}
              >
                {cls.name} <span className="opacity-75">×{cls.product_count}</span>
              </button>
            );
          })}
          {selectedIds.size > 0 && (
            <span className="text-sm text-slate-500 ml-2">{selectedIds.size} selected</span>
          )}
        </div>
      )}

      {/* Filter bar — legacy toolbar pattern */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nome ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={taxonomyFilter}
          onChange={(e) => setTaxonomyFilter(e.target.value)}
          aria-label="Taxonomy filter"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas as classificações</option>
          {taxonomyNodes.map((t) => <option key={t.node_id} value={t.node_id}>{t.name}</option>)}
        </select>
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value as any)}
          aria-label="Health filter"
          disabled={!hasResults}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <option value="all">Todos os status</option>
          <option value="healthy">Saudável (&gt;20%)</option>
          <option value="warning">Atenção (10–20%)</option>
          <option value="critical">Crítico (&lt;10%)</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!hasResults}
          className="px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
        >
          Exportar CSV
        </button>
      </div>

      {/* Product table */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        loading={loadingData}
        renderHeader={() => (
          <tr>
            <th className="px-3 py-3 w-10"></th>
            {/* Pre-sim: separate columns. Post-sim: single compact Produto column */}
            {!hasResults ? (
              <>
                <th className="px-4 py-3 font-medium text-slate-600 text-left">Nome</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-left">SKU</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Custo</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Preço</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Estoque</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 font-medium text-slate-600 text-left w-52">Produto</th>
                {policies.map((pol) => (
                  <th key={pol.policy_id} className="px-4 py-3 font-medium text-slate-600 text-left min-w-[200px]">
                    <div className="text-sm font-semibold text-slate-700">{pol.policy_id}</div>
                    <div className="text-xs font-normal text-slate-400">
                      Base {(pol.commission_percent * 100).toFixed(1)}%{pol.fixed_fee_amount > 0 ? ` + ${fmt(pol.fixed_fee_amount)}` : ""}
                    </div>
                  </th>
                ))}
              </>
            )}
          </tr>
        )}
        renderRow={(p) => {
          const checked = selectedIds.has(p.product_id);
          return (
            <tr
              key={p.product_id}
              className={`border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${checked ? "bg-blue-50/40" : ""}`}
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

              {!hasResults ? (
                <>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.cost_amount)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">{fmt(p.price_amount)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.stock_quantity}</td>
                </>
              ) : (
                <>
                  {/* Compact product cell — legacy "Produto" style */}
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-sm text-slate-900 leading-snug">{p.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{p.sku}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Custo: {fmt(p.cost_amount)}</div>
                  </td>

                  {/* Marketplace result cells — legacy matrix style */}
                  {policies.map((pol) => {
                    const item = resultMap[`${p.product_id}::${pol.policy_id}`];
                    return (
                      <td
                        key={`${p.product_id}::${pol.policy_id}`}
                        className="px-4 py-3 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item ? (
                          <div className="w-[200px]">
                            {/* Price row with margin chip in top-right */}
                            <div className="flex items-baseline justify-between gap-2">
                              <input
                                type="text"
                                defaultValue={`R$ ${item.selling_price.toFixed(2)}`}
                                aria-label={`Selling price ${p.sku} ${pol.policy_id}`}
                                onFocus={(e) => {
                                  e.target.value = item.selling_price.toFixed(2);
                                  e.target.select();
                                }}
                                onBlur={(e) => {
                                  commitOverride(p.product_id, pol.policy_id, e.target.value);
                                  e.target.value = `R$ ${item.selling_price.toFixed(2)}`;
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  if (e.key === "Escape") {
                                    e.currentTarget.value = `R$ ${item.selling_price.toFixed(2)}`;
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="flex-1 min-w-0 text-base font-bold text-slate-900 bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none tabular-nums pb-0.5 cursor-pointer"
                              />
                              <span
                                aria-label={`Final margin status ${(item.margin_percent * 100).toFixed(1)} percent`}
                                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${marginBg(item.margin_percent)} ${marginColor(item.margin_percent)}`}
                              >
                                {(item.margin_percent * 100).toFixed(1)}%
                              </span>
                            </div>

                            {/* Line items */}
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              <div className="flex justify-between gap-2">
                                <span>Custo:</span>
                                <span className="font-mono text-slate-600">{fmt(item.cost_amount)}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span>Comissão ({(pol.commission_percent * 100).toFixed(1)}%):</span>
                                <span className="font-mono text-slate-600">{fmt(item.commission_amount)}</span>
                              </div>
                              {item.fixed_fee_amount > 0 && (
                                <div className="flex justify-between gap-2">
                                  <span>Taxa fixa:</span>
                                  <span className="font-mono text-slate-600">{fmt(item.fixed_fee_amount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-2">
                                <span>Frete:</span>
                                <span className="font-mono text-slate-600">{fmt(item.freight_amount)}</span>
                              </div>
                              <div className={`flex justify-between gap-2 font-semibold ${marginColor(item.margin_percent)}`}>
                                <span>Margem:</span>
                                <span className="font-mono">{fmt(item.margin_amount)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </>
              )}
            </tr>
          );
        }}
        emptyState={<p className="text-sm text-slate-500">No products match your filters.</p>}
      />
    </div>
  );
}

