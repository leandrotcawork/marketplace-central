import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarketplaceSettingsPage } from "./MarketplaceSettingsPage";
import type { MarketplaceAccount, MarketplaceDefinition, MarketplacePolicy } from "@marketplace-central/sdk-runtime";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockListAccounts    = vi.fn();
const mockCreateAccount   = vi.fn();
const mockListPolicies    = vi.fn();
const mockCreatePolicy    = vi.fn();
const mockListDefinitions = vi.fn();

const mockClient = {
  listMarketplaceAccounts:  mockListAccounts,
  createMarketplaceAccount: mockCreateAccount,
  listMarketplacePolicies:  mockListPolicies,
  createMarketplacePolicy:  mockCreatePolicy,
  listMarketplaceDefinitions: mockListDefinitions,
} as any;

const sampleAccount: MarketplaceAccount = {
  account_id: "acc-1",
  tenant_id: "t1",
  channel_code: "vtex",
  marketplace_code: "vtex",
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

const vtexDefinition = {
  code: "vtex",
  display_name: "VTEX",
  auth_strategy: "api_key",
  is_active: true,
  capability_profile: {},
  metadata: {},
} as unknown as MarketplaceDefinition;

beforeEach(() => {
  mockListAccounts.mockReset();
  mockCreateAccount.mockReset();
  mockListPolicies.mockReset();
  mockCreatePolicy.mockReset();
  mockListDefinitions.mockReset();
  mockListDefinitions.mockResolvedValue({ items: [vtexDefinition] });
});

describe("MarketplaceSettingsPage", () => {
  it("renders account card after load", async () => {
    mockListAccounts.mockResolvedValue({ items: [sampleAccount] });
    mockListPolicies.mockResolvedValue({ items: [samplePolicy] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText("My Store")).toBeInTheDocument());
    // Policy snapshot shown on card
    expect(screen.getByText("16.0%")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });

  it("shows empty state when no accounts", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() =>
      expect(screen.getByText(/no marketplaces connected/i)).toBeInTheDocument()
    );
  });

  it("shows error banner when data load fails", async () => {
    mockListAccounts.mockRejectedValue({ error: { message: "Connection refused" } });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() =>
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument()
    );
  });

  it("opens create panel when Connect Marketplace button clicked", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => screen.getByText(/no marketplaces connected/i));

    fireEvent.click(screen.getAllByRole("button", { name: /connect marketplace/i })[0]);

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /account settings/i })).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it("opens view panel when account card clicked", async () => {
    mockListAccounts.mockResolvedValue({ items: [sampleAccount] });
    mockListPolicies.mockResolvedValue({ items: [samplePolicy] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => screen.getByText("My Store"));

    fireEvent.click(screen.getByText("My Store").closest("div")!);

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /account settings/i })).toBeInTheDocument()
    );
    // Shows account_id in panel header
    expect(screen.getAllByText(/acc-1/).length).toBeGreaterThan(0);
  });

  it("calls createMarketplaceAccount on Connect submit", async () => {
    mockListAccounts
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [sampleAccount] });
    mockListPolicies.mockResolvedValue({ items: [] });
    mockCreateAccount.mockResolvedValue(sampleAccount);

    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => screen.getByText(/no marketplaces connected/i));

    fireEvent.click(screen.getAllByRole("button", { name: /connect marketplace/i })[0]);
    await waitFor(() => screen.getByLabelText(/display name/i));

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "My Store" },
    });

    // The definitions dropdown uses "code" field (SDK type), not "marketplace_code"
    // The panel renders options from shapedDefinitions which maps code → marketplace_code
    // We just need to trigger a change — the option value is whatever the definition's code maps to
    const dropdown = screen.getByRole("combobox", { name: /marketplace/i });
    fireEvent.change(dropdown, { target: { value: dropdown.querySelector("option:not([value=''])")?.getAttribute("value") ?? "vtex" } });

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(mockCreateAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: "My Store",
        })
      )
    );
  });

  it("closes panel when X is clicked", async () => {
    mockListAccounts.mockResolvedValue({ items: [sampleAccount] });
    mockListPolicies.mockResolvedValue({ items: [samplePolicy] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => screen.getByText("My Store"));

    fireEvent.click(screen.getByText("My Store").closest("div")!);
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows both active and inactive accounts from API", async () => {
    const inactiveAccount: MarketplaceAccount = {
      ...sampleAccount,
      account_id: "acc-2",
      marketplace_code: "vtex",
      display_name: "Inactive Store",
      status: "inactive",
    };
    mockListAccounts.mockResolvedValue({ items: [sampleAccount, inactiveAccount] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => screen.getByText("My Store"));
    // Both accounts rendered (page shows all, status is shown via badge)
    expect(screen.getByText("Inactive Store")).toBeInTheDocument();
  });
});
