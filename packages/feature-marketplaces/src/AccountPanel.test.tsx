import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccountPanel } from "./AccountPanel";
import type { MarketplaceAccount, MarketplaceDefinition, MarketplacePolicy } from "@marketplace-central/sdk-runtime";

const account: MarketplaceAccount = {
  account_id: "acc-1",
  tenant_id: "t1",
  channel_code: "vtex",
  display_name: "My VTEX Store",
  status: "active",
  connection_mode: "api",
};

const policy: MarketplacePolicy = {
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

const definition: MarketplaceDefinition = {
  marketplace_code: "vtex",
  display_name: "VTEX",
  fee_source: "api_sync",
  capabilities: [],
  credential_schema: [{ key: "api_key", label: "API Key", secret: true }],
  active: true,
} as any;

const noop = vi.fn();

describe("AccountPanel — view mode", () => {
  it("renders account display name in header", () => {
    render(
      <AccountPanel
        mode="view"
        account={account}
        policy={policy}
        definition={definition}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    expect(screen.getByText("My VTEX Store")).toBeInTheDocument();
  });

  it("renders account_id in header", () => {
    render(
      <AccountPanel
        mode="view"
        account={account}
        policy={policy}
        definition={definition}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    expect(screen.getByText(/acc-1/)).toBeInTheDocument();
  });

  it("shows commission in policy section when policy exists", () => {
    render(
      <AccountPanel
        mode="view"
        account={account}
        policy={policy}
        definition={definition}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    // Policy values shown as read-only
    expect(screen.getByDisplayValue("0.16")).toBeInTheDocument();
  });

  it("calls onClose when X button clicked", () => {
    const onClose = vi.fn();
    render(
      <AccountPanel
        mode="view"
        account={account}
        policy={null}
        definition={definition}
        definitions={[definition]}
        onClose={onClose}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AccountPanel — create mode", () => {
  it("renders Display Name input in create mode", () => {
    render(
      <AccountPanel
        mode="create"
        account={null}
        policy={null}
        definition={null}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it("shows marketplace dropdown in create mode", () => {
    render(
      <AccountPanel
        mode="create"
        account={null}
        policy={null}
        definition={null}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    expect(screen.getByRole("combobox", { name: /marketplace/i })).toBeInTheDocument();
  });

  it("shows credential fields when marketplace selected", async () => {
    render(
      <AccountPanel
        mode="create"
        account={null}
        policy={null}
        definition={null}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={noop}
        onCreatePolicy={noop}
      />
    );
    fireEvent.change(screen.getByRole("combobox", { name: /marketplace/i }), {
      target: { value: "vtex" },
    });
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toBeInTheDocument());
  });

  it("calls onCreateAccount and onCreatePolicy on Connect submit", async () => {
    const onCreateAccount = vi.fn().mockResolvedValue({
      ...account,
      account_id: "acc-new",
    });
    const onCreatePolicy = vi.fn().mockResolvedValue(policy);

    render(
      <AccountPanel
        mode="create"
        account={null}
        policy={null}
        definition={null}
        definitions={[definition]}
        onClose={noop}
        onCreateAccount={onCreateAccount}
        onCreatePolicy={onCreatePolicy}
      />
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByRole("combobox", { name: /marketplace/i }), {
      target: { value: "vtex" },
    });
    await waitFor(() => screen.getByLabelText(/api key/i));
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "secret" } });

    // Fill in a commission so policy gets created
    fireEvent.change(screen.getByLabelText(/commission/i), { target: { value: "0.16" } });

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => expect(onCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "My Store",
        channel_code: "vtex",
        marketplace_code: "vtex",
        credentials_json: { api_key: "secret" },
      })
    ));
    await waitFor(() => expect(onCreatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-new",
        commission_percent: 0.16,
      })
    ));
  });
});
