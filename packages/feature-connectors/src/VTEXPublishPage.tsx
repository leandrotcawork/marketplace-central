import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  ProductPicker,
} from "@marketplace-central/ui";
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

export function VTEXPublishPage({ client }: VTEXPublishPageProps) {
  const navigate = useNavigate();

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [vtexAccount, setVtexAccount] = useState("");
  const [tradePolicyId, setTradePolicyId] = useState("1");
  const [warehouseId, setWarehouseId] = useState("1_1");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublishBatchResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!vtexAccount.trim()) {
      setValidationError("VTEX account is required");
      return;
    }
    if (selectedIds.length === 0) {
      setValidationError("Select at least one product");
      return;
    }

    const selectedProducts = products.filter((p) =>
      selectedIds.includes(p.product_id),
    );

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
        () =>
          navigate(`/connectors/vtex/batch/${res.batch_id}`, {
            state: { products: vtexProducts },
          }),
        2000,
      );
    } catch (err: any) {
      setApiError(err?.error?.message ?? "Failed to start batch. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">VTEX Publisher</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select products from your catalog and publish them to VTEX.
        </p>
      </div>

      {result ? (
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
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          {validationError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {validationError}
            </div>
          )}

          {/* Product selection */}
          <div className="border-b border-slate-100 pb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Select Products
            </p>
            <ProductPicker
              products={products}
              taxonomyNodes={taxonomyNodes}
              classifications={classifications}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              loading={loading}
            />
          </div>

          {/* VTEX configuration */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              VTEX Configuration
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="vtex_account" className="block text-sm font-medium text-slate-700">
                  VTEX Account<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  id="vtex_account"
                  type="text"
                  placeholder="mystore"
                  value={vtexAccount}
                  onChange={(e) => setVtexAccount(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="trade_policy_id" className="block text-sm font-medium text-slate-700">
                  Trade Policy ID
                </label>
                <input
                  id="trade_policy_id"
                  type="text"
                  placeholder="1"
                  value={tradePolicyId}
                  onChange={(e) => setTradePolicyId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="warehouse_id" className="block text-sm font-medium text-slate-700">
                  Warehouse ID
                </label>
                <input
                  id="warehouse_id"
                  type="text"
                  placeholder="1_1"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={submitting}>
              Publish to VTEX
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
