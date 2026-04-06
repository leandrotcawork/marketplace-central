# UX Redesign — Plan 2: Products Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `ProductsPage` to use `PaginatedTable` for performance and `DetailPanel` for editing, replacing the centered modal; add classification management in the panel.

**Architecture:** `ProductsPage` is replaced entirely. The modal is deleted; clicking ✏ opens a `DetailPanel` from the right. Classification checkboxes in the panel auto-save on change. The "+ Create new classification" mini-form creates a new classification and immediately marks the current product as a member. `PaginatedTable` and `DetailPanel` are imported from `@marketplace-central/ui` (built in Plan 1). The `ProductsClient` interface gains two new methods: `createClassification` and `updateClassification`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-04-ux-redesign-products-vtex-simulator.md`

**Depends on:** Plan 1 (PaginatedTable and DetailPanel must be exported from `packages/ui` before this plan runs)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/feature-products/src/ProductsPage.tsx` | Full rewrite — pagination + panel |
| Modify | `packages/feature-products/src/ProductsPage.test.tsx` | Replace tests for new structure |

---

### Task 1: Rewrite ProductsPage

**Files:**
- Modify: `packages/feature-products/src/ProductsPage.tsx`
- Modify: `packages/feature-products/src/ProductsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace `packages/feature-products/src/ProductsPage.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductsPage } from "./ProductsPage";
import type { CatalogProduct, TaxonomyNode, Classification } from "@marketplace-central/sdk-runtime";

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

const taxonomyNodes: TaxonomyNode[] = [
  { node_id: "tax1", name: "Category A", level: 1, level_label: "L1", parent_node_id: "", is_active: true, product_count: 60 },
];

const classifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "",
    product_ids: ["p0", "p1"],
    product_count: 2,
    created_at: "",
    updated_at: "",
  },
];

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: taxonomyNodes }),
    listClassifications: vi.fn().mockResolvedValue({ items: classifications }),
    updateProductEnrichment: vi.fn().mockResolvedValue({}),
    createClassification: vi.fn().mockResolvedValue({
      classification_id: "cls2",
      name: "New Class",
      ai_context: "",
      product_ids: ["p0"],
      product_count: 1,
      created_at: "",
      updated_at: "",
    }),
    updateClassification: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("ProductsPage", () => {
  it("shows loading state then renders 25 rows", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("does not render all 60 products at once", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Only 25 rows on page 1
    expect(screen.queryByText("Product 59")).not.toBeInTheDocument();
  });

  it("opens detail panel when edit button clicked", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    expect(screen.getByText("VTEX Ready")).toBeInTheDocument(); // classification checkbox
  });

  it("closes detail panel on Escape", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("VTEX Ready")).not.toBeInTheDocument();
  });

  it("auto-saves classification membership when checkbox toggled", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Product 0 is already in cls1 (VTEX Ready) — uncheck it
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    const vtexReadyCheckbox = await screen.findByRole("checkbox", { name: /vtex ready/i });
    fireEvent.click(vtexReadyCheckbox);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.not.arrayContaining(["p0"]),
      }))
    );
  });

  it("saves enrichment fields on Save click", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    const heightInput = await screen.findByLabelText(/height/i);
    fireEvent.change(heightInput, { target: { value: "10.5" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(client.updateProductEnrichment).toHaveBeenCalledWith(
        "p0",
        expect.objectContaining({ height_cm: 10.5 })
      )
    );
  });

  it("shows create classification form when link clicked", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create new classification/i }));
    expect(screen.getByLabelText(/classification name/i)).toBeInTheDocument();
  });

  it("calls createClassification and adds product to new classification", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create new classification/i }));
    fireEvent.change(screen.getByLabelText(/classification name/i), {
      target: { value: "New Class" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(client.createClassification).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Class", product_ids: ["p0"] })
      )
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx vitest run packages/feature-products/src/ProductsPage.test.tsx
```

Expected: FAIL — most tests fail because the page has no pagination and no `DetailPanel`.

- [ ] **Step 3: Rewrite ProductsPage**

Replace `packages/feature-products/src/ProductsPage.tsx` with:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button, PaginatedTable, DetailPanel } from "@marketplace-central/ui";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  ProductEnrichment,
  CreateClassificationRequest,
  UpdateClassificationRequest,
} from "@marketplace-central/sdk-runtime";

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

interface ProductsClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  updateProductEnrichment: (
    productId: string,
    data: Partial<ProductEnrichment>,
  ) => Promise<ProductEnrichment>;
  createClassification: (req: CreateClassificationRequest) => Promise<Classification>;
  updateClassification: (id: string, req: UpdateClassificationRequest) => Promise<Classification>;
}

interface ProductsPageProps {
  client: ProductsClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichmentForm {
  height_cm: string;
  width_cm: string;
  length_cm: string;
  suggested_price: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEnrichmentForm(p: CatalogProduct): EnrichmentForm {
  return {
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    width_cm: p.width_cm != null ? String(p.width_cm) : "",
    length_cm: p.length_cm != null ? String(p.length_cm) : "",
    suggested_price: p.suggested_price != null ? String(p.suggested_price) : "",
  };
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${value.toFixed(2)}`;
}

function formatDimensions(p: CatalogProduct): string {
  const h = p.height_cm;
  const w = p.width_cm;
  const l = p.length_cm;
  if (h == null && w == null && l == null) return "—";
  return `${h ?? "—"} × ${w ?? "—"} × ${l ?? "—"} cm`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductsPage({ client }: ProductsPageProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  // Detail panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [enrichForm, setEnrichForm] = useState<EnrichmentForm>({
    height_cm: "", width_cm: "", length_cm: "", suggested_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  // Classification auto-save
  const [classAutoSaving, setClassAutoSaving] = useState<Record<string, boolean>>({});

  // New classification form (inline in panel)
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassContext, setNewClassContext] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, taxRes, classRes] = await Promise.all([
        client.listCatalogProducts(),
        client.listTaxonomyNodes(),
        client.listClassifications(),
      ]);
      setProducts(prodRes.items);
      setTaxonomyNodes(taxRes.items);
      setClassifications(classRes.items);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load products. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Client-side filtering
  // -----------------------------------------------------------------------

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.ean.toLowerCase().includes(q) ||
      p.brand_name.toLowerCase().includes(q);
    const matchesTaxonomy = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
    const matchesClassification =
      !classificationFilter ||
      classifications
        .find((c) => c.classification_id === classificationFilter)
        ?.product_ids?.includes(p.product_id) === true;
    return matchesSearch && matchesTaxonomy && matchesClassification;
  });

  // -----------------------------------------------------------------------
  // Panel open/close
  // -----------------------------------------------------------------------

  function openPanel(p: CatalogProduct) {
    setEditingProduct(p);
    setEnrichForm(toEnrichmentForm(p));
    setSaveError(null);
    setSavedOk(false);
    setShowNewClassForm(false);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingProduct(null);
    setSaveError(null);
    setSavedOk(false);
    setShowNewClassForm(false);
    setNewClassName("");
    setNewClassContext("");
  }

  // -----------------------------------------------------------------------
  // Enrichment save
  // -----------------------------------------------------------------------

  async function handleSaveEnrichment() {
    if (!editingProduct) return;
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      await client.updateProductEnrichment(editingProduct.product_id, {
        height_cm: enrichForm.height_cm ? parseFloat(enrichForm.height_cm) : null,
        width_cm: enrichForm.width_cm ? parseFloat(enrichForm.width_cm) : null,
        length_cm: enrichForm.length_cm ? parseFloat(enrichForm.length_cm) : null,
        suggested_price_amount: enrichForm.suggested_price
          ? parseFloat(enrichForm.suggested_price)
          : null,
      });
      setSavedOk(true);
      // Update local product list to reflect new values
      setProducts((prev) =>
        prev.map((p) =>
          p.product_id === editingProduct.product_id
            ? {
                ...p,
                height_cm: enrichForm.height_cm ? parseFloat(enrichForm.height_cm) : null,
                width_cm: enrichForm.width_cm ? parseFloat(enrichForm.width_cm) : null,
                length_cm: enrichForm.length_cm ? parseFloat(enrichForm.length_cm) : null,
                suggested_price: enrichForm.suggested_price
                  ? parseFloat(enrichForm.suggested_price)
                  : null,
              }
            : p
        )
      );
    } catch (err: any) {
      setSaveError(err?.error?.message ?? "Failed to save enrichment.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Classification toggle (auto-save)
  // -----------------------------------------------------------------------

  async function handleClassificationToggle(cls: Classification, checked: boolean) {
    if (!editingProduct) return;
    setClassAutoSaving((s) => ({ ...s, [cls.classification_id]: true }));
    const updatedProductIds = checked
      ? [...cls.product_ids, editingProduct.product_id]
      : cls.product_ids.filter((id) => id !== editingProduct.product_id);
    try {
      await client.updateClassification(cls.classification_id, {
        name: cls.name,
        ai_context: cls.ai_context,
        product_ids: updatedProductIds,
      });
      setClassifications((prev) =>
        prev.map((c) =>
          c.classification_id === cls.classification_id
            ? { ...c, product_ids: updatedProductIds, product_count: updatedProductIds.length }
            : c
        )
      );
    } finally {
      setClassAutoSaving((s) => ({ ...s, [cls.classification_id]: false }));
    }
  }

  // -----------------------------------------------------------------------
  // Create classification
  // -----------------------------------------------------------------------

  async function handleCreateClassification() {
    if (!editingProduct || !newClassName.trim()) return;
    setCreatingClass(true);
    try {
      const created = await client.createClassification({
        name: newClassName.trim(),
        ai_context: newClassContext.trim(),
        product_ids: [editingProduct.product_id],
      });
      setClassifications((prev) => [...prev, created]);
      setShowNewClassForm(false);
      setNewClassName("");
      setNewClassContext("");
    } finally {
      setCreatingClass(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render: loading / error
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <Button variant="primary" onClick={loadData}>Retry</Button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Detail panel footer
  // -----------------------------------------------------------------------

  const panelFooter = (
    <div className="flex items-center justify-between">
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {savedOk && !saveError && <p className="text-xs text-emerald-600">Saved ✓</p>}
      {!saveError && !savedOk && <span />}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={closePanel}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSaveEnrichment}>Save</Button>
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Render: main
  // -----------------------------------------------------------------------

  return (
    <div
      className="space-y-4 transition-all duration-300"
      style={{ paddingRight: panelOpen ? 400 : 0 }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Products</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {products.length.toLocaleString()} items
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search name, SKU, EAN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
      </div>

      {/* Paginated table */}
      <PaginatedTable
        items={filtered}
        pageSize={25}
        renderHeader={() => (
          <tr>
            <th className="px-4 py-3 font-medium text-slate-600">Name</th>
            <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
            <th className="px-4 py-3 font-medium text-slate-600">Brand</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>
            <th className="px-4 py-3 font-medium text-slate-600">Dims</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-center w-12"></th>
          </tr>
        )}
        renderRow={(p) => (
          <tr
            key={p.product_id}
            className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
              editingProduct?.product_id === p.product_id ? "border-l-2 border-l-blue-500" : ""
            }`}
          >
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
            <td className="px-4 py-3 text-slate-500 text-xs">{formatDimensions(p)}</td>
            <td className="px-4 py-3 text-center">
              <button
                onClick={() => openPanel(p)}
                aria-label={`Edit ${p.name}`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </td>
          </tr>
        )}
        emptyState={<p>No products match your filters.</p>}
      />

      {/* Detail panel */}
      <DetailPanel
        open={panelOpen}
        onClose={closePanel}
        title={editingProduct?.name ?? ""}
        subtitle={editingProduct ? `SKU: ${editingProduct.sku} · EAN: ${editingProduct.ean}` : undefined}
        footer={panelFooter}
      >
        {editingProduct && (
          <>
            {/* Enrichment fields */}
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Enrichment
              </p>
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">Dimensions (cm)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="enrich-height" className="block text-xs text-slate-600">Height</label>
                    <input
                      id="enrich-height"
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={enrichForm.height_cm}
                      onChange={(e) => setEnrichForm((f) => ({ ...f, height_cm: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="enrich-width" className="block text-xs text-slate-600">Width</label>
                    <input
                      id="enrich-width"
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={enrichForm.width_cm}
                      onChange={(e) => setEnrichForm((f) => ({ ...f, width_cm: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="enrich-length" className="block text-xs text-slate-600">Length</label>
                    <input
                      id="enrich-length"
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={enrichForm.length_cm}
                      onChange={(e) => setEnrichForm((f) => ({ ...f, length_cm: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="enrich-suggested-price" className="block text-xs text-slate-600">
                    Suggested Price (R$)
                  </label>
                  <input
                    id="enrich-suggested-price"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={enrichForm.suggested_price}
                    onChange={(e) => setEnrichForm((f) => ({ ...f, suggested_price: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            {/* Classifications */}
            <section>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Classifications
              </p>
              <div className="space-y-2">
                {classifications.map((cls) => {
                  const isMember = cls.product_ids.includes(editingProduct.product_id);
                  const isSaving = classAutoSaving[cls.classification_id] ?? false;
                  return (
                    <label
                      key={cls.classification_id}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        aria-label={cls.name}
                        checked={isMember}
                        disabled={isSaving}
                        onChange={(e) => handleClassificationToggle(cls, e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">
                        {cls.name}
                        <span className="ml-1 text-xs text-slate-400">({cls.product_count})</span>
                      </span>
                      {isSaving && (
                        <span className="text-xs text-slate-400 animate-pulse">saving…</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Create new classification */}
              {!showNewClassForm ? (
                <button
                  onClick={() => setShowNewClassForm(true)}
                  aria-label="Create new classification"
                  className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create new classification
                </button>
              ) : (
                <div className="mt-3 space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="space-y-1">
                    <label htmlFor="new-class-name" className="block text-xs font-medium text-slate-700">
                      Classification name
                    </label>
                    <input
                      id="new-class-name"
                      type="text"
                      placeholder="e.g. VTEX Ready"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowNewClassForm(false); setNewClassName(""); setNewClassContext(""); }}
                      className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateClassification}
                      disabled={!newClassName.trim() || creatingClass}
                      aria-label="Create"
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                    >
                      {creatingClass ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </DetailPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/feature-products/src/ProductsPage.test.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Run full UI package tests**

```bash
npx vitest run packages/feature-products/ packages/ui/
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/feature-products/src/ProductsPage.tsx packages/feature-products/src/ProductsPage.test.tsx
git commit -m "feat(products): paginated table + slide-over panel + classification management"
```

---

### Task 2: Wire new client methods in the app

The `ProductsClient` interface now requires `createClassification` and `updateClassification`. The app wires this via the SDK client. Check that the app entry point passes the full client.

**Files:**
- Read: `apps/web/src/app/` (find where ProductsPage is rendered and what client is passed)

- [ ] **Step 1: Find the app wiring**

```bash
grep -r "ProductsPage" c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central/apps/web/src/ --include="*.tsx" -l
```

- [ ] **Step 2: Add missing methods to the client passed to ProductsPage**

Open the file found above. The client passed to `<ProductsPage client={...} />` must be the full SDK client, which already has `createClassification` and `updateClassification` methods (they exist in `packages/sdk-runtime/src/index.ts`). Verify the client passed is `createMarketplaceCentralClient(...)` — if so, no change is needed because all methods are already present.

If the client is being manually constructed (e.g., picking individual methods), add `createClassification` and `updateClassification` to the object.

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build --workspace=packages/feature-products
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit if changes were needed**

```bash
git add apps/web/src/
git commit -m "fix(products): wire createClassification and updateClassification to page client"
```

(Skip this commit if no changes were needed — app already passes the full SDK client.)
