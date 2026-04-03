import { useState, useEffect, useCallback } from "react";
import { Pencil, X, Save } from "lucide-react";
import { Button } from "@marketplace-central/ui";

// ---------------------------------------------------------------------------
// Client interface (injected via props)
// ---------------------------------------------------------------------------

interface ProductsClient {
  listCatalogProducts: () => Promise<{ items: any[] }>;
  listTaxonomyNodes: () => Promise<{ items: any[] }>;
  listClassifications: () => Promise<{ items: any[] }>;
  updateProductEnrichment: (productId: string, data: any) => Promise<any>;
}

interface ProductsPageProps {
  client: ProductsClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  id: string;
  name: string;
  sku: string;
  ean: string;
  brand: string;
  cost: number;
  price: number;
  stock: number;
  suggested_price: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  taxonomy_id?: string;
  classification_id?: string;
}

interface TaxonomyNode {
  id: string;
  name: string;
}

interface Classification {
  id: string;
  name: string;
}

interface EnrichmentForm {
  height_cm: string;
  width_cm: string;
  length_cm: string;
  suggested_price: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEnrichmentForm(p: Product): EnrichmentForm {
  return {
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    width_cm: p.width_cm != null ? String(p.width_cm) : "",
    length_cm: p.length_cm != null ? String(p.length_cm) : "",
    suggested_price: p.suggested_price != null ? String(p.suggested_price) : "",
  };
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return `R$ ${value.toFixed(2)}`;
}

function formatDimensions(p: Product): string {
  const h = p.height_cm;
  const w = p.width_cm;
  const l = p.length_cm;
  if (h == null && w == null && l == null) return "-";
  return `${h ?? "-"} x ${w ?? "-"} x ${l ?? "-"} cm`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductsPage({ client }: ProductsPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  // Enrichment modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [enrichForm, setEnrichForm] = useState<EnrichmentForm>({
    height_cm: "",
    width_cm: "",
    length_cm: "",
    suggested_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      p.brand.toLowerCase().includes(q);
    const matchesTaxonomy = !taxonomyFilter || p.taxonomy_id === taxonomyFilter;
    const matchesClassification =
      !classificationFilter || p.classification_id === classificationFilter;
    return matchesSearch && matchesTaxonomy && matchesClassification;
  });

  // -----------------------------------------------------------------------
  // Enrichment modal actions
  // -----------------------------------------------------------------------

  function openEnrichment(p: Product) {
    setEditingProduct(p);
    setEnrichForm(toEnrichmentForm(p));
    setSaveError(null);
  }

  function closeEnrichment() {
    setEditingProduct(null);
    setSaveError(null);
  }

  async function handleSaveEnrichment() {
    if (!editingProduct) return;
    setSaving(true);
    setSaveError(null);
    try {
      await client.updateProductEnrichment(editingProduct.id, {
        height_cm: enrichForm.height_cm ? parseFloat(enrichForm.height_cm) : null,
        width_cm: enrichForm.width_cm ? parseFloat(enrichForm.width_cm) : null,
        length_cm: enrichForm.length_cm ? parseFloat(enrichForm.length_cm) : null,
        suggested_price: enrichForm.suggested_price
          ? parseFloat(enrichForm.suggested_price)
          : null,
      });
      closeEnrichment();
      await loadData();
    } catch (err: any) {
      setSaveError(err?.error?.message ?? "Failed to save enrichment.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render: loading / error / empty
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
        <Button variant="primary" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: main
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Products</h2>
        <p className="mt-1 text-sm text-slate-500">
          Browse your catalog, filter by taxonomy or classification, and enrich product data.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-1">
            Search
          </label>
          <input
            id="search"
            type="text"
            placeholder="Name, SKU, EAN, or Brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="taxonomy" className="block text-sm font-medium text-slate-700 mb-1">
            Taxonomy
          </label>
          <select
            id="taxonomy"
            value={taxonomyFilter}
            onChange={(e) => setTaxonomyFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {taxonomyNodes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="classification" className="block text-sm font-medium text-slate-700 mb-1">
            Classification
          </label>
          <select
            id="classification"
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {classifications.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Product table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-sm text-slate-400">No products found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
                <th className="px-4 py-3 font-medium text-slate-600">EAN</th>
                <th className="px-4 py-3 font-medium text-slate-600">Brand</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Cost</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Price</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Suggested Price</th>
                <th className="px-4 py-3 font-medium text-slate-600">Dimensions</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.ean}</td>
                  <td className="px-4 py-3 text-slate-600">{p.brand}</td>
                  <td className="px-4 py-3 text-slate-600 text-right font-mono">
                    {formatCurrency(p.cost)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-right font-mono">
                    {formatCurrency(p.price)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-right">{p.stock}</td>
                  <td className="px-4 py-3 text-slate-600 text-right font-mono">
                    {formatCurrency(p.suggested_price)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDimensions(p)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEnrichment(p)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Enrichment modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Enrich: {editingProduct.name}
              </h3>
              <button
                onClick={closeEnrichment}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="enrich-height" className="block text-sm font-medium text-slate-700">
                  Height (cm)
                </label>
                <input
                  id="enrich-height"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={enrichForm.height_cm}
                  onChange={(e) => setEnrichForm((f) => ({ ...f, height_cm: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="enrich-width" className="block text-sm font-medium text-slate-700">
                  Width (cm)
                </label>
                <input
                  id="enrich-width"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={enrichForm.width_cm}
                  onChange={(e) => setEnrichForm((f) => ({ ...f, width_cm: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="enrich-length" className="block text-sm font-medium text-slate-700">
                  Length (cm)
                </label>
                <input
                  id="enrich-length"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={enrichForm.length_cm}
                  onChange={(e) => setEnrichForm((f) => ({ ...f, length_cm: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="enrich-suggested-price"
                  className="block text-sm font-medium text-slate-700"
                >
                  Suggested Price (R$)
                </label>
                <input
                  id="enrich-suggested-price"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={enrichForm.suggested_price}
                  onChange={(e) =>
                    setEnrichForm((f) => ({ ...f, suggested_price: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeEnrichment}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={handleSaveEnrichment}>
                <Save className="w-4 h-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
