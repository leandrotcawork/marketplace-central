# UX Redesign — Plan 4: Pricing Simulator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `PricingSimulatorPage` so the policy picker and Run button are always visible at the top; replace the step-based card layout with a unified paginated checkboxes table that shows inline results after simulation; add a summary banner.

**Architecture:** `PricingSimulatorPage` is replaced entirely. The three-step card layout (ProductPicker → policy select → run) is removed. A sticky command bar at the top holds the policy picker, the suggested-price toggle, and the Run button. Below that is a filter bar and a `PaginatedTable` of products with inline checkboxes. After the simulation runs, new columns (Sim. Price, Margin, Status) are added to the same table rows for products that were simulated. A summary row appears above the table showing aggregate metrics. Results persist until the user changes policy or clicks "Clear Results".

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-04-ux-redesign-products-vtex-simulator.md`

**Depends on:** Plan 1 (PaginatedTable must be exported from `packages/ui`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.tsx` | Full rewrite — sticky command bar + unified table |
| Modify | `packages/feature-simulator/src/PricingSimulatorPage.test.tsx` | Replace tests for new structure |

---

### Task 1: Rewrite PricingSimulatorPage

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace `packages/feature-simulator/src/PricingSimulatorPage.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  MarketplacePolicy,
  PricingSimulation,
  RunPricingSimulationRequest,
} from "@marketplace-central/sdk-runtime";

const makeProduct = (i: number): CatalogProduct => ({
  product_id: `p${i}`,
  sku: `SKU-${i}`,
  name: `Product ${i}`,
  description: "",
  brand_name: "Brand X",
  status: "active",
  cost_amount: 10,
  price_amount: 20,
  stock_quantity: 100,
  ean: `EAN${i}`,
  reference: `REF${i}`,
  taxonomy_node_id: "tax1",
  taxonomy_name: "Category A",
  suggested_price: 25,
  height_cm: null,
  width_cm: null,
  length_cm: null,
});

const products: CatalogProduct[] = Array.from({ length: 60 }, (_, i) => makeProduct(i));

const policies: MarketplacePolicy[] = [
  {
    policy_id: "pol1",
    tenant_id: "t1",
    account_id: "acc1",
    commission_percent: 0.16,
    fixed_fee_amount: 0,
    default_shipping: 0,
    tax_percent: 0,
    min_margin_percent: 0.02,
    sla_question_minutes: 60,
    sla_dispatch_hours: 24,
  },
];

const mockSimResult: PricingSimulation = {
  simulation_id: "sim1",
  product_id: "p0",
  account_id: "acc1",
  base_price_amount: 20,
  cost_amount: 10,
  commission_amount: 3.2,
  fixed_fee_amount: 0,
  shipping_amount: 0,
  tax_amount: 0,
  margin_amount: 6.8,
  margin_percent: 0.34,
  status: "healthy",
  created_at: "",
};

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] as TaxonomyNode[] }),
    listClassifications: vi.fn().mockResolvedValue({ items: [] as Classification[] }),
    listMarketplacePolicies: vi.fn().mockResolvedValue({ items: policies }),
    runPricingSimulation: vi.fn().mockResolvedValue(mockSimResult),
    ...overrides,
  };
}

describe("PricingSimulatorPage", () => {
  it("renders policy picker and Run button before table loads", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    // Command bar renders immediately
    expect(screen.getByLabelText(/marketplace policy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeInTheDocument();
  });

  it("renders only 25 products per page (not all 60)", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("Run Simulation is disabled until product + policy selected", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run Simulation enables after selecting product and policy", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Select a policy
    const policySelect = screen.getByLabelText(/marketplace policy/i);
    await waitFor(() => expect(policySelect.querySelector ? policySelect : policySelect).toBeTruthy());
    fireEvent.change(policySelect, { target: { value: "pol1" } });
    // Select product 0
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    expect(screen.getByRole("button", { name: /run simulation/i })).not.toBeDisabled();
  });

  it("calls runPricingSimulation for each selected product", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Wait for policies to load
    await waitFor(() =>
      expect(screen.getByLabelText(/marketplace policy/i).querySelectorAll
        ? true : true
      ).toBe(true)
    );
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() =>
      expect(client.runPricingSimulation).toHaveBeenCalledWith(
        expect.objectContaining({ product_id: "p0", account_id: "acc1" })
      )
    );
  });

  it("shows inline simulation results in table after run", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    // After simulation, margin column appears
    await waitFor(() => expect(screen.getByText(/34\.0%/)).toBeInTheDocument());
  });

  it("shows summary banner after simulation", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getByText(/1 product/i)).toBeInTheDocument());
    // Summary banner should mention avg margin
    expect(screen.getByText(/avg margin/i)).toBeInTheDocument();
  });

  it("clears results when policy changes", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getByText(/34\.0%/)).toBeInTheDocument());
    // Change policy → results cleared
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "" } });
    expect(screen.queryByText(/34\.0%/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx
```

Expected: FAIL — page has step-based layout, no paginated table, no inline results.

- [ ] **Step 3: Rewrite PricingSimulatorPage**

Replace `packages/feature-simulator/src/PricingSimulatorPage.tsx` with:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import { ToggleLeft, ToggleRight } from "lucide-react";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  MarketplacePolicy,
  PricingSimulation,
  RunPricingSimulationRequest,
} from "@marketplace-central/sdk-runtime";

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

/* ── Types ── */

interface SimulationResultRow {
  product: CatalogProduct;
  basePrice: number;
  simulation: PricingSimulation;
}

/* ── Helpers ── */

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${value.toFixed(2)}`;
}

function marginColor(pct: number): string {
  if (pct >= 0.20) return "text-emerald-700";
  if (pct >= 0.10) return "text-amber-700";
  return "text-red-700";
}

function marginBgPill(pct: number): string {
  if (pct >= 0.20) return "bg-emerald-100";
  if (pct >= 0.10) return "bg-amber-100";
  return "bg-red-100";
}

function statusLabel(status: string) {
  if (status === "healthy") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        healthy
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        warning
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      {status}
    </span>
  );
}

/* ── Component ── */

export function PricingSimulatorPage({ client }: PricingSimulatorPageProps) {
  /* Data */
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [useSuggestedPrice, setUseSuggestedPrice] = useState(false);

  /* Filters */
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  /* Simulation */
  const [simulating, setSimulating] = useState(false);
  const [resultsMap, setResultsMap] = useState<Record<string, SimulationResultRow>>({});
  const [simError, setSimError] = useState<string | null>(null);

  /* Load data */
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
        if (!cancelled) setLoadError(err?.error?.message ?? "Failed to load data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [client]);

  /* Derived */
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchesTaxonomy = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      const matchesClassification =
        !classificationFilter ||
        classifications
          .find((c) => c.classification_id === classificationFilter)
          ?.product_ids?.includes(p.product_id) === true;
      return matchesSearch && matchesTaxonomy && matchesClassification;
    });
  }, [products, search, taxonomyFilter, classificationFilter, classifications]);

  const selectedPolicy = policies.find((p) => p.policy_id === selectedPolicyId);
  const hasResults = Object.keys(resultsMap).length > 0;
  const canSimulate = selectedIds.size > 0 && !!selectedPolicyId && !simulating;

  /* Toggle product selection */
  function toggleProduct(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  /* Policy change clears results */
  function handlePolicyChange(policyId: string) {
    setSelectedPolicyId(policyId);
    setResultsMap({});
    setSimError(null);
  }

  /* Run simulation */
  const handleSimulate = useCallback(async () => {
    if (!canSimulate || !selectedPolicy) return;
    setSimulating(true);
    setSimError(null);
    setResultsMap({});

    const newMap: Record<string, SimulationResultRow> = {};
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
          account_id: selectedPolicy.account_id,
          base_price_amount: basePrice,
          cost_amount: product.cost_amount,
          commission_percent: selectedPolicy.commission_percent,
          fixed_fee_amount: selectedPolicy.fixed_fee_amount,
          shipping_amount: selectedPolicy.default_shipping,
          min_margin_percent: selectedPolicy.min_margin_percent,
        };
        const sim = await client.runPricingSimulation(req);
        newMap[productId] = { product, basePrice, simulation: sim };
      }
      setResultsMap(newMap);
    } catch (err: any) {
      setSimError(err?.error?.message ?? "Simulation failed. Please try again.");
    } finally {
      setSimulating(false);
    }
  }, [canSimulate, selectedPolicy, selectedIds, products, useSuggestedPrice, client]);

  /* Summary stats */
  const resultRows = Object.values(resultsMap);
  const avgMargin =
    resultRows.length > 0
      ? resultRows.reduce((sum, r) => sum + r.simulation.margin_percent, 0) / resultRows.length
      : 0;
  const healthyCount = resultRows.filter((r) => r.simulation.status === "healthy").length;
  const warningCount = resultRows.filter((r) => r.simulation.status === "warning").length;
  const criticalCount = resultRows.filter(
    (r) => r.simulation.status !== "healthy" && r.simulation.status !== "warning"
  ).length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Command bar — always at top */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px] space-y-1">
            <label htmlFor="policy-select" className="block text-xs font-medium text-slate-700">
              Marketplace Policy
            </label>
            <select
              id="policy-select"
              aria-label="Marketplace policy"
              value={selectedPolicyId}
              onChange={(e) => handlePolicyChange(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a policy…</option>
              {policies.map((p) => (
                <option key={p.policy_id} value={p.policy_id}>
                  {p.policy_id} — commission {(p.commission_percent * 100).toFixed(1)}%, min margin {(p.min_margin_percent * 100).toFixed(1)}%
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-4">
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
          </div>
          <div className="ml-auto mt-4">
            <Button
              variant="primary"
              onClick={handleSimulate}
              loading={simulating}
              disabled={!canSimulate}
            >
              ▶ Run Simulation
            </Button>
          </div>
        </div>
        {selectedPolicy && (
          <p className="text-xs text-slate-500 flex flex-wrap gap-3">
            <span>Commission {(selectedPolicy.commission_percent * 100).toFixed(1)}%</span>
            <span>Fixed {formatCurrency(selectedPolicy.fixed_fee_amount)}</span>
            <span>Ship {formatCurrency(selectedPolicy.default_shipping)}</span>
            <span>Min margin {(selectedPolicy.min_margin_percent * 100).toFixed(1)}%</span>
          </p>
        )}
        {simError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {simError}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search products…"
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
          {taxonomyNodes.map((t) => (
            <option key={t.node_id} value={t.node_id}>{t.name}</option>
          ))}
        </select>
        <select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value)}
          aria-label="Classification filter"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Classifications</option>
          {classifications.map((c) => (
            <option key={c.classification_id} value={c.classification_id}>
              {c.name} ({c.product_count})
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : ""}
        </span>
      </div>

      {/* Summary banner — shown after simulation */}
      {hasResults && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap gap-6 items-center text-sm">
          <span className="font-medium text-slate-700">
            Simulation: {resultRows.length} product{resultRows.length !== 1 ? "s" : ""} · Avg margin{" "}
            <span className={marginColor(avgMargin)}>
              {(avgMargin * 100).toFixed(1)}%
            </span>
          </span>
          <span className="text-emerald-700">✓ Healthy: {healthyCount}</span>
          <span className="text-amber-700">⚠ Warning: {warningCount}</span>
          {criticalCount > 0 && <span className="text-red-700">✗ Critical: {criticalCount}</span>}
          <button
            onClick={() => setResultsMap({})}
            className="ml-auto text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Clear Results
          </button>
        </div>
      )}

      {/* Product table — columns expand with results after simulation */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        loading={loadingData}
        renderHeader={() => (
          <tr>
            <th className="px-3 py-3 w-10"></th>
            <th className="px-4 py-3 font-medium text-slate-600">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            {hasResults && (
              <>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Sim. Price</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Margin</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-center">Status</th>
              </>
            )}
            {!hasResults && (
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>
            )}
          </tr>
        )}
        renderRow={(p) => {
          const checked = selectedIds.has(p.product_id);
          const result = resultsMap[p.product_id];
          return (
            <tr
              key={p.product_id}
              className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                checked ? "bg-blue-50/30" : ""
              }`}
              onClick={() => toggleProduct(p.product_id)}
            >
              <td className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`Select ${p.name}`}
                  onChange={() => toggleProduct(p.product_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                {formatCurrency(p.cost_amount)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                {formatCurrency(p.price_amount)}
              </td>
              {hasResults && result && (
                <>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                    {formatCurrency(result.basePrice)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${marginBgPill(result.simulation.margin_percent)} ${marginColor(result.simulation.margin_percent)}`}
                    >
                      {(result.simulation.margin_percent * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {statusLabel(result.simulation.status)}
                  </td>
                </>
              )}
              {hasResults && !result && (
                <>
                  <td className="px-4 py-3 text-right text-slate-300 text-xs">—</td>
                  <td className="px-4 py-3 text-right text-slate-300 text-xs">—</td>
                  <td className="px-4 py-3 text-center text-slate-300 text-xs">—</td>
                </>
              )}
              {!hasResults && (
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                  {p.stock_quantity}
                </td>
              )}
            </tr>
          );
        }}
        emptyState={<p>No products match your filters.</p>}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/feature-simulator/src/PricingSimulatorPage.test.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Run full simulator package tests**

```bash
npx vitest run packages/feature-simulator/
```

Expected: All tests PASS.

- [ ] **Step 6: Build to verify TypeScript**

```bash
npm run build --workspace=packages/feature-simulator
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/feature-simulator/src/PricingSimulatorPage.tsx packages/feature-simulator/src/PricingSimulatorPage.test.tsx
git commit -m "feat(simulator): sticky command bar + paginated table + inline simulation results"
```
