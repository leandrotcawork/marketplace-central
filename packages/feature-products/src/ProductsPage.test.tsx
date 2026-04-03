import { render, screen, waitFor } from "@testing-library/react";
import { ProductsPage } from "./ProductsPage";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockListProducts = vi.fn();
const mockListTaxonomy = vi.fn();
const mockListClassifications = vi.fn();
const mockUpdateEnrichment = vi.fn();

const mockClient = {
  listCatalogProducts: mockListProducts,
  listTaxonomyNodes: mockListTaxonomy,
  listClassifications: mockListClassifications,
  updateProductEnrichment: mockUpdateEnrichment,
} as any;

const sampleProducts = [
  {
    id: "prod-1",
    name: "Steel Bolt M10",
    sku: "SKU-001",
    ean: "7890000000001",
    brand: "BoltCo",
    cost: 2.5,
    price: 5.0,
    stock: 1500,
    suggested_price: 4.8,
    height_cm: 1,
    width_cm: 1,
    length_cm: 5,
    taxonomy_id: "tax-1",
    classification_id: "cls-1",
  },
];

describe("ProductsPage", () => {
  beforeEach(() => {
    mockListProducts.mockReset();
    mockListTaxonomy.mockReset();
    mockListClassifications.mockReset();
    mockUpdateEnrichment.mockReset();
  });

  it("shows loading state initially", () => {
    mockListProducts.mockReturnValue(new Promise(() => {}));
    mockListTaxonomy.mockReturnValue(new Promise(() => {}));
    mockListClassifications.mockReturnValue(new Promise(() => {}));

    render(<ProductsPage client={mockClient} />);
    expect(screen.getByText("Loading products...")).toBeInTheDocument();
  });

  it("renders product name after loading", async () => {
    mockListProducts.mockResolvedValueOnce({ items: sampleProducts });
    mockListTaxonomy.mockResolvedValueOnce({ items: [{ id: "tax-1", name: "Fasteners" }] });
    mockListClassifications.mockResolvedValueOnce({ items: [{ id: "cls-1", name: "Hardware" }] });

    render(<ProductsPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Steel Bolt M10")).toBeInTheDocument();
    });
  });

  it("shows error state when loading fails", async () => {
    mockListProducts.mockRejectedValueOnce({ error: { message: "Network error" } });
    mockListTaxonomy.mockResolvedValueOnce({ items: [] });
    mockListClassifications.mockResolvedValueOnce({ items: [] });

    render(<ProductsPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows empty state when no products exist", async () => {
    mockListProducts.mockResolvedValueOnce({ items: [] });
    mockListTaxonomy.mockResolvedValueOnce({ items: [] });
    mockListClassifications.mockResolvedValueOnce({ items: [] });

    render(<ProductsPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("No products found.")).toBeInTheDocument();
    });
  });
});
