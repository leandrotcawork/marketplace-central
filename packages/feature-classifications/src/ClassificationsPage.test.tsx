import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClassificationsPage } from "./ClassificationsPage";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
} from "@marketplace-central/sdk-runtime";

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

const existingClassifications: Classification[] = [
  {
    classification_id: "cls1",
    name: "VTEX Ready",
    ai_context: "Products ready for VTEX",
    product_ids: ["p0", "p1", "p2"],
    product_count: 3,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  {
    classification_id: "cls2",
    name: "Clearance",
    ai_context: "",
    product_ids: ["p5"],
    product_count: 1,
    created_at: "2026-04-02T00:00:00Z",
    updated_at: "2026-04-02T00:00:00Z",
  },
];

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: taxonomyNodes }),
    listClassifications: vi.fn().mockResolvedValue({ items: existingClassifications }),
    createClassification: vi.fn().mockResolvedValue({
      classification_id: "cls3",
      name: "New One",
      ai_context: "",
      product_ids: ["p10"],
      product_count: 1,
      created_at: "",
      updated_at: "",
    }),
    updateClassification: vi.fn().mockResolvedValue({}),
    deleteClassification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ClassificationsPage", () => {
  it("renders classification list after loading", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    expect(screen.getByText("Clearance")).toBeInTheDocument();
  });

  it("shows empty state when no classification is selected", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    expect(screen.getByText(/select a classification/i)).toBeInTheDocument();
  });

  it("shows product table when classification is selected", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: /^select product 0$/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^select product 1$/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^select product 3$/i })).not.toBeChecked();
  });

  it("paginates products at 25 per page", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("calls updateClassification when product checkbox toggled", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 3/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.arrayContaining(["p0", "p1", "p2", "p3"]),
      }))
    );
  });

  it("calls updateClassification when product unchecked", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.not.arrayContaining(["p0"]),
      }))
    );
  });

  it("creates new classification on first product check", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new classification/i }));
    const nameInput = await screen.findByLabelText(/classification name/i);
    fireEvent.change(nameInput, { target: { value: "New One" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 10/i }));
    await waitFor(() =>
      expect(client.createClassification).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New One", product_ids: ["p10"] })
      )
    );
  });

  it("deletes classification when trash icon clicked and confirmed", async () => {
    const client = makeClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /delete vtex ready/i }));
    await waitFor(() =>
      expect(client.deleteClassification).toHaveBeenCalledWith("cls1")
    );
    expect(screen.queryByText("VTEX Ready")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("select all filtered adds all filtered products to classification", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /select all filtered/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: expect.arrayContaining(["p0", "p1", "p2", "p59"]),
      }))
    );
  });

  it("clear all removes all products from classification", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        product_ids: [],
      }))
    );
  });

  it("saves name on blur", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    const nameInput = await screen.findByLabelText(/classification name/i);
    fireEvent.change(nameInput, { target: { value: "VTEX Premium" } });
    fireEvent.blur(nameInput);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        name: "VTEX Premium",
      }))
    );
  });

  it("saves ai_context on blur", async () => {
    const client = makeClient();
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    const contextInput = await screen.findByLabelText(/ai context/i);
    fireEvent.change(contextInput, { target: { value: "Updated context" } });
    fireEvent.blur(contextInput);
    await waitFor(() =>
      expect(client.updateClassification).toHaveBeenCalledWith("cls1", expect.objectContaining({
        ai_context: "Updated context",
      }))
    );
  });

  it("shows error when load fails", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockRejectedValue({ error: { message: "Network error" } }),
    });
    render(<ClassificationsPage client={client} />);
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("discards unsaved draft when selecting existing classification", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new classification/i }));
    expect(screen.getByText("Untitled")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clearance"));
    expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
  });

  it("filters products by search text", async () => {
    render(<ClassificationsPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("VTEX Ready")).toBeInTheDocument());
    fireEvent.click(screen.getByText("VTEX Ready"));
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: "Product 5" } });
    expect(screen.queryByText("Product 0")).not.toBeInTheDocument();
    expect(screen.getByText("Product 5")).toBeInTheDocument();
  });
});
