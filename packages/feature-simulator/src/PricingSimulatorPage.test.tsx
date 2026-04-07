import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type { SimulatorClient } from "./PricingSimulatorPage";

const makeProduct = (id: string, sku: string) => ({
  product_id: id, sku, name: `Product ${sku}`,
  description: "", brand_name: "", status: "active",
  cost_amount: 80, price_amount: 150, stock_quantity: 10,
  ean: "", reference: "", taxonomy_node_id: "t1", taxonomy_name: "Category",
  suggested_price: null, height_cm: 10, width_cm: 15, length_cm: 20, weight_g: 500,
});

const makePolicy = (id: string) => ({
  policy_id: id, tenant_id: "t1", account_id: "acc1",
  commission_percent: 0.16, fixed_fee_amount: 0,
  default_shipping: 20, tax_percent: 0, min_margin_percent: 0.10,
  sla_question_minutes: 60, sla_dispatch_hours: 24, shipping_provider: "fixed",
});

const makeClassification = (id: string, name: string, productIds: string[]) => ({
  classification_id: id, tenant_id: "t1", name,
  ai_context: "", product_ids: productIds, product_count: productIds.length,
  created_at: "", updated_at: "",
});

const makeBatchItem = (productId: string, policyId: string) => ({
  product_id: productId, policy_id: policyId,
  selling_price: 150, cost_amount: 80, commission_amount: 24,
  freight_amount: 20, fixed_fee_amount: 0,
  margin_amount: 26, margin_percent: 0.1733, status: "healthy",
  freight_source: "fixed",
});

function makeClient(overrides: Partial<SimulatorClient> = {}): SimulatorClient {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: [makeProduct("p1", "SKU-001"), makeProduct("p2", "SKU-002")] }),
    listClassifications: vi.fn().mockResolvedValue({ items: [makeClassification("cls1", "Ativos", ["p1", "p2"])] }),
    listMarketplacePolicies: vi.fn().mockResolvedValue({ items: [makePolicy("pol1")] }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] }),
    runBatchSimulation: vi.fn().mockResolvedValue({ items: [makeBatchItem("p1", "pol1"), makeBatchItem("p2", "pol1")] }),
    getMelhorEnvioStatus: vi.fn().mockResolvedValue({ connected: false }),
    ...overrides,
  };
}

describe("PricingSimulatorPage", () => {
  it("renders command bar with CEP inputs and Run button disabled initially", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    expect(screen.getByLabelText(/origin cep/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination cep/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run button stays disabled when no products are selected", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run button enables when products selected and CEPs filled", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    expect(screen.getByRole("button", { name: /run simulation/i })).not.toBeDisabled();
  });

  it("clicking a classification pill filters the table to its products without selecting them", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockResolvedValue({
        items: [makeProduct("p1", "SKU-001"), makeProduct("p2", "SKU-002"), makeProduct("p3", "SKU-OUT")],
      }),
      listClassifications: vi.fn().mockResolvedValue({ items: [makeClassification("cls1", "Ativos", ["p1", "p2"])] }),
    });
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    expect(screen.getByText("Product SKU-OUT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));

    expect(screen.queryByText("Product SKU-OUT")).not.toBeInTheDocument();
    expect(screen.getByText("Product SKU-001")).toBeInTheDocument();
    expect(screen.getByText("Product SKU-002")).toBeInTheDocument();
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it("clicking classification pill twice removes the filter", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockResolvedValue({
        items: [makeProduct("p1", "SKU-001"), makeProduct("p2", "SKU-002"), makeProduct("p3", "SKU-OUT")],
      }),
      listClassifications: vi.fn().mockResolvedValue({ items: [makeClassification("cls1", "Ativos", ["p1", "p2"])] }),
    });
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-OUT");
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.queryByText("Product SKU-OUT")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.getByText("Product SKU-OUT")).toBeInTheDocument();
  });

  it("running simulation renders results and summary banner", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-002/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    expect(await screen.findByText(/avg/i)).toBeInTheDocument();
    expect(await screen.findByText(/healthy:\s*2/i)).toBeInTheDocument();
  });

  it("renders marketplace comparison cards after simulation run", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);

    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-002/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    expect(screen.getByRole("columnheader", { name: /pol1/i })).toBeInTheDocument();
    const firstCard = screen.getByRole("textbox", { name: /selling price sku-001 pol1/i }).closest("td");
    expect(firstCard).not.toBeNull();
    const card = within(firstCard as HTMLElement);
    expect(card.getByText(/^Custo/i)).toBeInTheDocument();
    expect(card.getByText(/^Comissao/i)).toBeInTheDocument();
    expect(card.getByText(/^Taxa fixa/i)).toBeInTheDocument();
    expect(card.getByText(/^Frete/i)).toBeInTheDocument();
    expect(card.getByText(/^Margem/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /expand pol1/i })).not.toBeInTheDocument();
  });

  it("shows grouped marketplace cost with commission rate", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);

    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-002/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    const firstCard = screen.getByRole("textbox", { name: /selling price sku-001 pol1/i }).closest("td");
    expect(firstCard).not.toBeNull();
    const cardText = (firstCard as HTMLElement).textContent?.replace(/\s+/g, " ").trim();
    expect(cardText).toContain("ComissaoR$ 24.00 (16.0%)");
    expect(cardText).toContain("Taxa fixaR$ 0.00");
  });

  it("shows load error when data fetch fails", async () => {
    const client = makeClient({
      listCatalogProducts: vi.fn().mockRejectedValue(new Error("network error")),
    });
    render(<PricingSimulatorPage client={client} />);
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows run error when batch simulation fails", async () => {
    const client = makeClient({
      runBatchSimulation: vi.fn().mockRejectedValue({ error: { message: "batch failed" } }),
    });
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-001/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select product sku-002/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    expect(await screen.findByText(/batch failed/i)).toBeInTheDocument();
  });
});
