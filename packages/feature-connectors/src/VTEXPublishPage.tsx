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
  if (value == null) return "\u2014";
  return `R$ ${value.toFixed(2)}`;
}

export function VTEXPublishPage({ client }: VTEXPublishPageProps) {
  const navigate = useNavigate();

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);

  const [vtexAccount, setVtexAccount] = useState("");
  const [tradePolicyId, setTradePolicyId] = useState("1");
  const [warehouseId, setWarehouseId] = useState("1_1");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [loadClassificationId, setLoadClassificationId] = useState("");

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
          <p className="text-xs text-emerald-600 mt-1">Redirecting to batch status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">VTEX Publisher</h2>

      {/* Config bar */}
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
            <Button
              variant="primary"
              loading={submitting}
              disabled={!canPublish}
              onClick={handlePublish}
            >
              {selectedCount > 0
                ? `Publish ${selectedCount} product${selectedCount !== 1 ? "s" : ""}`
                : "Publish"}
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
        <select
          value={loadClassificationId}
          onChange={(e) => handleLoadClassification(e.target.value)}
          aria-label="Load classification"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Load Classification...</option>
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

      {/* Paginated table */}
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
