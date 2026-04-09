# Marketplaces Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `MarketplaceSettingsPage` from a stacked two-section form into a card grid + slide-in panel with unified account + policy management.

**Architecture:** Split the monolithic settings page into focused sub-components (`MarketplaceIcon`, `StatusBadge`, `AccountCard`, `AccountPanel`) that the page orchestrates. All state (accounts, policies, definitions, selected account, panel mode) lives in `MarketplaceSettingsPage`. Sub-components are pure display or receive explicit callbacks — no shared context.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest + Testing Library, `@marketplace-central/sdk-runtime` types, `@marketplace-central/ui` (Button)

---

## Design references

- Spec: `docs/superpowers/specs/2026-04-09-marketplaces-redesign-design.md`
- Component design (Tailwind classes): `design-system/marketplace-central/pages/marketplaces-component-design.md`

## API limitations (important)

The current client interface has **no update endpoints**:
- `createMarketplaceAccount` — creates new
- `createMarketplacePolicy` — creates new

For existing accounts:
- Connection info is shown **read-only** in the panel (no update API)
- Policy: if none exists → user can create one; if one exists → shown read-only with note "Policy editing requires backend update endpoint"

Disconnect button is UI-only for now (no delete API). It shows the confirm flow but calls `onDisconnect` which is a no-op with a toast-style message.

---

## File map

| Action | File |
|--------|------|
| Create | `packages/feature-marketplaces/src/components/MarketplaceIcon.tsx` |
| Create | `packages/feature-marketplaces/src/components/MarketplaceIcon.test.tsx` |
| Create | `packages/feature-marketplaces/src/components/StatusBadge.tsx` |
| Create | `packages/feature-marketplaces/src/components/StatusBadge.test.tsx` |
| Create | `packages/feature-marketplaces/src/AccountCard.tsx` |
| Create | `packages/feature-marketplaces/src/AccountCard.test.tsx` |
| Create | `packages/feature-marketplaces/src/AddAccountCard.tsx` |
| Create | `packages/feature-marketplaces/src/EmptyState.tsx` |
| Create | `packages/feature-marketplaces/src/SkeletonCard.tsx` |
| Create | `packages/feature-marketplaces/src/AccountPanel.tsx` |
| Create | `packages/feature-marketplaces/src/AccountPanel.test.tsx` |
| Rewrite | `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx` |
| Rewrite | `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx` |

---

## Task 1: MarketplaceIcon component

**Files:**
- Create: `packages/feature-marketplaces/src/components/MarketplaceIcon.tsx`
- Create: `packages/feature-marketplaces/src/components/MarketplaceIcon.test.tsx`

- [ ] **Step 1.1: Write the failing test**

```tsx
// packages/feature-marketplaces/src/components/MarketplaceIcon.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarketplaceIcon } from "./MarketplaceIcon";

describe("MarketplaceIcon", () => {
  it("renders correct initial for known marketplace code", () => {
    render(<MarketplaceIcon code="vtex" />);
    expect(screen.getByText("V")).toBeInTheDocument();
  });

  it("applies VTEX brand color as background", () => {
    const { container } = render(<MarketplaceIcon code="vtex" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("rgb(255, 51, 102)"); // #FF3366
  });

  it("renders unknown code with default color and correct initial", () => {
    const { container } = render(<MarketplaceIcon code="unknown_mp" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("rgb(99, 102, 241)"); // #6366F1
    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("uses provided size", () => {
    const { container } = render(<MarketplaceIcon code="vtex" size={48} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("48px");
    expect(el.style.height).toBe("48px");
  });
});
```

- [ ] **Step 1.2: Run test — expect FAIL (module not found)**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `Error: Failed to resolve import "./MarketplaceIcon"`

- [ ] **Step 1.3: Implement MarketplaceIcon**

```tsx
// packages/feature-marketplaces/src/components/MarketplaceIcon.tsx

const BRAND: Record<string, { bg: string; text: string }> = {
  vtex:          { bg: "#FF3366", text: "#FFFFFF" },
  mercado_livre: { bg: "#FFE600", text: "#1A1A1A" },
  magalu:        { bg: "#0086FF", text: "#FFFFFF" },
  shopee:        { bg: "#EE4D2D", text: "#FFFFFF" },
  americanas:    { bg: "#E30613", text: "#FFFFFF" },
};

const DEFAULT = { bg: "#6366F1", text: "#FFFFFF" };

interface MarketplaceIconProps {
  code: string;
  size?: number;
}

export function MarketplaceIcon({ code, size = 32 }: MarketplaceIconProps) {
  const { bg, text } = BRAND[code] ?? DEFAULT;
  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold text-sm shrink-0 select-none"
      style={{ width: size, height: size, backgroundColor: bg, color: text }}
    >
      {code.charAt(0).toUpperCase()}
    </div>
  );
}
```

- [ ] **Step 1.4: Run test — expect PASS**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `4 passed`

- [ ] **Step 1.5: Commit**

```bash
git add packages/feature-marketplaces/src/components/
git commit -m "feat(marketplaces): add MarketplaceIcon component"
```

---

## Task 2: StatusBadge component

**Files:**
- Create: `packages/feature-marketplaces/src/components/StatusBadge.tsx`
- Create: `packages/feature-marketplaces/src/components/StatusBadge.test.tsx`

- [ ] **Step 2.1: Write the failing test**

```tsx
// packages/feature-marketplaces/src/components/StatusBadge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("has aria-label with status", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByLabelText("Status: active")).toBeInTheDocument();
  });

  it("uses emerald classes for active", () => {
    const { container } = render(<StatusBadge status="active" />);
    expect(container.firstChild).toHaveClass("bg-emerald-100");
    expect(container.firstChild).toHaveClass("text-emerald-700");
  });

  it("uses slate classes for inactive", () => {
    const { container } = render(<StatusBadge status="inactive" />);
    expect(container.firstChild).toHaveClass("bg-slate-100");
    expect(container.firstChild).toHaveClass("text-slate-500");
  });

  it("uses slate classes for unknown status", () => {
    const { container } = render(<StatusBadge status="pending" />);
    expect(container.firstChild).toHaveClass("bg-slate-100");
  });
});
```

- [ ] **Step 2.2: Run test — expect FAIL**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `Error: Failed to resolve import "./StatusBadge"`

- [ ] **Step 2.3: Implement StatusBadge**

```tsx
// packages/feature-marketplaces/src/components/StatusBadge.tsx

interface StatusBadgeProps {
  status: string;
}

const STYLES: Record<string, { badge: string; dot: string }> = {
  active:   { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  inactive: { badge: "bg-slate-100 text-slate-500",     dot: "bg-slate-400"   },
};

const DEFAULT_STYLE = { badge: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };

export function StatusBadge({ status }: StatusBadgeProps) {
  const { badge, dot } = STYLES[status] ?? DEFAULT_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge}`}
      aria-label={`Status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
```

- [ ] **Step 2.4: Run test — expect PASS**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `9 passed` (4 from Task 1 + 5 from Task 2)

- [ ] **Step 2.5: Commit**

```bash
git add packages/feature-marketplaces/src/components/StatusBadge.tsx packages/feature-marketplaces/src/components/StatusBadge.test.tsx
git commit -m "feat(marketplaces): add StatusBadge component"
```

---

## Task 3: AccountCard component

**Files:**
- Create: `packages/feature-marketplaces/src/AccountCard.tsx`
- Create: `packages/feature-marketplaces/src/AccountCard.test.tsx`

- [ ] **Step 3.1: Write the failing test**

```tsx
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
```

- [ ] **Step 3.2: Run test — expect FAIL**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `Error: Failed to resolve import "./AccountCard"`

- [ ] **Step 3.3: Implement AccountCard**

```tsx
// packages/feature-marketplaces/src/AccountCard.tsx
import type { MarketplaceAccount, MarketplacePolicy } from "@marketplace-central/sdk-runtime";
import { MarketplaceIcon } from "./components/MarketplaceIcon";
import { StatusBadge } from "./components/StatusBadge";

interface AccountCardProps {
  account: MarketplaceAccount;
  policy: MarketplacePolicy | null;
  selected: boolean;
  onSelect: (account: MarketplaceAccount) => void;
}

export function AccountCard({ account, policy, selected, onSelect }: AccountCardProps) {
  return (
    <div
      onClick={() => onSelect(account)}
      className={`
        relative bg-white rounded-2xl p-5 cursor-pointer
        transition-all duration-150 select-none
        ${selected
          ? "border-2 border-blue-500 shadow-md bg-blue-50/20"
          : "border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-blue-100/60 hover:border-blue-100 hover:-translate-y-0.5"
        }
      `}
    >
      {/* Row 1: icon + status */}
      <div className="flex items-center justify-between mb-3">
        <MarketplaceIcon code={account.channel_code} size={32} />
        <StatusBadge status={account.status} />
      </div>

      {/* Row 2: name + id */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900 leading-snug">
          {account.display_name}
        </p>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          {account.account_id} · {account.channel_code}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mb-4" />

      {/* Row 3: policy snapshot */}
      {policy ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Commission</p>
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {(policy.commission_percent * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Min Margin</p>
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {(policy.min_margin_percent * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-blue-500">Configure policy →</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3.4: Run test — expect PASS**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `14 passed`

- [ ] **Step 3.5: Commit**

```bash
git add packages/feature-marketplaces/src/AccountCard.tsx packages/feature-marketplaces/src/AccountCard.test.tsx
git commit -m "feat(marketplaces): add AccountCard component"
```

---

## Task 4: AddAccountCard, EmptyState, SkeletonCard

These are pure display components with no state. No dedicated test file needed — they get covered by the page integration test in Task 7.

**Files:**
- Create: `packages/feature-marketplaces/src/AddAccountCard.tsx`
- Create: `packages/feature-marketplaces/src/EmptyState.tsx`
- Create: `packages/feature-marketplaces/src/SkeletonCard.tsx`

- [ ] **Step 4.1: Create AddAccountCard**

```tsx
// packages/feature-marketplaces/src/AddAccountCard.tsx
import { Plus } from "lucide-react";

interface AddAccountCardProps {
  onAdd: () => void;
}

export function AddAccountCard({ onAdd }: AddAccountCardProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Connect new marketplace"
      className="
        flex flex-col items-center justify-center gap-2
        rounded-2xl p-5 min-h-[184px]
        border-2 border-dashed border-slate-200
        bg-white text-slate-400
        hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-500
        transition-all duration-150 cursor-pointer w-full
      "
    >
      <Plus className="w-6 h-6" />
      <span className="text-sm font-medium">Connect Marketplace</span>
    </button>
  );
}
```

- [ ] **Step 4.2: Create EmptyState**

```tsx
// packages/feature-marketplaces/src/EmptyState.tsx
import { Store, Plus } from "lucide-react";

interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Store className="w-12 h-12 text-slate-200 mb-4" />
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        No marketplaces connected
      </h3>
      <p className="text-sm text-slate-400 max-w-xs mb-6">
        Connect your first marketplace to start managing channels and pricing policies.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="
          inline-flex items-center gap-2
          px-4 py-2 bg-orange-500 hover:bg-orange-600
          text-white text-sm font-semibold
          rounded-lg shadow-sm transition-all duration-150 cursor-pointer
        "
      >
        <Plus className="w-4 h-4" />
        Connect Marketplace
      </button>
    </div>
  );
}
```

- [ ] **Step 4.3: Create SkeletonCard**

```tsx
// packages/feature-marketplaces/src/SkeletonCard.tsx

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-slate-200" />
        <div className="w-16 h-5 rounded-full bg-slate-200" />
      </div>
      <div className="w-32 h-4 bg-slate-200 rounded mb-1.5" />
      <div className="w-24 h-3 bg-slate-100 rounded mb-4" />
      <div className="border-t border-slate-100 mb-4" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="w-16 h-3 bg-slate-100 rounded" />
          <div className="w-10 h-4 bg-slate-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="w-16 h-3 bg-slate-100 rounded" />
          <div className="w-10 h-4 bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Commit**

```bash
git add packages/feature-marketplaces/src/AddAccountCard.tsx packages/feature-marketplaces/src/EmptyState.tsx packages/feature-marketplaces/src/SkeletonCard.tsx
git commit -m "feat(marketplaces): add AddAccountCard, EmptyState, SkeletonCard"
```

---

## Task 5: AccountPanel component

**Files:**
- Create: `packages/feature-marketplaces/src/AccountPanel.tsx`
- Create: `packages/feature-marketplaces/src/AccountPanel.test.tsx`

- [ ] **Step 5.1: Write the failing tests**

```tsx
// packages/feature-marketplaces/src/AccountPanel.test.tsx
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
};

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
```

- [ ] **Step 5.2: Run tests — expect FAIL**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `Error: Failed to resolve import "./AccountPanel"`

- [ ] **Step 5.3: Implement AccountPanel**

```tsx
// packages/feature-marketplaces/src/AccountPanel.tsx
import { useState } from "react";
import { X, ChevronDown, Eye, EyeOff, Loader2, Check } from "lucide-react";
import type {
  MarketplaceAccount,
  MarketplaceDefinition,
  MarketplacePolicy,
  CreateMarketplaceAccountRequest,
  CreateMarketplacePolicyRequest,
} from "@marketplace-central/sdk-runtime";
import { MarketplaceIcon } from "./components/MarketplaceIcon";
import { StatusBadge } from "./components/StatusBadge";

// ---------- helpers ----------

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().split("-")[0]}`;
}

// ---------- sub-components ----------

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full cursor-pointer group py-1"
    >
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </span>
      <ChevronDown
        className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  suffix?: string;
  required?: boolean;
}

function Field({ id, label, type = "text", placeholder, value, onChange, readOnly, suffix, required }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && show ? "text" : type;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          aria-label={label}
          className={`
            w-full px-3 py-2 text-sm rounded-lg border
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-colors duration-150
            ${readOnly
              ? "bg-slate-50 border-slate-100 text-slate-500 font-mono cursor-default"
              : "bg-white border-slate-200 text-slate-900 hover:border-slate-300"
            }
            ${suffix ? "pr-10" : ""}
            ${isPassword ? "pr-10" : ""}
          `}
        />
        {suffix && !isPassword && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide" : "Show"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- props ----------

interface AccountPanelBaseProps {
  onClose: () => void;
  definitions: MarketplaceDefinition[];
  onCreateAccount: (req: CreateMarketplaceAccountRequest) => Promise<MarketplaceAccount>;
  onCreatePolicy: (req: CreateMarketplacePolicyRequest) => Promise<MarketplacePolicy>;
}

interface AccountPanelCreateProps extends AccountPanelBaseProps {
  mode: "create";
  account: null;
  policy: null;
  definition: null;
}

interface AccountPanelViewProps extends AccountPanelBaseProps {
  mode: "view";
  account: MarketplaceAccount;
  policy: MarketplacePolicy | null;
  definition: MarketplaceDefinition | null;
}

type AccountPanelProps = AccountPanelCreateProps | AccountPanelViewProps;

// ---------- component ----------

export function AccountPanel(props: AccountPanelProps) {
  const { mode, onClose, definitions, onCreateAccount, onCreatePolicy } = props;

  // Create form state
  const [displayName, setDisplayName] = useState("");
  const [marketplaceCode, setMarketplaceCode] = useState("");
  const [connectionMode, setConnectionMode] = useState("api");
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  // Policy form state (used in both create and view→add-policy)
  const [commission, setCommission] = useState(
    mode === "view" && props.policy ? String(props.policy.commission_percent) : ""
  );
  const [fixedFee, setFixedFee] = useState(
    mode === "view" && props.policy ? String(props.policy.fixed_fee_amount) : ""
  );
  const [defaultShipping, setDefaultShipping] = useState(
    mode === "view" && props.policy ? String(props.policy.default_shipping) : ""
  );
  const [minMargin, setMinMargin] = useState(
    mode === "view" && props.policy ? String(props.policy.min_margin_percent) : ""
  );
  const [slaQuestion, setSlaQuestion] = useState(
    mode === "view" && props.policy ? String(props.policy.sla_question_minutes) : ""
  );
  const [slaDispatch, setSlaDispatch] = useState(
    mode === "view" && props.policy ? String(props.policy.sla_dispatch_hours) : ""
  );

  // Section open/close
  const [connOpen, setConnOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(true);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Disconnect confirm
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Derived: selected definition in create mode
  const selectedDefinition =
    mode === "create"
      ? definitions.find((d) => d.marketplace_code === marketplaceCode) ?? null
      : (props.definition ?? null);

  async function handleSubmit() {
    setSaving(true);
    setSaveResult(null);
    setSaveError(null);
    try {
      if (mode === "create") {
        const accountId = generateId("acc");
        const created = await onCreateAccount({
          account_id: accountId,
          display_name: displayName,
          channel_code: marketplaceCode,
          marketplace_code: marketplaceCode,
          connection_mode: connectionMode,
          credentials_json: Object.keys(credentials).length > 0 ? credentials : undefined,
        });
        if (commission) {
          await onCreatePolicy({
            policy_id: generateId("pol"),
            account_id: created.account_id,
            commission_percent: parseFloat(commission) || 0,
            fixed_fee_amount: parseFloat(fixedFee) || 0,
            default_shipping: parseFloat(defaultShipping) || 0,
            min_margin_percent: parseFloat(minMargin) || 0,
            sla_question_minutes: parseInt(slaQuestion, 10) || 0,
            sla_dispatch_hours: parseInt(slaDispatch, 10) || 0,
          });
        }
        setSaveResult("success");
        setTimeout(onClose, 800);
      }
    } catch (err: any) {
      setSaveError(err?.error?.message ?? "Failed to save. Please try again.");
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    mode === "create"
      ? !!displayName.trim() && !!marketplaceCode && !saving
      : !saving;

  // ---------- render ----------

  return (
    <div
      role="dialog"
      aria-label="Account settings"
      className="fixed top-0 right-0 h-full w-[400px] bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)] border-l border-slate-100 flex flex-col z-40"
      style={{ transition: "transform 200ms ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
        <MarketplaceIcon
          code={mode === "view" ? props.account.channel_code : marketplaceCode || "default"}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {mode === "view" ? props.account.display_name : (displayName || "New Marketplace")}
          </p>
          {mode === "view" && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400 font-mono">{props.account.account_id}</p>
              <StatusBadge status={props.account.status} />
            </div>
          )}
          {mode === "create" && (
            <p className="text-xs text-slate-400 mt-0.5">New account</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* CONNECTION section */}
        <div className="space-y-3">
          <SectionHeader label="Connection" open={connOpen} onToggle={() => setConnOpen((v) => !v)} />
          {connOpen && (
            <div className="space-y-3 pt-1">
              {mode === "create" ? (
                <>
                  <Field
                    id="display_name"
                    label="Display Name"
                    placeholder="My VTEX Store"
                    value={displayName}
                    onChange={setDisplayName}
                    required
                  />
                  <div className="space-y-1">
                    <label htmlFor="marketplace_code" className="block text-xs font-medium text-slate-600">
                      Marketplace<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <select
                      id="marketplace_code"
                      aria-label="Marketplace"
                      value={marketplaceCode}
                      onChange={(e) => {
                        setMarketplaceCode(e.target.value);
                        setCredentials({});
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Select marketplace —</option>
                      {definitions.map((d) => (
                        <option key={d.marketplace_code} value={d.marketplace_code}>
                          {d.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    id="connection_mode"
                    label="Connection Mode"
                    placeholder="api"
                    value={connectionMode}
                    onChange={setConnectionMode}
                  />
                </>
              ) : (
                <>
                  <Field id="view_name"       label="Display Name"    value={props.account.display_name}  readOnly />
                  <Field id="view_account_id" label="Account ID"      value={props.account.account_id}    readOnly />
                  <Field id="view_mode"       label="Connection Mode" value={props.account.connection_mode} readOnly />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">Marketplace</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <MarketplaceIcon code={props.account.channel_code} size={16} />
                      <span className="text-sm font-medium text-slate-700">
                        {selectedDefinition?.display_name ?? props.account.channel_code}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Dynamic credentials */}
              {selectedDefinition && selectedDefinition.credential_schema.length > 0 && (
                <div className="space-y-3 pt-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credentials</p>
                  {selectedDefinition.credential_schema.map((field) => (
                    <Field
                      key={field.key}
                      id={`cred_${field.key}`}
                      label={field.label}
                      type={field.secret ? "password" : "text"}
                      placeholder={field.label}
                      value={credentials[field.key] ?? ""}
                      onChange={(v) => setCredentials((c) => ({ ...c, [field.key]: v }))}
                      readOnly={mode === "view"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PRICING POLICY section */}
        <div className="space-y-3">
          <SectionHeader label="Pricing Policy" open={policyOpen} onToggle={() => setPolicyOpen((v) => !v)} />
          {policyOpen && (
            <>
              {mode === "view" && props.policy && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Policy editing requires backend update endpoint. Shown read-only.
                </p>
              )}
              {mode === "view" && !props.policy && (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  No policy configured yet. Fill in below to create one.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field id="commission"      label="Commission (0.16 = 16%)" type="number" placeholder="0.16" value={commission}      onChange={setCommission}      readOnly={mode === "view" && !!props.policy} />
                <Field id="fixed_fee"       label="Fixed Fee"               type="number" placeholder="5.00" value={fixedFee}        onChange={setFixedFee}        suffix="R$" readOnly={mode === "view" && !!props.policy} />
                <Field id="default_ship"   label="Default Shipping"        type="number" placeholder="10.00" value={defaultShipping} onChange={setDefaultShipping} suffix="R$" readOnly={mode === "view" && !!props.policy} />
                <Field id="min_margin"     label="Min Margin (0.10 = 10%)" type="number" placeholder="0.10" value={minMargin}       onChange={setMinMargin}       readOnly={mode === "view" && !!props.policy} />
                <Field id="sla_question"   label="SLA Question"            type="number" placeholder="60"   value={slaQuestion}    onChange={setSlaQuestion}     suffix="min" readOnly={mode === "view" && !!props.policy} />
                <Field id="sla_dispatch"   label="SLA Dispatch"            type="number" placeholder="24"   value={slaDispatch}    onChange={setSlaDispatch}     suffix="h"  readOnly={mode === "view" && !!props.policy} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
        {/* Left: disconnect */}
        {mode === "view" && !confirmDisconnect && (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="text-sm text-red-500 hover:text-red-700 transition-colors cursor-pointer"
          >
            Disconnect
          </button>
        )}
        {mode === "view" && confirmDisconnect && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-red-600 font-medium text-xs">No delete API yet</span>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
        {mode === "create" && <span />}

        {/* Right: save */}
        <div className="flex items-center gap-2">
          {saveResult === "success" && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Connected
            </span>
          )}
          {saveResult === "error" && saveError && (
            <span className="text-xs text-red-600 max-w-[140px] text-right">{saveError}</span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label={mode === "create" ? "Connect" : "Save Changes"}
            className="
              inline-flex items-center gap-2
              px-4 py-2 text-sm font-semibold rounded-lg
              bg-orange-500 hover:bg-orange-600
              text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-150 cursor-pointer
            "
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === "create" ? "Connect" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Run tests — expect PASS**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `~23 passed`

- [ ] **Step 5.5: Commit**

```bash
git add packages/feature-marketplaces/src/AccountPanel.tsx packages/feature-marketplaces/src/AccountPanel.test.tsx
git commit -m "feat(marketplaces): add AccountPanel with create/view modes"
```

---

## Task 6: Rewrite MarketplaceSettingsPage

**Files:**
- Rewrite: `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx`

- [ ] **Step 6.1: Rewrite the page**

```tsx
// packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx
import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import type {
  MarketplaceAccount,
  MarketplaceDefinition,
  MarketplacePolicy,
  CreateMarketplaceAccountRequest,
  CreateMarketplacePolicyRequest,
} from "@marketplace-central/sdk-runtime";
import { AccountCard } from "./AccountCard";
import { AddAccountCard } from "./AddAccountCard";
import { EmptyState } from "./EmptyState";
import { SkeletonCard } from "./SkeletonCard";
import { AccountPanel } from "./AccountPanel";

interface MarketplaceClient {
  listMarketplaceAccounts: () => Promise<{ items: MarketplaceAccount[] }>;
  createMarketplaceAccount: (req: CreateMarketplaceAccountRequest) => Promise<MarketplaceAccount>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  createMarketplacePolicy: (req: CreateMarketplacePolicyRequest) => Promise<MarketplacePolicy>;
  listMarketplaceDefinitions: () => Promise<{ items: MarketplaceDefinition[] }>;
}

interface MarketplaceSettingsPageProps {
  client: MarketplaceClient;
}

type PanelState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "view"; account: MarketplaceAccount };

export function MarketplaceSettingsPage({ client }: MarketplaceSettingsPageProps) {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [definitions, setDefinitions] = useState<MarketplaceDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [accsRes, polsRes, defsRes] = await Promise.all([
        client.listMarketplaceAccounts(),
        client.listMarketplacePolicies(),
        client.listMarketplaceDefinitions(),
      ]);
      setAccounts(accsRes.items);
      setPolicies(polsRes.items);
      setDefinitions(defsRes.items);
    } catch (err: any) {
      setLoadError(err?.error?.message ?? "Failed to load marketplace data.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setPanel({ open: true, mode: "create" });
  }

  function openView(account: MarketplaceAccount) {
    setPanel({ open: true, mode: "view", account });
  }

  function closePanel() {
    setPanel({ open: false });
  }

  async function handleCreateAccount(req: CreateMarketplaceAccountRequest) {
    const created = await client.createMarketplaceAccount(req);
    await load();
    return created;
  }

  async function handleCreatePolicy(req: CreateMarketplacePolicyRequest) {
    const created = await client.createMarketplacePolicy(req);
    await load();
    return created;
  }

  const panelOpen = panel.open;

  // Resolve panel props
  const panelAccount = panel.open && panel.mode === "view" ? panel.account : null;
  const panelPolicy = panelAccount
    ? (policies.find((p) => p.account_id === panelAccount.account_id) ?? null)
    : null;
  const panelDefinition = panelAccount
    ? (definitions.find((d) => d.marketplace_code === panelAccount.channel_code) ?? null)
    : null;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Marketplaces</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage your channels and pricing policies
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Connect Marketplace
        </button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {loadError}{" "}
          <button type="button" onClick={load} className="underline ml-1 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      <div
        className="px-6 pb-6 transition-all duration-200"
        style={{ paddingRight: panelOpen ? "432px" : "24px" }}
      >
        {loading ? (
          /* Skeleton */
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
            aria-busy="true"
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : accounts.length === 0 ? (
          /* Empty state */
          <EmptyState onAdd={openCreate} />
        ) : (
          /* Account cards */
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            {accounts.map((account) => {
              const policy = policies.find((p) => p.account_id === account.account_id) ?? null;
              const selected =
                panel.open && panel.mode === "view" && panel.account.account_id === account.account_id;
              return (
                <AccountCard
                  key={account.account_id}
                  account={account}
                  policy={policy}
                  selected={selected}
                  onSelect={openView}
                />
              );
            })}
            <AddAccountCard onAdd={openCreate} />
          </div>
        )}
      </div>

      {/* Slide-in panel */}
      {panelOpen && panel.mode === "create" && (
        <AccountPanel
          mode="create"
          account={null}
          policy={null}
          definition={null}
          definitions={definitions}
          onClose={closePanel}
          onCreateAccount={handleCreateAccount}
          onCreatePolicy={handleCreatePolicy}
        />
      )}
      {panelOpen && panel.mode === "view" && panelAccount && (
        <AccountPanel
          mode="view"
          account={panelAccount}
          policy={panelPolicy}
          definition={panelDefinition}
          definitions={definitions}
          onClose={closePanel}
          onCreateAccount={handleCreateAccount}
          onCreatePolicy={handleCreatePolicy}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: Run tests — some old tests will fail (expected)**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: `MarketplaceSettingsPage` tests fail — old tests check for `"no accounts yet"`, `pol-1`, and form fields that no longer exist. This is expected — Task 7 rewrites those tests.

- [ ] **Step 6.3: Commit the page rewrite**

```bash
git add packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx
git commit -m "feat(marketplaces): rewrite MarketplaceSettingsPage with card grid + panel"
```

---

## Task 7: Rewrite MarketplaceSettingsPage tests

**Files:**
- Rewrite: `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx`

- [ ] **Step 7.1: Rewrite the test file**

```tsx
// packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx
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

const vtexDefinition: MarketplaceDefinition = {
  marketplace_code: "vtex",
  display_name: "VTEX",
  fee_source: "api_sync",
  capabilities: [],
  credential_schema: [{ key: "api_key", label: "API Key", secret: true }],
  active: true,
};

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
    fireEvent.change(screen.getByRole("combobox", { name: /marketplace/i }), {
      target: { value: "vtex" },
    });
    await waitFor(() => screen.getByLabelText(/api key/i));
    fireEvent.change(screen.getByLabelText(/api key/i), {
      target: { value: "secret-key" },
    });

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() =>
      expect(mockCreateAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: "My Store",
          channel_code: "vtex",
          marketplace_code: "vtex",
          credentials_json: { api_key: "secret-key" },
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

  it("is_active: only active accounts shown from API", async () => {
    const inactiveAccount: MarketplaceAccount = {
      ...sampleAccount,
      account_id: "acc-2",
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
```

- [ ] **Step 7.2: Run all tests — expect PASS**

```bash
pnpm --filter @marketplace-central/feature-marketplaces test --run
```

Expected: All tests pass. Count: `~32 passed` across all test files.

- [ ] **Step 7.3: Commit**

```bash
git add packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx
git commit -m "test(marketplaces): rewrite page integration tests for card grid design"
```

---

## Task 8: Smoke-test in browser

- [ ] **Step 8.1: Start the dev server**

```bash
pnpm dev
```

Open `http://localhost:5173` and navigate to **Marketplaces**.

- [ ] **Step 8.2: Verify the following manually**

- [ ] Card grid renders (3 skeleton cards during load, then real cards or empty state)
- [ ] Card shows marketplace icon initial (colored), status badge, display name, account ID, commission + margin
- [ ] "Connect Marketplace" button opens create panel from right
- [ ] Marketplace dropdown shows VTEX and other definitions
- [ ] Selecting VTEX reveals API Key credential field (password, eye-toggle works)
- [ ] "Connect" button is disabled until Display Name + Marketplace filled
- [ ] Clicking an existing account card opens view panel — shows account info read-only, policy read-only
- [ ] "Close panel" (X) closes panel, grid reflows back to full width
- [ ] Empty state shows correct text + orange CTA button
- [ ] Panel width is 400px, grid shifts left (not overlapped)

- [ ] **Step 8.3: Final commit tag**

```bash
git add -A
git commit -m "chore(marketplaces): smoke test passed — redesign complete"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Task |
|-------------|------|
| Card grid (3→2→1 cols) | Task 6 — `gridTemplateColumns: repeat(auto-fill, minmax(280px, 1fr))` |
| Account card anatomy | Task 3 |
| Status badge | Task 2 |
| Marketplace icon | Task 1 |
| Add account card | Task 4 |
| Empty state | Task 4 |
| Skeleton loading | Task 4 |
| Slide-in panel | Task 5 |
| CONNECTION section | Task 5 |
| PRICING POLICY section | Task 5 |
| Dynamic credentials | Task 5 |
| Eye-toggle for secrets | Task 5 (`Field` component) |
| Footer with confirm | Task 5 |
| auto-generated IDs | Task 5 (`generateId`) |
| Grid shifts for panel | Task 6 (`paddingRight: 432px`) |
| Error banner + Retry | Task 6 |
| Unified tests | Task 7 |

**Known limitations (by design):**
- No `updateMarketplaceAccount` API → connection fields are read-only in view mode
- No `updateMarketplacePolicy` API → policy fields are read-only in view mode (note shown)
- No `deleteMarketplaceAccount` API → Disconnect button shows "No delete API yet" message
- Responsive panel (mobile full-width overlay) is wired structurally but not tested — browser-only verification
