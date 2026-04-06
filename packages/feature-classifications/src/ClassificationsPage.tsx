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
