import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "./AppRouter";

vi.mock("./ClientContext", () => ({
  useClient: () => ({ mocked: true }),
}));

vi.mock("@marketplace-central/feature-integrations", () => ({
  IntegrationsHubPage: () => <div>Integrations hub route</div>,
}));

describe("AppRouter", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/integrations");
  });

  it("renders the integrations route", async () => {
    render(<AppRouter />);
    expect(await screen.findByText("Integrations hub route")).toBeInTheDocument();
  });
});
