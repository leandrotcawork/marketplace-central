# Classifications Management Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a dedicated Classifications page at `/classifications` with a two-column layout: classification list on the left, product table with checkboxes on the right.

**Spec:** `docs/superpowers/specs/2026-04-05-classifications-page-design.md`

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react

**Depends on:** Plan 1 components (PaginatedTable, Button from `@marketplace-central/ui`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/feature-classifications/package.json` | Package config |
| Create | `packages/feature-classifications/src/index.ts` | Package exports |
| Create | `packages/feature-classifications/src/ClassificationsPage.tsx` | Main page component |
| Create | `packages/feature-classifications/src/ClassificationsPage.test.tsx` | Tests |
| Modify | `apps/web/src/app/Layout.tsx` | Add "Classifications" nav item |
| Modify | `apps/web/src/app/AppRouter.tsx` | Add route + wrapper |
| Modify | `apps/web/package.json` | Add feature-classifications dependency |
| Modify | `apps/web/src/index.css` | Add Tailwind @source path |

Note: No `tsconfig.json` needed — no other feature package has one (workspace inherits root config).

---

### Task 1: Create feature-classifications package scaffold

**Files:**
- Create: `packages/feature-classifications/package.json`
- Create: `packages/feature-classifications/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/feature-classifications/package.json`:

```json
{
  "name": "@marketplace-central/feature-classifications",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@marketplace-central/ui": "*",
    "@marketplace-central/sdk-runtime": "*",
    "lucide-react": "*",
    "react": "*"
  },
  "devDependencies": {
    "@testing-library/react": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 2: Create index.ts**

Create `packages/feature-classifications/src/index.ts`:

```ts
export { ClassificationsPage } from "./ClassificationsPage";
```

- [ ] **Step 3: Install dependencies**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm install
```

Expected: Resolves workspace links, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/feature-classifications/package.json packages/feature-classifications/src/index.ts
git commit -m "chore(classifications): scaffold feature-classifications package"
```

---

### Task 2: Implement ClassificationsPage + tests

**Files:**
- Create: `packages/feature-classifications/src/ClassificationsPage.tsx`
- Create: `packages/feature-classifications/src/ClassificationsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/feature-classifications/src/ClassificationsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClassificationsPage } from "./ClassificationsPage";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
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
  suggested_price: null,
  height_cm: null,
  width_cm: null,
  length_cm: null,
});

const products: CatalogProduct[] = Array.from({ length: 60 }, (_, i) => makeProduct(i));

const taxonomyNodes: TaxonomyNode[] = [
  { node_id: "tax1", name: "Category A", level: 1, level_label: "L1", parent_node_id: "", is_active: true, product_count: 60 },
];

const existingClassifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "Products ready for VTEX",
    product_ids: ["p0", "p1", "p2"],
    product_count: 3,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  {
    classification_id: "cls2",
    name: "Clearance",
    ai_context: "",
    product_ids: ["p5"],
    product_count: 1,
    created_at: "2026-04-02T00:00:00Z",
    updated_at: "2026-04-02T00:00:00Z",
  },
];

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: taxonomyNodes }),
    listClassifications: vi.fn().mockResolvedValue({ items: existingClassifications }),
    createClassification: vi.fn().mockResolvedValue({
      classification_id: "cls3",
      name: "New One",
      ai_context: "",
      product_ids: ["p10"],
      product_count: 1,
      created_at: "",
      updated_at: "",
    }),
    updateClassification: vi.fn().mockResolvedValue({}),
    deleteClassification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ClassificationsPage", () => {
  it("renders classification list after loading", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    expect(screen.getByText("Clearance")).toBeInTheDocument();
  });

  it("shows empty state when no classification is selected", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    expect(screen.getByText(/select a classification/i)).toBeInTheDocument();
  });

  it("shows product table when classification is selected", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Products in classification are pre-checked
    expect(screen.getByRole("checkbox", { name: /select product 0/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /select product 1/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /select product 3/i })).not.toBeChecked();
  });

  it("paginates products at 25 per page", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("calls updateClassification when product checkbox toggled", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Add p3 to classification
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 3/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.arrayContaining(["p0", "p1", "p2", "p3"]),
      }))
    );
  });

  it("calls updateClassification when product unchecked", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    // Remove p0 from classification
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.not.arrayContaining(["p0"]),
      }))
    );
  });

  it("creates new classification on first product check", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new classification/i }));
    // Name field should be focused / visible
    const nameInput = await screen.findByLabelText(/classification name/i);
    fireEvent.change(nameInput, { target: { value: "New One" } });
    // Check a product to trigger creation
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 10/i }));
    await waitFor(() =>
      expect(client.createClassification).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New One", product_ids: ["p10"] })
      )
    );
  });

  it("deletes classification when trash icon clicked and confirmed", async () => {
    const client = makeClient();
    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /delete vtex ready/i }));
    await waitFor(() =>
      expect(client.deleteClassification).toHaveBeenCalledWith("cls1")
    );
    expect(screen.queryByText("VTEX Ready")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("select all filtered adds all filtered products to classification", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.arrayContaining(["p0", "p1", "p2", "p59"]),
      }))
    );
  });

  it("clear all removes all products from classification", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: [],
      }))
    );
  });

  it("saves name on blur", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    const nameInput = await screen.findByLabelText(/classification name/i);
    fireEvent.change(nameInput, { target: { value: "VTEX Premium" } });
    fireEvent.blur(nameInput);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        name: "VTEX Premium",
      }))
    );
  });

  it("saves ai_context on blur", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    const contextInput = await screen.findByLabelText(/ai context/i);
    fireEvent.change(contextInput, { target: { value: "Updated context" } });
    fireEvent.blur(contextInput);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        ai_context: "Updated context",
      }))
    );
  });

  it("shows error when load fails", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockRejectedValue({ error: { message: "Network error" } }),
    });
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("discards unsaved draft when selecting existing classification", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new classification/i }));
    // Draft is shown
    expect(screen.getByText("Untitled")).toBeInTheDocument();
    // Click existing classification — draft disappears
    fireEvent.click(screen.getByText("Clearance"));
    expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
  });

  it("filters products by search text", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "Product 5" } });
    // Product 0 should be filtered out, Product 5 visible
    expect(screen.queryByText("Product 0")).not.toBeInTheDocument();
    expect(screen.getByText("Product 5")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npx vitest run packages/feature-classifications/src/ClassificationsPage.test.tsx
```

Expected: FAIL — `ClassificationsPage` module not found.

- [ ] **Step 3: Implement ClassificationsPage**

Create `packages/feature-classifications/src/ClassificationsPage.tsx`:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Tags, Plus, Trash2 } from "lucide-react";
import { Button, PaginatedTable } from "@marketplace-central/ui";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  CreateClassificationRequest,
  UpdateClassificationRequest,
} from "@marketplace-central/sdk-runtime";

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

interface ClassificationsClient {
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
  listClassifications: () => Promise<{ items: Classification[] }>;
  createClassification: (req: CreateClassificationRequest) => Promise<Classification>;
  updateClassification: (id: string, req: UpdateClassificationRequest) => Promise<Classification>;
  deleteClassification: (id: string) => Promise<void>;
}

interface ClassificationsPageProps {
  client: ClassificationsClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return `R$ ${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClassificationsPage({ client }: ClassificationsPageProps) {
  // Data
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // New classification draft (unsaved)
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAiContext, setDraftAiContext] = useState("");

  // Editing name/context for existing classification
  const [editName, setEditName] = useState("");
  const [editAiContext, setEditAiContext] = useState("");

  // Product table filters
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");

  // API state
  const [actionError, setActionError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, taxRes, clsRes] = await Promise.all([
        client.listCatalogProducts(),
        client.listTaxonomyNodes(),
        client.listClassifications(),
      ]);
      setProducts(prodRes.items);
      setTaxonomyNodes(taxRes.items);
      setClassifications(clsRes.items);
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const selectedClassification = classifications.find(
    (c) => c.classification_id === selectedId
  );

  const selectedProductIds = useMemo(() => {
    if (!selectedClassification) return new Set<string>();
    return new Set(selectedClassification.product_ids);
  }, [selectedClassification]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q) ||
        p.brand_name.toLowerCase().includes(q);
      const matchesTaxonomy = !taxonomyFilter || p.taxonomy_node_id === taxonomyFilter;
      return matchesSearch && matchesTaxonomy;
    });
  }, [products, search, taxonomyFilter]);

  const sortedClassifications = useMemo(() => {
    return [...classifications].sort((a, b) => a.name.localeCompare(b.name));
  }, [classifications]);

  // -----------------------------------------------------------------------
  // Select classification
  // -----------------------------------------------------------------------

  function handleSelect(cls: Classification) {
    setIsCreatingNew(false);
    setSelectedId(cls.classification_id);
    setEditName(cls.name);
    setEditAiContext(cls.ai_context);
    setSearch("");
    setTaxonomyFilter("");
    setActionError(null);
  }

  // -----------------------------------------------------------------------
  // New classification
  // -----------------------------------------------------------------------

  function handleNewClick() {
    setSelectedId(null);
    setIsCreatingNew(true);
    setDraftName("");
    setDraftAiContext("");
    setSearch("");
    setTaxonomyFilter("");
    setActionError(null);
  }

  async function handleNewFirstProductCheck(productId: string) {
    const name = draftName.trim() || "Untitled";
    try {
      const created = await client.createClassification({
        name,
        ai_context: draftAiContext.trim(),
        product_ids: [productId],
      });
      setClassifications((prev) => [...prev, created]);
      setIsCreatingNew(false);
      setSelectedId(created.classification_id);
      setEditName(created.name);
      setEditAiContext(created.ai_context);
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to create classification.");
    }
  }

  // -----------------------------------------------------------------------
  // Update name/context on blur
  // -----------------------------------------------------------------------

  async function handleNameBlur() {
    if (!selectedClassification || editName === selectedClassification.name) return;
    if (!editName.trim()) {
      setEditName(selectedClassification.name);
      return;
    }
    try {
      await client.updateClassification(selectedClassification.classification_id, {
        name: editName.trim(),
        ai_context: selectedClassification.ai_context,
        product_ids: selectedClassification.product_ids,
      });
      setClassifications((prev) =>
        prev.map((c) =>
          c.classification_id === selectedClassification.classification_id
            ? { ...c, name: editName.trim() }
            : c
        )
      );
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to update name.");
    }
  }

  async function handleAiContextBlur() {
    if (!selectedClassification || editAiContext === selectedClassification.ai_context) return;
    try {
      await client.updateClassification(selectedClassification.classification_id, {
        name: selectedClassification.name,
        ai_context: editAiContext.trim(),
        product_ids: selectedClassification.product_ids,
      });
      setClassifications((prev) =>
        prev.map((c) =>
          c.classification_id === selectedClassification.classification_id
            ? { ...c, ai_context: editAiContext.trim() }
            : c
        )
      );
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to update context.");
    }
  }

  // -----------------------------------------------------------------------
  // Toggle product membership
  // -----------------------------------------------------------------------

  async function handleToggleProduct(productId: string) {
    // New classification — create on first check
    if (isCreatingNew) {
      await handleNewFirstProductCheck(productId);
      return;
    }

    if (!selectedClassification) return;

    const currentIds = selectedClassification.product_ids;
    const isIn = currentIds.includes(productId);
    const updatedIds = isIn
      ? currentIds.filter((id) => id !== productId)
      : [...currentIds, productId];

    // Optimistic update
    setClassifications((prev) =>
      prev.map((c) =>
        c.classification_id === selectedClassification.classification_id
          ? { ...c, product_ids: updatedIds, product_count: updatedIds.length }
          : c
      )
    );

    try {
      await client.updateClassification(selectedClassification.classification_id, {
        name: selectedClassification.name,
        ai_context: selectedClassification.ai_context,
        product_ids: updatedIds,
      });
    } catch (err: any) {
      // Revert
      setClassifications((prev) =>
        prev.map((c) =>
          c.classification_id === selectedClassification.classification_id
            ? { ...c, product_ids: currentIds, product_count: currentIds.length }
            : c
        )
      );
      setActionError(err?.error?.message ?? "Failed to update membership.");
    }
  }

  // -----------------------------------------------------------------------
  // Select All Filtered / Clear All
  // -----------------------------------------------------------------------

  async function handleSelectAllFiltered() {
    if (!selectedClassification) return;
    const allFilteredIds = filtered.map((p) => p.product_id);
    const merged = Array.from(new Set([...selectedClassification.product_ids, ...allFilteredIds]));

    setClassifications((prev) =>
      prev.map((c) =>
        c.classification_id === selectedClassification.classification_id
          ? { ...c, product_ids: merged, product_count: merged.length }
          : c
      )
    );

    try {
      await client.updateClassification(selectedClassification.classification_id, {
        name: selectedClassification.name,
        ai_context: selectedClassification.ai_context,
        product_ids: merged,
      });
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to select all.");
      await loadData();
    }
  }

  async function handleClearAll() {
    if (!selectedClassification) return;

    setClassifications((prev) =>
      prev.map((c) =>
        c.classification_id === selectedClassification.classification_id
          ? { ...c, product_ids: [], product_count: 0 }
          : c
      )
    );

    try {
      await client.updateClassification(selectedClassification.classification_id, {
        name: selectedClassification.name,
        ai_context: selectedClassification.ai_context,
        product_ids: [],
      });
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to clear all.");
      await loadData();
    }
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async function handleDelete(cls: Classification) {
    if (!window.confirm(`Delete "${cls.name}"? This won't delete the products.`)) return;
    try {
      await client.deleteClassification(cls.classification_id);
      setClassifications((prev) =>
        prev.filter((c) => c.classification_id !== cls.classification_id)
      );
      if (selectedId === cls.classification_id) {
        setSelectedId(null);
      }
    } catch (err: any) {
      setActionError(err?.error?.message ?? "Failed to delete classification.");
    }
  }

  // -----------------------------------------------------------------------
  // Render: loading / error
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">Loading...</p>
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
  // Which product IDs are "checked" in the table?
  // -----------------------------------------------------------------------

  const checkedIds = isCreatingNew ? new Set<string>() : selectedProductIds;
  const checkedCount = checkedIds.size;
  const showDetail = selectedId !== null || isCreatingNew;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex gap-6 h-full">
      {/* Left column — classification list */}
      <div className="w-[280px] shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Classifications</h2>
          <button
            onClick={handleNewClick}
            aria-label="New classification"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {isCreatingNew && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-blue-50 border-l-2 border-blue-500">
              <div className="min-w-0">
                <p className="text-sm font-medium text-blue-700 truncate">
                  {draftName || "Untitled"}
                </p>
                <p className="text-xs text-blue-500">New</p>
              </div>
            </div>
          )}

          {sortedClassifications.map((cls) => {
            const isSelected = cls.classification_id === selectedId && !isCreatingNew;
            return (
              <div
                key={cls.classification_id}
                onClick={() => handleSelect(cls)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50 border-l-2 border-blue-500"
                    : "hover:bg-slate-50 border-l-2 border-transparent"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${isSelected ? "text-blue-700" : "text-slate-700"}`}>
                    {cls.name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-slate-400 tabular-nums">{cls.product_count}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(cls); }}
                    aria-label={`Delete ${cls.name}`}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {sortedClassifications.length === 0 && !isCreatingNew && (
            <p className="text-sm text-slate-400 px-3 py-4">No classifications yet.</p>
          )}
        </div>
      </div>

      {/* Right column — detail view */}
      <div className="flex-1 min-w-0 space-y-4">
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {!showDetail && (
          <div className="flex items-center justify-center h-64 text-sm text-slate-400">
            Select a classification or create a new one.
          </div>
        )}

        {showDetail && (
          <>
            {/* Name + AI Context */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="cls-name" className="block text-xs font-medium text-slate-700">
                  Classification name
                </label>
                {isCreatingNew ? (
                  <input
                    id="cls-name"
                    type="text"
                    autoFocus
                    placeholder="e.g. VTEX Ready"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    id="cls-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleNameBlur}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="cls-context" className="block text-xs font-medium text-slate-700">
                  AI Context <span className="text-slate-400">(optional)</span>
                </label>
                {isCreatingNew ? (
                  <textarea
                    id="cls-context"
                    rows={2}
                    placeholder="Notes about this classification..."
                    value={draftAiContext}
                    onChange={(e) => setDraftAiContext(e.target.value)}
                    className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                ) : (
                  <textarea
                    id="cls-context"
                    rows={2}
                    placeholder="Notes about this classification..."
                    value={editAiContext}
                    onChange={(e) => setEditAiContext(e.target.value)}
                    onBlur={handleAiContextBlur}
                    className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                )}
              </div>
            </div>

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
                {taxonomyNodes.map((t) => (
                  <option key={t.node_id} value={t.node_id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Selection count + bulk actions */}
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>{checkedCount > 0 ? `${checkedCount} selected` : "No products selected"}</span>
              {!isCreatingNew && (
                <>
                  <button
                    onClick={handleSelectAllFiltered}
                    aria-label="Select all filtered"
                    className="text-blue-600 hover:text-blue-800 text-xs cursor-pointer"
                  >
                    Select All Filtered
                  </button>
                  {checkedCount > 0 && (
                    <button
                      onClick={handleClearAll}
                      aria-label="Clear all"
                      className="text-slate-500 hover:text-slate-700 text-xs cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Product table */}
            <PaginatedTable
              items={filtered}
              pageSize={25}
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
                const checked = checkedIds.has(p.product_id);
                return (
                  <tr
                    key={p.product_id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                      checked ? "bg-blue-50/40" : ""
                    }`}
                    onClick={() => handleToggleProduct(p.product_id)}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={`Select ${p.name}`}
                        onChange={() => handleToggleProduct(p.product_id)}
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
              emptyState={<p>No products match your filters.</p>}
            />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/feature-classifications/src/ClassificationsPage.test.tsx
```

Expected: All 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-classifications/src/ClassificationsPage.tsx packages/feature-classifications/src/ClassificationsPage.test.tsx
git commit -m "feat(classifications): dedicated classifications management page"
```

---

### Task 3: Wire into app (nav + route + integration)

**Files:**
- Modify: `apps/web/src/app/Layout.tsx`
- Modify: `apps/web/src/app/AppRouter.tsx`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add feature-classifications dependency to apps/web/package.json**

Add to the `dependencies` section of `apps/web/package.json`:
```json
"@marketplace-central/feature-classifications": "0.1.0",
```

- [ ] **Step 2: Add Tailwind @source path to apps/web/src/index.css**

Add this line after the existing `@source` lines:
```css
@source "../../../packages/feature-classifications/src";
```

- [ ] **Step 3: Run npm install to resolve workspace links**

```bash
cd c:/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm install
```

- [ ] **Step 4: Add nav item to Layout.tsx**

In `apps/web/src/app/Layout.tsx`, add the `Tags` import and new nav item between Products and VTEX Publisher:

Change the import line:
```ts
import { LayoutDashboard, Package, Send, Store, Calculator } from "lucide-react";
```
to:
```ts
import { LayoutDashboard, Package, Tags, Send, Store, Calculator } from "lucide-react";
```

Change the `navItems` array:
```ts
const navItems = [
  { to: "/",                label: "Dashboard",         icon: LayoutDashboard },
  { to: "/products",        label: "Products",          icon: Package },
  { to: "/connectors/vtex", label: "VTEX Publisher",    icon: Send },
  { to: "/marketplaces",    label: "Marketplaces",      icon: Store },
  { to: "/simulator",       label: "Pricing Simulator", icon: Calculator },
];
```
to:
```ts
const navItems = [
  { to: "/",                 label: "Dashboard",         icon: LayoutDashboard },
  { to: "/products",         label: "Products",          icon: Package },
  { to: "/classifications",  label: "Classifications",   icon: Tags },
  { to: "/connectors/vtex",  label: "VTEX Publisher",    icon: Send },
  { to: "/marketplaces",     label: "Marketplaces",      icon: Store },
  { to: "/simulator",        label: "Pricing Simulator", icon: Calculator },
];
```

- [ ] **Step 2: Add route and wrapper to AppRouter.tsx**

In `apps/web/src/app/AppRouter.tsx`, add the import:
```ts
import { ClassificationsPage } from "@marketplace-central/feature-classifications";
```

Add the wrapper function (after `ProductsPageWrapper`):
```ts
function ClassificationsPageWrapper() {
  const client = useClient();
  return <ClassificationsPage client={client} />;
}
```

Add the route (after the `/products` route):
```tsx
<Route path="/classifications" element={<ClassificationsPageWrapper />} />
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: All test suites pass. No test failures.

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev --workspace=apps/web &
sleep 3
curl -s http://localhost:5173 > /dev/null && echo "Dev server OK" || echo "Dev server FAILED"
```

Expected: Dev server starts without errors, package resolves, Tailwind picks up new source.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/src/index.css apps/web/src/app/Layout.tsx apps/web/src/app/AppRouter.tsx
git commit -m "feat(classifications): add nav item and route for classifications page"
```
