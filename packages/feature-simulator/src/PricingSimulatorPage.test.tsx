import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("clicking a classification pill selects all its products", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Ativos");
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("clicking classification pill twice deselects all its products", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await screen.findByText("Ativos");
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    expect(screen.queryByText(/2 selected/i)).not.toBeInTheDocument();
  });

  it("running simulation renders results and summary banner", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    expect(await screen.findByText(/marketplace cost/i)).toBeInTheDocument();
    expect(screen.getByText(/shipping/i)).toBeInTheDocument();
    expect(screen.getByText(/margin before shipping/i)).toBeInTheDocument();
    expect(screen.getByText(/final margin/i)).toBeInTheDocument();
  });

  it("shows grouped marketplace cost with commission rate", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);

    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    expect(await screen.findByText(/marketplace cost: r\$ .* \(16%\)/i)).toBeInTheDocument();
  });

  it("clears results when price reference switch changes after a run", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);

    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await screen.findByText(/avg margin/i);
    fireEvent.click(screen.getByRole("button", { name: /toggle price source/i }));
    expect(screen.queryByText(/avg margin/i)).not.toBeInTheDocument();
  });

  it("results show collapsed policy columns by default", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(client.runBatchSimulation).toHaveBeenCalledOnce());
    // Policy column should be collapsed — shows policy id but not "Commission"
    await screen.findByText("pol1");
    expect(screen.queryByText(/commission/i)).not.toBeInTheDocument();
  });

  it("expanding a policy column reveals detail columns", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await screen.findByText("Product SKU-001");
    fireEvent.change(screen.getByLabelText(/origin cep/i), { target: { value: "01310100" } });
    fireEvent.change(screen.getByLabelText(/destination cep/i), { target: { value: "30140071" } });
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await screen.findByText("pol1");
    fireEvent.click(screen.getByRole("button", { name: /expand pol1/i }));
    expect(await screen.findByText(/commission/i)).toBeInTheDocument();
    expect(screen.getByText(/freight/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /ativos/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    expect(await screen.findByText(/batch failed/i)).toBeInTheDocument();
  });
});
