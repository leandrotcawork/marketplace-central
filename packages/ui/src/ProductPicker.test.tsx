import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductPicker } from "./ProductPicker";
import type { CatalogProduct } from "./ProductPicker";

const products: CatalogProduct[] = [
  {
    product_id: "p1",
    sku: "SKU-001",
    name: "Cuba Inox",
    brand_name: "Deca",
    cost_amount: 100,
    price_amount: 200,
    stock_quantity: 50,
    ean: "789001",
    reference: "REF-1",
    taxonomy_node_id: "tx_1",
    taxonomy_name: "Cubas",
  },
  {
    product_id: "p2",
    sku: "SKU-002",
    name: "Assento Premium",
    brand_name: "Deca",
    cost_amount: 50,
    price_amount: 100,
    stock_quantity: 30,
    ean: "789002",
    reference: "REF-2",
    taxonomy_node_id: "tx_2",
    taxonomy_name: "Assentos",
  },
];

const taxonomyNodes = [
  { node_id: "tx_1", name: "Cubas", level: 1, level_label: "Category", product_count: 1 },
  { node_id: "tx_2", name: "Assentos", level: 1, level_label: "Category", product_count: 1 },
];

const classifications = [
  { classification_id: "cls_1", name: "Premium", product_ids: ["p1"], product_count: 1 },
];

const defaultProps = {
  products,
  taxonomyNodes,
  classifications,
  selectedIds: [] as string[],
  onSelectionChange: vi.fn(),
};

describe("ProductPicker", () => {
  it("renders product rows", () => {
    render(<ProductPicker {...defaultProps} />);
    expect(screen.getByText("Cuba Inox")).toBeInTheDocument();
    expect(screen.getByText("Assento Premium")).toBeInTheDocument();
    expect(screen.getByText("SKU-001")).toBeInTheDocument();
    expect(screen.getByText("SKU-002")).toBeInTheDocument();
  });

  it("calls onSelectionChange when checkbox clicked", () => {
    const onSelectionChange = vi.fn();
    render(
      <ProductPicker {...defaultProps} onSelectionChange={onSelectionChange} />,
    );
    const checkbox = screen.getByLabelText("Select Cuba Inox");
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(["p1"]);
  });

  it("filters by search query", () => {
    render(<ProductPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText(
      "Search by name, SKU, EAN or reference...",
    );
    fireEvent.change(input, { target: { value: "Cuba" } });
    expect(screen.getByText("Cuba Inox")).toBeInTheDocument();
    expect(screen.queryByText("Assento Premium")).not.toBeInTheDocument();
  });

  it("displays selection count", () => {
    render(<ProductPicker {...defaultProps} selectedIds={["p1", "p2"]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/products selected/i)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ProductPicker {...defaultProps} loading />);
    expect(screen.getByText("Loading products...")).toBeInTheDocument();
    expect(screen.queryByText("Cuba Inox")).not.toBeInTheDocument();
  });

  it("deselects a previously selected product", () => {
    const onSelectionChange = vi.fn();
    render(
      <ProductPicker
        {...defaultProps}
        selectedIds={["p1"]}
        onSelectionChange={onSelectionChange}
      />,
    );
    const checkbox = screen.getByLabelText("Select Cuba Inox");
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });
});
