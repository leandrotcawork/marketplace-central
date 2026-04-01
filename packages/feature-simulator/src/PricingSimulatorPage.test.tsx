import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingSimulatorPage } from "./PricingSimulatorPage";

describe("PricingSimulatorPage", () => {
  it("renders the simulator heading", () => {
    render(<PricingSimulatorPage />);
    expect(screen.getByRole("heading", { name: /pricing simulator/i })).toBeInTheDocument();
  });
});
