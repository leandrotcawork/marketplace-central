import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@marketplace-central/ui";
import type {
  VTEXProduct,
  PublishBatchRequest,
  PublishBatchResponse,
} from "@marketplace-central/sdk-runtime";

interface PublishClient {
  publishToVTEX: (req: PublishBatchRequest) => Promise<PublishBatchResponse>;
}

interface VTEXPublishPageProps {
  client: PublishClient;
}

interface ProductForm {
  product_id: string;
  name: string;
  description: string;
  sku_name: string;
  ean: string;
  category: string;
  brand: string;
  cost: string;
  base_price: string;
  image_url: string;
  stock_qty: string;
  warehouse_id: string;
  trade_policy_id: string;
}

interface FormErrors {
  vtex_account?: string;
  name?: string;
}

const emptyProduct: ProductForm = {
  product_id: "",
  name: "",
  description: "",
  sku_name: "",
  ean: "",
  category: "",
  brand: "",
  cost: "",
  base_price: "",
  image_url: "",
  stock_qty: "",
  warehouse_id: "1_1",
  trade_policy_id: "1",
};

function toVTEXProduct(f: ProductForm): VTEXProduct {
  return {
    product_id: f.product_id.trim(),
    name: f.name.trim(),
    description: f.description.trim(),
    sku_name: f.sku_name.trim() || f.name.trim(),
    ean: f.ean.trim(),
    category: f.category.trim(),
    brand: f.brand.trim(),
    cost: parseFloat(f.cost) || 0,
    base_price: parseFloat(f.base_price) || 0,
    image_urls: f.image_url.trim() ? [f.image_url.trim()] : [],
    specs: {},
    stock_qty: parseInt(f.stock_qty, 10) || 0,
    warehouse_id: f.warehouse_id.trim() || "1_1",
    trade_policy_id: f.trade_policy_id.trim() || "1",
  };
}

function validate(vtexAccount: string, product: ProductForm): FormErrors {
  const errors: FormErrors = {};
  if (!vtexAccount.trim()) errors.vtex_account = "VTEX account is required";
  if (!product.name.trim()) errors.name = "Product name is required";
  return errors;
}

function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step="any"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export function VTEXPublishPage({ client }: VTEXPublishPageProps) {
  const navigate = useNavigate();
  const [vtexAccount, setVtexAccount] = useState("");
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublishBatchResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  function setField(key: keyof ProductForm) {
    return (v: string) => setProduct((p) => ({ ...p, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(vtexAccount, product);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setApiError(null);
    try {
      const vtexProduct = toVTEXProduct(product);
      const res = await client.publishToVTEX({
        vtex_account: vtexAccount.trim(),
        products: [vtexProduct],
      });
      setResult(res);
      setTimeout(
        () =>
          navigate(`/connectors/vtex/batch/${res.batch_id}`, {
            state: { products: [vtexProduct] },
          }),
        2000
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
          Fill in the product details to publish it through the VTEX catalog pipeline.
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

          {/* VTEX Account */}
          <div className="space-y-1">
            <label
              htmlFor="vtex_account"
              className="block text-sm font-medium text-slate-700"
            >
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
            {errors.vtex_account && (
              <p className="text-xs text-red-600">{errors.vtex_account}</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Product Details
            </p>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="product_id"
                label="Product ID"
                placeholder="prod-001"
                value={product.product_id}
                onChange={setField("product_id")}
              />
              <TextField
                id="product_name"
                label="Product Name"
                placeholder="My Product"
                value={product.name}
                onChange={setField("name")}
                required
              />
              <TextField
                id="description"
                label="Description"
                placeholder="Product description"
                value={product.description}
                onChange={setField("description")}
              />
              <TextField
                id="sku_name"
                label="SKU Name"
                placeholder="My SKU"
                value={product.sku_name}
                onChange={setField("sku_name")}
              />
              <TextField
                id="ean"
                label="EAN"
                placeholder="7890000000001"
                value={product.ean}
                onChange={setField("ean")}
              />
              <TextField
                id="category"
                label="Category"
                placeholder="Electronics"
                value={product.category}
                onChange={setField("category")}
              />
              <TextField
                id="brand"
                label="Brand"
                placeholder="BrandX"
                value={product.brand}
                onChange={setField("brand")}
              />
              <NumberField
                id="cost"
                label="Cost (R$)"
                placeholder="60.00"
                value={product.cost}
                onChange={setField("cost")}
              />
              <NumberField
                id="base_price"
                label="Base Price (R$)"
                placeholder="100.00"
                value={product.base_price}
                onChange={setField("base_price")}
              />
              <TextField
                id="image_url"
                label="Image URL"
                placeholder="https://..."
                value={product.image_url}
                onChange={setField("image_url")}
              />
              <NumberField
                id="stock_quantity"
                label="Stock Quantity"
                placeholder="10"
                value={product.stock_qty}
                onChange={setField("stock_qty")}
              />
              <TextField
                id="warehouse_id"
                label="Warehouse ID"
                placeholder="1_1"
                value={product.warehouse_id}
                onChange={setField("warehouse_id")}
              />
              <TextField
                id="trade_policy_id"
                label="Trade Policy ID"
                placeholder="1"
                value={product.trade_policy_id}
                onChange={setField("trade_policy_id")}
              />
            </div>
            {errors.name && (
              <p className="mt-2 text-xs text-red-600">{errors.name}</p>
            )}
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
