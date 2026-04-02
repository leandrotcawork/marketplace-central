import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type { PricingSimulation } from "@marketplace-central/sdk-runtime";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockRun = vi.fn();
const mockClient = { runPricingSimulation: mockRun } as any;

const successSim: PricingSimulation = {
  simulation_id: "sim-1",
  tenant_id: "t1",
  product_id: "prod-1",
  account_id: "acc-1",
  margin_amount: 15.5,
  margin_percent: 15.5,
  status: "completed",
};

describe("PricingSimulatorPage", () => {
  beforeEach(() => mockRun.mockReset());

  it("renders simulation form", () => {
    render(<PricingSimulatorPage client={mockClient} />);
    expect(screen.getByLabelText(/product id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base price/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simulate/i })).toBeInTheDocument();
  });

  it("shows margin percent result after successful simulation", async () => {
    mockRun.mockResolvedValueOnce(successSim);
    render(<PricingSimulatorPage client={mockClient} />);

    fireEvent.change(screen.getByLabelText(/product id/i), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText(/account id/i), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText(/base price/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/cost/i), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/commission/i), { target: { value: "0.16" } });
    fireEvent.change(screen.getByLabelText(/fixed fee/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/shipping/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/min margin/i), { target: { value: "0.10" } });
    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() => expect(screen.getByText("15.5%")).toBeInTheDocument());
  });

  it("shows API error when simulation fails", async () => {
    mockRun.mockRejectedValueOnce({ error: { message: "Invalid margin configuration" } });
    render(<PricingSimulatorPage client={mockClient} />);

    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));
    await waitFor(() => expect(screen.getByText(/invalid margin configuration/i)).toBeInTheDocument());
  });
});
