import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VTEXPublishPage } from "./VTEXPublishPage";
import type { CatalogProduct, TaxonomyNode, Classification, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

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

const classifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "",
    product_ids: ["p0", "p1", "p2"],
    product_count: 3,
    created_at: "",
    updated_at: "",
  },
];

const batchResponse: PublishBatchResponse = {
  batch_id: "batch_abc",
  validated: 3,
  rejected: 0,
  rejections: [],
};

function makeClient(overrides = {}) {
  return {
    publishToVTEX: vi.fn().mockResolvedValue(batchResponse),
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] as TaxonomyNode[] }),
    listClassifications: vi.fn().mockResolvedValue({ items: classifications }),
    ...overrides,
  };
}

function renderPage(client = makeClient()) {
  return render(
    <MemoryRouter>
      <VTEXPublishPage client={client} />
    </MemoryRouter>
  );
}

describe("VTEXPublishPage", () => {
  it("shows VTEX account field and publish action", async () => {
    const client = makeClient();
    renderPage(client);
    expect(screen.getByLabelText(/vtex account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
  });

  it("renders only 25 products per page", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("publish button is disabled when no account entered", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });

  it("publish button is disabled when no products selected", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });

  it("selecting a product row checkbox enables publish when account is set", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    expect(screen.getByRole("button", { name: /publish/i })).not.toBeDisabled();
  });

  it("Load Classification auto-checks all products in classification", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/load classification/i), { target: { value: "cls1" } });
    await waitFor(() =>
      expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
    );
  });

  it("Select All Filtered selects all filtered products including off-page", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() =>
      expect(screen.getByText(/60 selected/i)).toBeInTheDocument()
    );
  });

  it("Clear All deselects all products", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() => expect(screen.getByText(/60 selected/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.queryByText(/60 selected/i)).not.toBeInTheDocument();
  });

  it("calls publishToVTEX with selected products", async () => {
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await waitFor(() =>
      expect(client.publishToVTEX).toHaveBeenCalledWith(
        expect.objectContaining({
          vtex_account: "mystore",
          products: expect.arrayContaining([expect.objectContaining({ product_id: "p0" })]),
        })
      )
    );
  });

  it("shows success banner after publish", async () => {
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await waitFor(() =>
      expect(screen.getByText(/batch created/i)).toBeInTheDocument()
    );
  });
});
