import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type {
  CatalogProduct,
  MarketplacePolicy,
  PricingSimulation,
} from "@marketplace-central/sdk-runtime";
import type { TaxonomyNode, Classification } from "@marketplace-central/ui";
import { vi, describe, it, expect, beforeEach } from "vitest";

/* ── Mock data ── */

const mockProducts: CatalogProduct[] = [
  {
    product_id: "prod-1",
    sku: "SKU-001",
    name: "Steel Bolt M8",
    description: "High-grade steel bolt",
    brand_name: "MetalPro",
    status: "active",
    cost_amount: 5.0,
    price_amount: 12.0,
    stock_quantity: 500,
    ean: "7891234567890",
    reference: "REF-001",
    taxonomy_node_id: "node-1",
    taxonomy_name: "Fasteners",
    suggested_price: 14.5,
    height_cm: null,
    width_cm: null,
    length_cm: null,
  },
  {
    product_id: "prod-2",
    sku: "SKU-002",
    name: "Hex Nut M8",
    description: "Hex nut for M8 bolt",
    brand_name: "MetalPro",
    status: "active",
    cost_amount: 2.0,
    price_amount: 5.0,
    stock_quantity: 1000,
    ean: "7891234567891",
    reference: "REF-002",
    taxonomy_node_id: "node-1",
    taxonomy_name: "Fasteners",
    suggested_price: null,
    height_cm: null,
    width_cm: null,
    length_cm: null,
  },
];

const mockTaxonomy: TaxonomyNode[] = [
  {
    node_id: "node-1",
    name: "Fasteners",
    level: 1,
    level_label: "Category",
    product_count: 2,
  },
];

const mockClassifications: Classification[] = [
  {
    classification_id: "cls-1",
    name: "High-rotation",
    product_ids: ["prod-1"],
    product_count: 1,
  },
];

const mockPolicies: MarketplacePolicy[] = [
  {
    policy_id: "pol-vtex-main",
    tenant_id: "t1",
    account_id: "acc-vtex",
    commission_percent: 0.16,
    fixed_fee_amount: 5.0,
    default_shipping: 10.0,
    tax_percent: 0.0,
    min_margin_percent: 0.10,
    sla_question_minutes: 60,
    sla_dispatch_hours: 48,
  },
];

const successSim: PricingSimulation = {
  simulation_id: "sim-1",
  tenant_id: "t1",
  product_id: "prod-1",
  account_id: "acc-vtex",
  margin_amount: 1.58,
  margin_percent: 0.155,
  status: "healthy",
};

/* ── Mocks ── */

const mockListCatalogProducts = vi.fn();
const mockListTaxonomyNodes = vi.fn();
const mockListClassifications = vi.fn();
const mockListMarketplacePolicies = vi.fn();
const mockRunPricingSimulation = vi.fn();

const mockClient = {
  listCatalogProducts: mockListCatalogProducts,
  listTaxonomyNodes: mockListTaxonomyNodes,
  listClassifications: mockListClassifications,
  listMarketplacePolicies: mockListMarketplacePolicies,
  runPricingSimulation: mockRunPricingSimulation,
} as any;

function setupDefaultMocks() {
  mockListCatalogProducts.mockResolvedValue({ items: mockProducts });
  mockListTaxonomyNodes.mockResolvedValue({ items: mockTaxonomy });
  mockListClassifications.mockResolvedValue({ items: mockClassifications });
  mockListMarketplacePolicies.mockResolvedValue({ items: mockPolicies });
}

/* ── Tests ── */

describe("PricingSimulatorPage", () => {
  beforeEach(() => {
    mockListCatalogProducts.mockReset();
    mockListTaxonomyNodes.mockReset();
    mockListClassifications.mockReset();
    mockListMarketplacePolicies.mockReset();
    mockRunPricingSimulation.mockReset();
  });

  it("renders heading and loads data on mount", async () => {
    setupDefaultMocks();
    render(<PricingSimulatorPage client={mockClient} />);

    expect(screen.getByText("Pricing Simulator")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockListCatalogProducts).toHaveBeenCalledTimes(1);
      expect(mockListMarketplacePolicies).toHaveBeenCalledTimes(1);
    });
  });

  it("shows product picker with loaded products", async () => {
    setupDefaultMocks();
    render(<PricingSimulatorPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Steel Bolt M8")).toBeInTheDocument();
      expect(screen.getByText("Hex Nut M8")).toBeInTheDocument();
    });
  });

  it("shows policy dropdown with loaded policies", async () => {
    setupDefaultMocks();
    render(<PricingSimulatorPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/marketplace policy/i)).toBeInTheDocument();
    });

    const dropdown = screen.getByLabelText(/marketplace policy/i) as HTMLSelectElement;
    expect(dropdown.options.length).toBe(2); // placeholder + 1 policy
  });

  it("runs simulation for selected product and policy", async () => {
    setupDefaultMocks();
    mockRunPricingSimulation.mockResolvedValueOnce(successSim);

    render(<PricingSimulatorPage client={mockClient} />);

    // Wait for data
    await waitFor(() => {
      expect(screen.getByText("Steel Bolt M8")).toBeInTheDocument();
    });

    // Select a product
    const checkbox = screen.getByLabelText("Select Steel Bolt M8");
    fireEvent.click(checkbox);

    // Select a policy
    const dropdown = screen.getByLabelText(/marketplace policy/i);
    fireEvent.change(dropdown, { target: { value: "pol-vtex-main" } });

    // Run simulation
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => {
      expect(mockRunPricingSimulation).toHaveBeenCalledTimes(1);
    });

    // Verify simulation request
    const req = mockRunPricingSimulation.mock.calls[0][0];
    expect(req.product_id).toBe("prod-1");
    expect(req.account_id).toBe("acc-vtex");
    expect(req.base_price_amount).toBe(12.0); // my price
    expect(req.cost_amount).toBe(5.0);
    expect(req.commission_percent).toBe(0.16);

    // Verify result row appears
    await waitFor(() => {
      expect(screen.getByText("15.5%")).toBeInTheDocument();
      expect(screen.getByText("healthy")).toBeInTheDocument();
    });
  });

  it("shows load error when data fetching fails", async () => {
    mockListCatalogProducts.mockRejectedValue({ error: { message: "Network timeout" } });
    mockListTaxonomyNodes.mockRejectedValue({ error: { message: "Network timeout" } });
    mockListClassifications.mockRejectedValue({ error: { message: "Network timeout" } });
    mockListMarketplacePolicies.mockRejectedValue({ error: { message: "Network timeout" } });

    render(<PricingSimulatorPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeInTheDocument();
    });
  });

  it("shows simulation error when run fails", async () => {
    setupDefaultMocks();
    mockRunPricingSimulation.mockRejectedValueOnce({
      error: { message: "Invalid margin configuration" },
    });

    render(<PricingSimulatorPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Steel Bolt M8")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Select Steel Bolt M8"));
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), {
      target: { value: "pol-vtex-main" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid margin configuration/i)).toBeInTheDocument();
    });
  });

  it("uses suggested price when toggle is active", async () => {
    setupDefaultMocks();
    mockRunPricingSimulation.mockResolvedValueOnce(successSim);

    render(<PricingSimulatorPage client={mockClient} />);

    await waitFor(() => {
      expect(screen.getByText("Steel Bolt M8")).toBeInTheDocument();
    });

    // Toggle to suggested price
    fireEvent.click(screen.getByLabelText(/toggle price source/i));

    // Select product and policy
    fireEvent.click(screen.getByLabelText("Select Steel Bolt M8"));
    fireEvent.change(screen.getByLabelText(/marketplace policy/i), {
      target: { value: "pol-vtex-main" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));

    await waitFor(() => {
      expect(mockRunPricingSimulation).toHaveBeenCalledTimes(1);
    });

    const req = mockRunPricingSimulation.mock.calls[0][0];
    // prod-1 has suggested_price=14.5, so it should use that
    expect(req.base_price_amount).toBe(14.5);
  });
});
