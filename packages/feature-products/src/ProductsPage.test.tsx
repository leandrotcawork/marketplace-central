import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductsPage } from "./ProductsPage";
import type { CatalogProduct, TaxonomyNode, Classification } from "@marketplace-central/sdk-runtime";

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

const classifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "",
    product_ids: ["p0", "p1"],
    product_count: 2,
    created_at: "",
    updated_at: "",
  },
];

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: taxonomyNodes }),
    listClassifications: vi.fn().mockResolvedValue({ items: classifications }),
    updateProductEnrichment: vi.fn().mockResolvedValue({}),
    createClassification: vi.fn().mockResolvedValue({
      classification_id: "cls2",
      name: "New Class",
      ai_context: "",
      product_ids: ["p0"],
      product_count: 1,
      created_at: "",
      updated_at: "",
    }),
    updateClassification: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("ProductsPage", () => {
  it("shows loading state then renders 25 rows", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("does not render all 60 products at once", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.queryByText("Product 59")).not.toBeInTheDocument();
  });

  it("opens detail panel when edit button clicked", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    expect(screen.getByText("VTEX Ready")).toBeInTheDocument();
  });

  it("closes detail panel on Escape", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    // Panel is closed — the classification checkbox label "VTEX Ready" should not be in the panel context
    // Note: "VTEX Ready" may still be visible in the classification filter dropdown
    // Check that the panel-specific content (enrichment section) is gone
    expect(screen.queryByLabelText(/height/i)).not.toBeInTheDocument();
  });

  it("auto-saves classification membership when checkbox toggled", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    const vtexReadyCheckbox = await screen.findByRole("checkbox", { name: /vtex ready/i });
    fireEvent.click(vtexReadyCheckbox);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.not.arrayContaining(["p0"]),
      }))
    );
  });

  it("saves enrichment fields on Save click", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    const heightInput = await screen.findByLabelText(/height/i);
    fireEvent.change(heightInput, { target: { value: "10.5" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(client.updateProductEnrichment).toHaveBeenCalledWith(
        "p0",
        expect.objectContaining({ height_cm: 10.5 })
      )
    );
  });

  it("shows create classification form when link clicked", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create new classification/i }));
    expect(screen.getByLabelText(/classification name/i)).toBeInTheDocument();
  });

  it("calls createClassification and adds product to new classification", async () => {
    const client = makeClient();
    render(<ProductsPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit product 0/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create new classification/i }));
    fireEvent.change(screen.getByLabelText(/classification name/i), {
      target: { value: "New Class" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(client.createClassification).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Class", product_ids: ["p0"] })
      )
    );
  });
});
