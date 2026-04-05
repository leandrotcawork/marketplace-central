import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type {
  CatalogProduct,
  TaxonomyNode,
  Classification,
  MarketplacePolicy,
  PricingSimulation,
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
  suggested_price: 25,
  height_cm: null,
  width_cm: null,
  length_cm: null,
});

const products: CatalogProduct[] = Array.from({ length: 60 }, (_, i) => makeProduct(i));

const policies: MarketplacePolicy[] = [
  {
    policy_id: "pol1",
    tenant_id: "t1",
    account_id: "acc1",
    commission_percent: 0.16,
    fixed_fee_amount: 0,
    default_shipping: 0,
    tax_percent: 0,
    min_margin_percent: 0.02,
    sla_question_minutes: 60,
    sla_dispatch_hours: 24,
  },
];

const mockSimResult: PricingSimulation = {
  simulation_id: "sim1",
  product_id: "p0",
  account_id: "acc1",
  base_price_amount: 20,
  cost_amount: 10,
  commission_amount: 3.2,
  fixed_fee_amount: 0,
  shipping_amount: 0,
  tax_amount: 0,
  margin_amount: 6.8,
  margin_percent: 0.34,
  status: "healthy",
  created_at: "",
};

function makeClient(overrides = {}) {
  return {
    listCatalogProducts: vi.fn().mockResolvedValue({ items: products }),
    listTaxonomyNodes: vi.fn().mockResolvedValue({ items: [] as TaxonomyNode[] }),
    listClassifications: vi.fn().mockResolvedValue({ items: [] as Classification[] }),
    listMarketplacePolicies: vi.fn().mockResolvedValue({ items: policies }),
    runPricingSimulation: vi.fn().mockResolvedValue(mockSimResult),
    ...overrides,
  };
}

describe("PricingSimulatorPage", () => {
  it("renders policy picker and Run button before table loads", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    expect(screen.getByLabelText(/marketplace policy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeInTheDocument();
  });

  it("renders only 25 products per page (not all 60)", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByText("Product 24")).toBeInTheDocument();
    expect(screen.queryByText("Product 25")).not.toBeInTheDocument();
  });

  it("Run Simulation is disabled until product + policy selected", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("Run Simulation enables after selecting product and policy", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    expect(screen.getByRole("button", { name: /run simulation/i })).not.toBeDisabled();
  });

  it("calls runPricingSimulation for each selected product", async () => {
    const client = makeClient();
    render(<PricingSimulatorPage client={client} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() =>
      expect(client.runPricingSimulation).toHaveBeenCalledWith(
        expect.objectContaining({ product_id: "p0", account_id: "acc1" })
      )
    );
  });

  it("shows inline simulation results in table after run", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getAllByText(/34\.0%/).length).toBeGreaterThan(0));
  });

  it("shows summary banner after simulation", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getByText(/1 product/i)).toBeInTheDocument());
    expect(screen.getByText(/avg margin/i)).toBeInTheDocument();
  });

  it("clears results when policy changes", async () => {
    render(<PricingSimulatorPage client={makeClient()} />);
    await waitFor(() => expect(screen.getByText("Product 0")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "pol1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /select product 0/i }));
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    await waitFor(() => expect(screen.getAllByText(/34\.0%/).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), { target: { value: "" } });
    expect(screen.queryByText(/34\.0%/)).not.toBeInTheDocument();
  });
});
