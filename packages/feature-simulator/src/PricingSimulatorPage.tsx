import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import { ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import type {
  BatchSimulationItem,
  BatchSimulationRequest,
  CatalogProduct,
  Classification,
  MarketplacePolicy,
  TaxonomyNode,
} from "@marketplace-central/sdk-runtime";

export interface SimulatorClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  runBatchSimulation: (req: BatchSimulationRequest) => Promise<{ items: BatchSimulationItem[] }>;
  getMelhorEnvioStatus: () => Promise<{ connected: boolean }>;
}

interface PricingSimulatorPageProps {
  client: SimulatorClient;
}

type HealthFilter = "all" | "healthy" | "warning" | "critical";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${value.toFixed(2)}`;
}

function marginColor(pct: number): string {
  if (pct >= 0.2) return "text-emerald-700";
  if (pct >= 0.1) return "text-amber-700";
  return "text-red-700";
}

function marginBgPill(pct: number): string {
  if (pct >= 0.2) return "bg-emerald-100";
  if (pct >= 0.1) return "bg-amber-100";
  return "bg-red-100";
}

function resolveErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const maybeError = err as { error?: { message?: string }; message?: string };
    if (maybeError.error?.message) return maybeError.error.message;
    if (maybeError.message) return maybeError.message;
  }
  return fallback;
}

function cepDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isExpandedPolicyHeader(item: BatchSimulationItem | undefined): item is BatchSimulationItem {
  return Boolean(item);
}

export function PricingSimulatorPage({ client }: PricingSimulatorPageProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meConnected, setMeConnected] = useState<boolean | null>(null);

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
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [prodRes, clsRes, polRes, taxRes, meStatus] = await Promise.all([
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
        setMeConnected(meStatus.connected);
      } catch (err) {
        if (!cancelled) {
          setLoadError("Failed to load data.");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const resultMap = useMemo(() => {
    const map: Record<string, BatchSimulationItem> = {};
    for (const item of results) {
      map[`${item.product_id}::${item.policy_id}`] = item;
    }
    return map;
  }, [results]);

  const hasResults = results.length > 0;

  const filteredProducts = useMemo(() => {
    let next = products.filter((product) => {
      const query = search.trim().toLowerCase();
      const matchSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);
      const matchTaxonomy = !taxonomyFilter || product.taxonomy_node_id === taxonomyFilter;
      return matchSearch && matchTaxonomy;
    });

    if (hasResults && healthFilter !== "all") {
      next = next.filter((product) => {
        const statuses = policies
          .map((policy) => resultMap[`${product.product_id}::${policy.policy_id}`]?.status)
          .filter(Boolean);

        if (healthFilter === "healthy") return statuses.some((status) => status === "healthy");
        if (healthFilter === "warning") return statuses.some((status) => status === "warning");
        return statuses.some((status) => status !== "healthy" && status !== "warning");
      });
    }

    return next;
  }, [products, search, taxonomyFilter, hasResults, healthFilter, policies, resultMap]);

  const canRun =
    selectedIds.size > 0 &&
    cepDigits(originCep).length >= 8 &&
    cepDigits(destinationCep).length >= 8 &&
    !running;

  function toggleProduct(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleClassification(classification: Classification) {
    const ids = classification.product_ids ?? [];
    const allClassSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allClassSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleExpand(policyId: string) {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });
  }

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setRunError(null);
    setResults([]);

    try {
      const response = await client.runBatchSimulation({
        product_ids: Array.from(selectedIds),
        policy_ids: policies.map((policy) => policy.policy_id),
        origin_cep: cepDigits(originCep),
        destination_cep: cepDigits(destinationCep),
        price_source: priceSource,
        price_overrides: priceOverrides,
      });
      setResults(response.items);
    } catch (err) {
      setRunError(resolveErrorMessage(err, "Simulation failed."));
    } finally {
      setRunning(false);
    }
  }, [canRun, client, destinationCep, originCep, policies, priceOverrides, priceSource, selectedIds]);

  const avgMargin =
    results.length > 0 ? results.reduce((sum, item) => sum + item.margin_percent, 0) / results.length : 0;
  const healthyCount = results.filter((item) => item.status === "healthy").length;
  const warningCount = results.filter((item) => item.status === "warning").length;
  const criticalCount = results.filter(
    (item) => item.status !== "healthy" && item.status !== "warning"
  ).length;

  function commitOverride(productId: string, policyId: string, raw: string) {
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const overrideKey = `${productId}::${policyId}`;
    setPriceOverrides((prev) => ({ ...prev, [overrideKey]: parsed }));

    setResults((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId || item.policy_id !== policyId) return item;
        const policy = policies.find((current) => current.policy_id === policyId);
        if (!policy) return item;

        const commissionAmount = parsed * policy.commission_percent;
        const marginAmount =
          parsed - item.cost_amount - commissionAmount - item.fixed_fee_amount - item.freight_amount;
        const marginPercent = parsed > 0 ? marginAmount / parsed : 0;
        const status = marginPercent >= policy.min_margin_percent ? "healthy" : "warning";

        return {
          ...item,
          selling_price: parsed,
          commission_amount: commissionAmount,
          margin_amount: marginAmount,
          margin_percent: marginPercent,
          status,
        };
      })
    );
  }

  const displayPolicies = policies;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="origin-cep" className="block text-xs font-medium text-slate-700">
              Origin CEP
            </label>
            <input
              id="origin-cep"
              aria-label="Origin CEP"
              value={originCep}
              onChange={(event) => setOriginCep(event.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="destination-cep" className="block text-xs font-medium text-slate-700">
              Destination CEP
            </label>
            <input
              id="destination-cep"
              aria-label="Destination CEP"
              value={destinationCep}
              onChange={(event) => setDestinationCep(event.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <button
              type="button"
              onClick={() =>
                setPriceSource((value) => (value === "my_price" ? "suggested_price" : "my_price"))
              }
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
              aria-label="Toggle price source"
            >
              {priceSource === "suggested_price" ? (
                <ToggleRight className="h-5 w-5 text-blue-600" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-slate-400" />
              )}
              {priceSource === "suggested_price" ? "Using suggested price" : "Using my price"}
            </button>
          </div>
          <div className="ml-auto pb-0.5">
            <Button variant="primary" onClick={handleRun} loading={running} disabled={!canRun}>
              Run Simulation
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Melhor Envio: {meConnected === null ? "checking" : meConnected ? "connected" : "disconnected"}</span>
          <span>Origin {cepDigits(originCep).length}/8</span>
          <span>Destination {cepDigits(destinationCep).length}/8</span>
        </div>

        {runError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {runError}
          </div>
        )}
      </div>

      {classifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {classifications.map((classification) => {
            const ids = classification.product_ids ?? [];
            const selected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
            return (
              <button
                key={classification.classification_id}
                type="button"
                aria-label={classification.name}
                onClick={() => toggleClassification(classification)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors cursor-pointer ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
                }`}
              >
                {classification.name} <span className="opacity-75">x{classification.product_count}</span>
              </button>
            );
          })}
          {selectedIds.size > 0 && <span className="ml-2 text-sm text-slate-500">{selectedIds.size} selected</span>}
        </div>
      )}

      {hasResults && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm">
          <span className="font-medium text-slate-700">
            Avg margin <span className={marginColor(avgMargin)}>{(avgMargin * 100).toFixed(1)}%</span>
          </span>
          <span className="text-emerald-700">Healthy: {healthyCount}</span>
          <span className="text-amber-700">Warning: {warningCount}</span>
          {criticalCount > 0 && <span className="text-red-700">Critical: {criticalCount}</span>}
          <button
            type="button"
            onClick={() => setResults([])}
            className="ml-auto cursor-pointer text-xs text-slate-500 hover:text-slate-700"
          >
            Clear Results
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={taxonomyFilter}
          onChange={(event) => setTaxonomyFilter(event.target.value)}
          aria-label="Taxonomy filter"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Taxonomy</option>
          {taxonomyNodes.map((taxonomy) => (
            <option key={taxonomy.node_id} value={taxonomy.node_id}>
              {taxonomy.name}
            </option>
          ))}
        </select>
        {hasResults && (
          <select
            value={healthFilter}
            onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}
            aria-label="Health filter"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Health</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        )}
      </div>

      <PaginatedTable
        items={filteredProducts}
        pageSize={25}
        loading={loadingData}
        renderHeader={() => (
          <tr>
            <th className="w-10 px-3 py-3" />
            <th className="px-4 py-3 font-medium text-slate-600 text-left">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-left">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            {!hasResults && <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>}
            {hasResults &&
              displayPolicies.flatMap((policy) => {
                const isExpanded = expandedPolicies.has(policy.policy_id);
                if (isExpanded) {
                  return [
                    <th
                      key={`${policy.policy_id}_sell`}
                      className="px-3 py-3 text-right text-xs font-medium text-slate-600"
                    >
                      Sell Price
                    </th>,
                    <th
                      key={`${policy.policy_id}_commission`}
                      className="px-3 py-3 text-right text-xs font-medium text-slate-600"
                    >
                      Commission
                    </th>,
                    <th
                      key={`${policy.policy_id}_freight`}
                      className="px-3 py-3 text-right text-xs font-medium text-slate-600"
                    >
                      Freight
                    </th>,
                    <th
                      key={`${policy.policy_id}_fee`}
                      className="px-3 py-3 text-right text-xs font-medium text-slate-600"
                    >
                      Fixed Fee
                    </th>,
                    <th
                      key={`${policy.policy_id}_margin`}
                      className="px-3 py-3 text-right text-xs font-medium text-slate-600"
                    >
                      <button
                        type="button"
                        aria-label={`Expand ${policy.policy_id}`}
                        onClick={() => toggleExpand(policy.policy_id)}
                        className="flex cursor-pointer items-center gap-1 font-semibold text-blue-700"
                      >
                        {policy.policy_id} <ChevronDown className="h-3 w-3" />
                      </button>
                      Margin
                    </th>,
                  ];
                }

                return [
                  <th key={policy.policy_id} className="px-4 py-3 text-right text-xs font-medium text-slate-600">
                    <button
                      type="button"
                      aria-label={`Expand ${policy.policy_id}`}
                      onClick={() => toggleExpand(policy.policy_id)}
                      className="flex cursor-pointer items-center gap-1 text-slate-700 hover:text-blue-600"
                    >
                      {policy.policy_id} <ChevronRight className="h-3 w-3" />
                    </button>
                  </th>,
                ];
              })}
          </tr>
        )}
        renderRow={(product) => {
          const checked = selectedIds.has(product.product_id);

          return (
            <tr
              key={product.product_id}
              className={`cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50 ${
                checked ? "bg-blue-50/30" : ""
              }`}
              onClick={() => toggleProduct(product.product_id)}
            >
              <td className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`Select product ${product.sku}`}
                  onChange={() => toggleProduct(product.product_id)}
                  onClick={(event) => event.stopPropagation()}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.sku}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                {formatCurrency(product.cost_amount)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                {formatCurrency(product.price_amount)}
              </td>
              {!hasResults && (
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{product.stock_quantity}</td>
              )}
              {hasResults &&
                displayPolicies.flatMap((policy) => {
                  const item = resultMap[`${product.product_id}::${policy.policy_id}`];
                  const isExpanded = expandedPolicies.has(policy.policy_id);

                  if (isExpanded) {
                    return [
                      <td
                        key={`${product.product_id}::${policy.policy_id}_sell`}
                        className="px-3 py-2 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item ? (
                          <input
                            type="text"
                            defaultValue={item.selling_price.toFixed(2)}
                            aria-label={`Selling price ${product.sku} ${policy.policy_id}`}
                            onBlur={(event) => commitOverride(product.product_id, policy.policy_id, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") {
                                event.currentTarget.value = item.selling_price.toFixed(2);
                              }
                            }}
                            className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>,
                      <td
                        key={`${product.product_id}::${policy.policy_id}_commission`}
                        className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600"
                      >
                        {item ? formatCurrency(item.commission_amount) : <span className="text-slate-300">—</span>}
                      </td>,
                      <td
                        key={`${product.product_id}::${policy.policy_id}_freight`}
                        className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600"
                      >
                        {item ? <span title={item.freight_source}>{formatCurrency(item.freight_amount)}</span> : <span className="text-slate-300">—</span>}
                      </td>,
                      <td
                        key={`${product.product_id}::${policy.policy_id}_fee`}
                        className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600"
                      >
                        {item ? formatCurrency(item.fixed_fee_amount) : <span className="text-slate-300">—</span>}
                      </td>,
                      <td key={`${product.product_id}::${policy.policy_id}_margin`} className="px-3 py-2 text-right">
                        {item ? (
                          <span
                            className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-bold ${marginBgPill(
                              item.margin_percent
                            )} ${marginColor(item.margin_percent)}`}
                          >
                            {(item.margin_percent * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>,
                    ];
                  }

                  return [
                    <td key={`${product.product_id}::${policy.policy_id}_col`} className="px-4 py-2 text-right">
                      {item ? (
                        <span
                          className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-bold ${marginBgPill(
                            item.margin_percent
                          )} ${marginColor(item.margin_percent)}`}
                        >
                          {(item.margin_percent * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>,
                  ];
                })}
            </tr>
          );
        }}
        emptyState={
          loadingData ? (
            <p className="text-sm text-slate-500">Loading products...</p>
          ) : (
            <p className="text-sm text-slate-500">No products match your filters.</p>
          )
        }
      />
    </div>
  );
}
