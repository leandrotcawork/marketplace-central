import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarketplaceSettingsPage } from "./MarketplaceSettingsPage";
import type { MarketplaceAccount, MarketplacePolicy } from "@marketplace-central/sdk-runtime";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockListAccounts = vi.fn();
const mockCreateAccount = vi.fn();
const mockListPolicies = vi.fn();
const mockCreatePolicy = vi.fn();

const mockClient = {
  listMarketplaceAccounts: mockListAccounts,
  createMarketplaceAccount: mockCreateAccount,
  listMarketplacePolicies: mockListPolicies,
  createMarketplacePolicy: mockCreatePolicy,
} as any;

const sampleAccount: MarketplaceAccount = {
  account_id: "acc-1",
  tenant_id: "t1",
  channel_code: "vtex",
  display_name: "My Store",
  status: "active",
  connection_mode: "api",
};

const samplePolicy: MarketplacePolicy = {
  policy_id: "pol-1",
  tenant_id: "t1",
  account_id: "acc-1",
  commission_percent: 0.16,
  fixed_fee_amount: 5,
  default_shipping: 10,
  tax_percent: 0,
  min_margin_percent: 0.1,
  sla_question_minutes: 60,
  sla_dispatch_hours: 24,
};

describe("MarketplaceSettingsPage", () => {
  beforeEach(() => {
    mockListAccounts.mockReset();
    mockCreateAccount.mockReset();
    mockListPolicies.mockReset();
    mockCreatePolicy.mockReset();
  });

  it("renders accounts and policies sections", async () => {
    mockListAccounts.mockResolvedValue({ items: [sampleAccount] });
    mockListPolicies.mockResolvedValue({ items: [samplePolicy] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText("My Store")).toBeInTheDocument());
    expect(screen.getByText(/pol-1/i)).toBeInTheDocument();
  });

  it("shows empty state when no accounts", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument());
  });

  it("calls createMarketplaceAccount on account form submit", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    mockCreateAccount.mockResolvedValue(sampleAccount);
    mockListAccounts.mockResolvedValue({ items: [sampleAccount] });

    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByLabelText(/account id/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/account id/i), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText(/channel code/i), { target: { value: "vtex" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/connection mode/i), { target: { value: "api" } });
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));

    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalledWith({
      account_id: "acc-1",
      channel_code: "vtex",
      display_name: "My Store",
      connection_mode: "api",
    }));
  });

  it("shows error state when data load fails", async () => {
    mockListAccounts.mockRejectedValue({ error: { message: "Connection refused" } });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText(/connection refused/i)).toBeInTheDocument());
  });
});
