# UX Redesign — Plan 3: VTEX Publisher

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `VTEXPublishPage` so the config bar and Publish button are always visible at the top; replace `ProductPicker` with a paginated checkboxes table; add a "Load Classification" shortcut that auto-selects all products in a classification across all pages.

**Architecture:** `VTEXPublishPage` is replaced entirely. The `ProductPicker` component is removed. A new inline paginated table (using `PaginatedTable` from `@marketplace-central/ui`) replaces the picker. The VTEX configuration fields (account, trade policy, warehouse) and the Publish button move to a sticky bar at the top. "Load Classification" is a select that, when changed, merges that classification's product IDs into the current selection without filtering the table. Selected state (checkedIds) persists across page navigation. "Select All Filtered" selects the entire filtered result set across all pages, not just the visible 25.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-04-ux-redesign-products-vtex-simulator.md`

**Depends on:** Plan 1 (PaginatedTable must be exported from `packages/ui`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/feature-connectors/src/VTEXPublishPage.tsx` | Full rewrite — sticky config + paginated table |
| Modify | `packages/feature-connectors/src/VTEXPublishPage.test.tsx` | Replace tests for new structure |

---

### Task 1: Rewrite VTEXPublishPage

**Files:**
- Modify: `packages/feature-connectors/src/VTEXPublishPage.tsx`
- Modify: `packages/feature-connectors/src/VTEXPublishPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace `packages/feature-connectors/src/VTEXPublishPage.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VTEXPublishPage } from "./VTEXPublishPage";
import type { CatalogProduct, TaxonomyNode, Classification, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

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
  suggested_price: null,
  height_cm: null,
  width_cm: null,
  length_cm: null,
});

const products: CatalogProduct[] = Array.from({ length: 60 }, (_, i) => makeProduct(i));

const classifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "",
    product_ids: ["p0", "p1", "p2"],
    product_count: 3,
    created_at: "",
    updated_at: "",
  },
];

const batchResponse: PublishBatchResponse = {
  batch_id: "batch_abc",
  validated: 3,
  rejected: 0,
  rejections: [],
};

function makeClient(overrides = {}) {
  return {
    publishToVTEX: vi.fn().mockResolvedValue(batchResponse),
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] as TaxonomyNode[] }),
    listClassifications: vi.fn().mockResolvedValue({ items: classifications }),
    ...overrides,
  };
}

function renderPage(client = makeClient()) {
  return render(
    <MemoryRouter>
      <VTEXPublishPage client={client} />
    </MemoryRouter>
  );
}

describe("VTEXPublishPage", () => {
  it("shows VTEX account field at top before table loads", async () => {
    const client = makeClient();
    renderPage(client);
    // Config bar must be rendered immediately, not after products load
    expect(screen.getByLabelText(/vtex account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("renders only 25 products per page", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("publish button is disabled when no account entered", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });

  it("publish button is disabled when no products selected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });

  it("selecting a product row checkbox enables publish when account is set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    expect(screen.getByRole("button", { name: /publish/i })).not.toBeDisabled();
  });

  it("Load Classification auto-checks all products in classification", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Select "VTEX Ready" from the Load Classification dropdown
    fireEvent.change(screen.getByLabelText(/load classification/i), { target: { value: "cls1" } });
    // 3 products should now show as selected
    await waitFor(() =>
      expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
    );
  });

  it("Select All Filtered selects all filtered products including off-page", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() =>
      expect(screen.getByText(/60 selected/i)).toBeInTheDocument()
    );
  });

  it("Clear All deselects all products", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() => expect(screen.getByText(/60 selected/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.queryByText(/60 selected/i)).not.toBeInTheDocument();
  });

  it("calls publishToVTEX with selected products", async () => {
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await waitFor(() =>
      expect(client.publishToVTEX).toHaveBeenCalledWith(
        expect.objectContaining({
          vtex_account: "mystore",
          products: expect.arrayContaining([expect.objectContaining({ product_id: "p0" })]),
        })
      )
    );
  });

  it("shows success banner after publish", async () => {
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await waitFor(() =>
      expect(screen.getByText(/batch created/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx vitest run packages/feature-connectors/src/VTEXPublishPage.test.tsx
```

Expected: FAIL — page has no sticky config, no per-row checkboxes, no Load Classification.

- [ ] **Step 3: Rewrite VTEXPublishPage**

Replace `packages/feature-connectors/src/VTEXPublishPage.tsx` with:

```tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  VTEXProduct,
  PublishBatchRequest,
  PublishBatchResponse,
} from "@marketplace-central/sdk-runtime";

interface PublishClient {
  publishToVTEX: (req: PublishBatchRequest) => Promise<PublishBatchResponse>;
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
}

interface VTEXPublishPageProps {
  client: PublishClient;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${value.toFixed(2)}`;
}

export function VTEXPublishPage({ client }: VTEXPublishPageProps) {
  const navigate = useNavigate();

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);

  // Config state
  const [vtexAccount, setVtexAccount] = useState("");
  const [tradePolicyId, setTradePolicyId] = useState("1");
  const [warehouseId, setWarehouseId] = useState("1_1");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [loadClassificationId, setLoadClassificationId] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublishBatchResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [prodRes, taxRes, clsRes] = await Promise.all([
          client.listCatalogProducts(),
          client.listTaxonomyNodes(),
          client.listClassifications(),
        ]);
        if (!cancelled) {
          setProducts(prodRes.items);
          setTaxonomyNodes(taxRes.items);
          setClassifications(clsRes.items);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [client]);

  // Filtered product list
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q);
      const matchesTaxonomy = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      return matchesSearch && matchesTaxonomy;
    });
  }, [products, search, taxonomyFilter]);

  // Load classification: union-adds all its product_ids into selectedIds
  function handleLoadClassification(classificationId: string) {
    setLoadClassificationId(classificationId);
    if (!classificationId) return;
    const cls = classifications.find((c) => c.classification_id === classificationId);
    if (!cls) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      cls.product_ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function handleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.product_id));
      return next;
    });
  }

  function handleClearAll() {
    setSelectedIds(new Set());
  }

  function toggleProduct(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  async function handlePublish() {
    if (!vtexAccount.trim() || selectedIds.size === 0) return;

    const selectedProducts = products.filter((p) => selectedIds.has(p.product_id));
    const vtexProducts: VTEXProduct[] = selectedProducts.map((p) => ({
      product_id: p.product_id,
      name: p.name,
      description: p.description || "",
      sku_name: p.name,
      ean: p.ean || "",
      category: p.taxonomy_name || "",
      brand: p.brand_name || "",
      cost: p.cost_amount,
      base_price: p.price_amount,
      image_urls: [],
      specs: {},
      stock_qty: p.stock_quantity,
      warehouse_id: warehouseId,
      trade_policy_id: tradePolicyId,
    }));

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await client.publishToVTEX({
        vtex_account: vtexAccount.trim(),
        products: vtexProducts,
      });
      setResult(res);
      setTimeout(
        () => navigate(`/connectors/vtex/batch/${res.batch_id}`, { state: { products: vtexProducts } }),
        2000,
      );
    } catch (err: any) {
      setApiError(err?.error?.message ?? "Failed to start batch. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canPublish = !!vtexAccount.trim() && selectedIds.size > 0 && !submitting;
  const selectedCount = selectedIds.size;

  // Success banner replaces page content after publish
  if (result) {
    return (
      <div className="space-y-6 max-w-3xl">
        <h2 className="text-xl font-semibold text-slate-900">VTEX Publisher</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Batch created successfully</p>
          <p className="text-xs text-emerald-700 font-mono">{result.batch_id}</p>
          <p className="text-xs text-emerald-700">
            {result.validated} validated · {result.rejected} rejected
          </p>
          {result.rejections.map((r) => (
            <p key={r.product_id} className="text-xs text-red-700">
              {r.product_id}: {r.error_code}
            </p>
          ))}
          <p className="text-xs text-emerald-600 mt-1">Redirecting to batch status…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">VTEX Publisher</h2>

      {/* Config bar — always at top */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1 min-w-[160px]">
            <label htmlFor="vtex_account" className="block text-xs font-medium text-slate-700">
              VTEX Account<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="vtex_account"
              type="text"
              placeholder="mystore"
              value={vtexAccount}
              onChange={(e) => setVtexAccount(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="trade_policy_id" className="block text-xs font-medium text-slate-700">
              Policy
            </label>
            <input
              id="trade_policy_id"
              type="text"
              placeholder="1"
              value={tradePolicyId}
              onChange={(e) => setTradePolicyId(e.target.value)}
              className="w-24 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="warehouse_id" className="block text-xs font-medium text-slate-700">
              Warehouse
            </label>
            <input
              id="warehouse_id"
              type="text"
              placeholder="1_1"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-28 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="ml-auto">
            {!vtexAccount.trim() && (
              <p className="text-xs text-amber-600 mb-1">Account required</p>
            )}
            <Button
              variant="primary"
              loading={submitting}
              disabled={!canPublish}
              onClick={handlePublish}
            >
              {selectedCount > 0
                ? `Publish ${selectedCount} product${selectedCount !== 1 ? "s" : ""} →`
                : "Publish →"}
            </Button>
          </div>
        </div>
        {apiError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}
      </div>

      {/* Selection bar */}
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
          value={loadClassificationId}
          onChange={(e) => handleLoadClassification(e.target.value)}
          aria-label="Load classification"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Load Classification…</option>
          {classifications.map((c) => (
            <option key={c.classification_id} value={c.classification_id}>
              {c.name} ({c.product_count})
            </option>
          ))}
        </select>
      </div>

      {/* Selection count + bulk actions */}
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>{selectedCount > 0 ? `${selectedCount} selected` : "No products selected"}</span>
        <button
          onClick={handleSelectAllFiltered}
          aria-label="Select all filtered"
          className="text-blue-600 hover:text-blue-800 text-xs cursor-pointer"
        >
          Select All Filtered
        </button>
        {selectedCount > 0 && (
          <button
            onClick={handleClearAll}
            aria-label="Clear all"
            className="text-slate-500 hover:text-slate-700 text-xs cursor-pointer"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Paginated product table */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        loading={loading}
        renderHeader={() => (
          <tr>
            <th className="px-3 py-3 w-10"></th>
            <th className="px-4 py-3 font-medium text-slate-600">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600">Brand</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>
          </tr>
        )}
        renderRow={(p) => {
          const checked = selectedIds.has(p.product_id);
          return (
            <tr
              key={p.product_id}
              className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                checked ? "bg-blue-50/40" : ""
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
              <td className="px-4 py-3 text-slate-600">{p.brand_name}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                {formatCurrency(p.cost_amount)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                {formatCurrency(p.price_amount)}
              </td>
              <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.stock_quantity}</td>
            </tr>
          );
        }}
        emptyState={<p>No products found.</p>}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/feature-connectors/src/VTEXPublishPage.test.tsx
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Run full connectors package tests**

```bash
npx vitest run packages/feature-connectors/
```

Expected: All tests PASS (VTEXPublishPage × 9, BatchDetailPage tests unaffected).

- [ ] **Step 6: Build to verify TypeScript**

```bash
npm run build --workspace=packages/feature-connectors
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/feature-connectors/src/VTEXPublishPage.tsx packages/feature-connectors/src/VTEXPublishPage.test.tsx
git commit -m "feat(vtex-publisher): sticky config bar + paginated table + load-classification shortcut"
```
