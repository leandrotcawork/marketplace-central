// packages/feature-marketplaces/src/AccountCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AccountCard } from "./AccountCard";
import type { MarketplaceAccount, MarketplacePolicy } from "@marketplace-central/sdk-runtime";

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

describe("AccountCard", () => {
  it("renders display name and account id", () => {
    render(<AccountCard account={account} policy={null} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("My VTEX Store")).toBeInTheDocument();
    expect(screen.getByText(/acc-1/)).toBeInTheDocument();
  });

  it("shows policy commission and margin when policy exists", () => {
    render(<AccountCard account={account} policy={policy} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("16.0%")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });

  it("shows configure link when policy is null", () => {
    render(<AccountCard account={account} policy={null} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/configure policy/i)).toBeInTheDocument();
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<AccountCard account={account} policy={null} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("My VTEX Store").closest("div")!);
    expect(onSelect).toHaveBeenCalledWith(account);
  });

  it("applies selected border when selected=true", () => {
    const { container } = render(
      <AccountCard account={account} policy={null} selected={true} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toHaveClass("border-blue-500");
  });
});
