import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VTEXPublishPage } from "./VTEXPublishPage";
import type { PublishBatchResponse } from "@marketplace-central/sdk-runtime";

const mockPublish = vi.fn();
const mockListProducts = vi.fn();
const mockListTaxonomy = vi.fn();
const mockListClassifications = vi.fn();

const mockClient = {
  publishToVTEX: mockPublish,
  listCatalogProducts: mockListProducts,
  listTaxonomyNodes: mockListTaxonomy,
  listClassifications: mockListClassifications,
} as any;

const sampleProducts = [
  {
    product_id: "prod-1",
    sku: "SKU-001",
    name: "Test Product",
    description: "A test product",
    brand_name: "BrandX",
    status: "active",
    cost_amount: 60,
    price_amount: 100,
    stock_quantity: 10,
    ean: "7890000000001",
    reference: "REF-001",
    taxonomy_node_id: "tax-1",
    taxonomy_name: "Electronics",
    suggested_price: null,
    height_cm: null,
    width_cm: null,
    length_cm: null,
  },
];

const sampleTaxonomy = [
  { node_id: "tax-1", name: "Electronics", level: 1, level_label: "Department", product_count: 1 },
];

const sampleClassifications = [
  { classification_id: "cls-1", name: "Featured", product_ids: ["prod-1"], product_count: 1 },
];

function setupMocks() {
  mockListProducts.mockResolvedValue({ items: sampleProducts });
  mockListTaxonomy.mockResolvedValue({ items: sampleTaxonomy });
  mockListClassifications.mockResolvedValue({ items: sampleClassifications });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/connectors/vtex"]}>
      <Routes>
        <Route path="/connectors/vtex" element={<VTEXPublishPage client={mockClient} />} />
        <Route path="/connectors/vtex/batch/:id" element={<div>Batch Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const successResponse: PublishBatchResponse = {
  batch_id: "batch-001",
  total_products: 1,
  validated: 1,
  rejected: 0,
  rejections: [],
};

describe("VTEXPublishPage", () => {
  beforeEach(() => {
    mockPublish.mockReset();
    mockListProducts.mockReset();
    mockListTaxonomy.mockReset();
    mockListClassifications.mockReset();
    setupMocks();
  });

  it("renders the heading and loads products", async () => {
    renderPage();
    expect(screen.getByText("VTEX Publisher")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());
  });

  it("renders VTEX configuration fields", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());
    expect(screen.getByLabelText(/vtex account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/trade policy id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/warehouse id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("shows validation error when vtex account is empty", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    expect(await screen.findByText(/vtex account is required/i)).toBeInTheDocument();
  });

  it("shows validation error when no products are selected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    expect(await screen.findByText(/select at least one product/i)).toBeInTheDocument();
  });

  it("calls publishToVTEX with mapped products on submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());

    // Select the product
    fireEvent.click(screen.getByLabelText(/select test product/i));

    // Fill VTEX account
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(mockPublish).toHaveBeenCalledWith({
        vtex_account: "mystore",
        products: [
          expect.objectContaining({
            product_id: "prod-1",
            name: "Test Product",
            description: "A test product",
            brand: "BrandX",
            category: "Electronics",
            cost: 60,
            base_price: 100,
            stock_qty: 10,
            warehouse_id: "1_1",
            trade_policy_id: "1",
          }),
        ],
      }),
    );
  });

  it("shows batch result after successful submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    await waitFor(() => expect(screen.getByText("Test Product")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/select test product/i));
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => expect(screen.getByText(/batch created/i)).toBeInTheDocument());
    expect(screen.getByText("batch-001")).toBeInTheDocument();
  });
});
