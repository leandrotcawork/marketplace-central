import { useState, useMemo } from "react";
import { Search } from "lucide-react";

/* ── Local type definitions (no sdk-runtime dependency) ── */

export interface CatalogProduct {
  product_id: string;
  sku: string;
  name: string;
  ean: string;
  reference: string;
  brand_name: string;
  cost_amount: number;
  price_amount: number;
  stock_quantity: number;
  taxonomy_node_id: string;
  taxonomy_name: string;
}

export interface TaxonomyNode {
  node_id: string;
  name: string;
  level: number;
  level_label: string;
  product_count: number;
}

export interface Classification {
  classification_id: string;
  name: string;
  product_ids: string[];
  product_count: number;
}

export interface ProductPickerProps {
  products: CatalogProduct[];
  taxonomyNodes: TaxonomyNode[];
  classifications: Classification[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading?: boolean;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductPicker({
  products,
  taxonomyNodes,
  classifications,
  selectedIds,
  onSelectionChange,
  loading = false,
}: ProductPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [taxonomyFilter, setTaxonomyFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.ean.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q),
      );
    }

    if (taxonomyFilter) {
      result = result.filter((p) => p.taxonomy_node_id === taxonomyFilter);
    }

    if (classificationFilter) {
      const cls = classifications.find(
        (c) => c.classification_id === classificationFilter,
      );
      if (cls) {
        const idSet = new Set(cls.product_ids);
        result = result.filter((p) => idSet.has(p.product_id));
      }
    }

    return result;
  }, [products, searchQuery, taxonomyFilter, classificationFilter, classifications]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedSet.has(p.product_id));

  function handleToggle(productId: string) {
    if (selectedSet.has(productId)) {
      onSelectionChange(selectedIds.filter((id) => id !== productId));
    } else {
      onSelectionChange([...selectedIds, productId]);
    }
  }

  function handleToggleAll() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredProducts.map((p) => p.product_id));
      onSelectionChange(selectedIds.filter((id) => !filteredIds.has(id)));
    } else {
      const merged = new Set(selectedIds);
      for (const p of filteredProducts) {
        merged.add(p.product_id);
      }
      onSelectionChange(Array.from(merged));
    }
  }

  function handleClassificationChange(value: string) {
    setClassificationFilter(value);
    if (value) {
      const cls = classifications.find((c) => c.classification_id === value);
      if (cls) {
        const merged = new Set(selectedIds);
        for (const id of cls.product_ids) {
          merged.add(id);
        }
        onSelectionChange(Array.from(merged));
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-600 mr-3" />
        Loading products...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, EAN or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <select
          value={taxonomyFilter}
          onChange={(e) => setTaxonomyFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All taxonomy groups</option>
          {taxonomyNodes.map((node) => (
            <option key={node.node_id} value={node.node_id}>
              {node.name} ({node.product_count})
            </option>
          ))}
        </select>

        <select
          value={classificationFilter}
          onChange={(e) => handleClassificationChange(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All classifications</option>
          {classifications.map((cls) => (
            <option key={cls.classification_id} value={cls.classification_id}>
              {cls.name} ({cls.product_count})
            </option>
          ))}
        </select>
      </div>

      {/* Selection count */}
      <div className="text-sm text-slate-600">
        <span className="font-medium">{selectedIds.length}</span> product
        {selectedIds.length !== 1 ? "s" : ""} selected
        {filteredProducts.length !== products.length && (
          <span className="ml-2 text-slate-400">
            ({filteredProducts.length} of {products.length} shown)
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleToggleAll}
                  className="rounded border-slate-300"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">EAN</th>
              <th className="px-4 py-3 text-right font-medium text-slate-700">Cost (R$)</th>
              <th className="px-4 py-3 text-right font-medium text-slate-700">Price (R$)</th>
              <th className="px-4 py-3 text-right font-medium text-slate-700">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No products found.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr
                  key={product.product_id}
                  className={`hover:bg-slate-50 ${selectedSet.has(product.product_id) ? "bg-blue-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(product.product_id)}
                      onChange={() => handleToggle(product.product_id)}
                      className="rounded border-slate-300"
                      aria-label={`Select ${product.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 text-slate-600">{product.sku}</td>
                  <td className="px-4 py-3 text-slate-600">{product.ean}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(product.cost_amount)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(product.price_amount)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{product.stock_quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
