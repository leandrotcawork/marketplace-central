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

interface EnrichmentForm {
  height_cm: string;
  width_cm: string;
  length_cm: string;
  suggested_price: string;
}

function toEnrichmentForm(p: CatalogProduct): EnrichmentForm {
  return {
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    width_cm: p.width_cm != null ? String(p.width_cm) : "",
    length_cm: p.length_cm != null ? String(p.length_cm) : "",
    suggested_price: p.suggested_price != null ? String(p.suggested_price) : "",
  };
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return `R$ ${value.toFixed(2)}`;
}

function formatDimensions(p: CatalogProduct): string {
  const h = p.height_cm;
  const w = p.width_cm;
  const l = p.length_cm;
  if (h == null && w == null && l == null) return "\u2014";
  return `${h ?? "\u2014"} \u00d7 ${w ?? "\u2014"} \u00d7 ${l ?? "\u2014"} cm`;
}

export function ProductsPage({ client }: ProductsPageProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [enrichForm, setEnrichForm] = useState<EnrichmentForm>({
    height_cm: "", width_cm: "", length_cm: "", suggested_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const [classAutoSaving, setClassAutoSaving] = useState<Record<string, boolean>>({});

  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassContext, setNewClassContext] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);

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

  const panelFooter = (
    <div className="flex items-center justify-between">
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {savedOk && !saveError && <p className="text-xs text-emerald-600">Saved</p>}
      {!saveError && !savedOk && <span />}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={closePanel}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSaveEnrichment}>Save</Button>
      </div>
    </div>
  );

  return (
    <div
      className="space-y-4 transition-all duration-300"
      style={{ paddingRight: panelOpen ? 400 : 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Products</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {products.length.toLocaleString()} items
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search name, SKU, EAN..."
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

      <DetailPanel
        open={panelOpen}
        onClose={closePanel}
        title={editingProduct?.name ?? ""}
        subtitle={editingProduct ? `SKU: ${editingProduct.sku}` : undefined}
        footer={panelFooter}
      >
        {editingProduct && (
          <>
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
                        <span className="text-xs text-slate-400 animate-pulse">saving...</span>
                      )}
                    </label>
                  );
                })}
              </div>

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
                      {creatingClass ? "Creating..." : "Create"}
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
