# Marketplace Central UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full SaaS UI for Marketplace Central — design system, app shell, and all five pages (Dashboard, VTEX Publisher, Batch Detail, Marketplace Accounts, Pricing Simulator) — wired to the existing SDK and backend.

**Architecture:** Tailwind CSS v4 (via `@tailwindcss/vite`) for styling; Lucide React for icons; a dark left-sidebar shell with fixed topbar; each feature in its own `packages/feature-*` workspace package; SDK client injected via React context (`ClientContext.tsx`) and passed as a prop to feature pages (not imported across packages). Feature pages receive `client` as a prop — wrapper functions in `AppRouter.tsx` bridge the context to props. The VTEX Publisher page sends complete `products[]` objects per the backend contract, not just IDs. Dashboard lives in `apps/web/src/pages` by intentional exception (it aggregates across all modules; no single feature package owns it). API base URL is configured via `VITE_API_BASE_URL` env var.

**Tech Stack:** React 19, React Router DOM v7, Tailwind CSS v4, Lucide React, Vitest, @testing-library/react, npm workspaces

---

## Design System Reference

| Token | Value | Usage |
|---|---|---|
| Sidebar bg | `#0F172A` | Left sidebar background |
| Primary | `#2563EB` | Buttons, active nav, links |
| Primary hover | `#1D4ED8` | Button hover |
| Success | `#059669` | Succeeded status, positive indicators |
| Warning | `#D97706` | In-progress status |
| Danger | `#DC2626` | Failed status, destructive actions |
| Background | `#F8FAFC` | Page background |
| Card | `#FFFFFF` | Cards, panels |
| Border | `#E2E8F0` | Card borders, dividers |
| Text | `#0F172A` | Primary text |
| Muted text | `#64748B` | Secondary text, labels |
| Font body | Inter | All UI text |
| Font mono | JetBrains Mono | IDs, counts, prices |

---

## File Structure

```
apps/web/
  .env.example                            CREATE — VITE_API_BASE_URL=http://localhost:8080
  package.json                            MODIFY — add tailwindcss, @tailwindcss/vite, lucide-react
  vite.config.ts                          MODIFY — add @tailwindcss/vite plugin
  index.html                              MODIFY — add Google Fonts preconnect
  src/
    index.css                             CREATE — @import "tailwindcss" + base tokens
    main.tsx                              MODIFY — import css, wrap App in ClientProvider
    App.tsx                               UNMODIFIED
    app/
      AppRouter.tsx                       MODIFY — Layout wrapper + all 6 routes + wrapper fns
      Layout.tsx                          CREATE — sidebar + topbar shell with <Outlet>
      ClientContext.tsx                   CREATE — SDK React context + useClient hook
    pages/
      DashboardPage.tsx                   CREATE — KPI stat cards (intentional exception: cross-module)

packages/
  ui/
    src/
      Button.tsx                          MODIFY — rewrite with Tailwind + variant + loading props
      SurfaceCard.tsx                     MODIFY — rewrite with Tailwind classes
      Badge.tsx                           CREATE — status badge component
      StatCard.tsx                        CREATE — KPI stat card component
      index.ts                            MODIFY — export Badge, StatCard

  sdk-runtime/
    src/
      index.ts                            MODIFY — add VTEX connector types (VTEXProduct, PublishBatchRequest, etc.) + 3 methods

  feature-connectors/                     CREATE — new workspace package
    package.json
    src/
      VTEXPublishPage.tsx                 CREATE — full product form + submit + result
      BatchDetailPage.tsx                 CREATE — polling status, progress bar, ops table, retry
      index.ts

  feature-marketplaces/
    src/
      MarketplaceSettingsPage.tsx         MODIFY — accounts list + create form + policies list + create form

  feature-simulator/
    src/
      PricingSimulatorPage.tsx            MODIFY — simulation form + margin result with health color
```

---

## Task 1: Install Tailwind CSS v4 + Lucide React + Env Config

**Files:**
- Create: `apps/web/.env.example`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/index.html`
- Create: `apps/web/src/index.css`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Add dependencies**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm install --workspace @marketplace-central/web tailwindcss @tailwindcss/vite lucide-react
```

Expected: `added N packages` — no errors.

- [ ] **Step 2: Create .env.example**

Create `apps/web/.env.example`:

```
VITE_API_BASE_URL=http://localhost:8080
```

- [ ] **Step 3: Update vite.config.ts to include Tailwind plugin**

Replace the full contents of `apps/web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: {
    jsx: "automatic",
  },
  preview: {
    port: 3002,
  },
  test: {
    environment: "jsdom",
    globals: true,
    dir: rootDir,
    setupFiles: ["@testing-library/jest-dom/vitest"],
    include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "packages/**/*.test.ts", "packages/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
  },
});
```

- [ ] **Step 4: Add Google Fonts preconnect to index.html**

Replace `apps/web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Marketplace Central</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create index.css with Tailwind import and design tokens**

Create `apps/web/src/index.css`:

```css
@import "tailwindcss";

*, *::before, *::after {
  box-sizing: border-box;
}

:root {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

body {
  font-family: var(--font-sans);
  background-color: #F8FAFC;
  color: #0F172A;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 6: Import CSS in main.tsx**

Replace `apps/web/src/main.tsx`:

```tsx
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

(ClientProvider is added in Task 4.)

- [ ] **Step 7: Verify build passes**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs` — no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/.env.example apps/web/package.json apps/web/vite.config.ts apps/web/index.html apps/web/src/index.css apps/web/src/main.tsx package-lock.json
git commit -m "feat(ui): install Tailwind CSS v4 + Lucide React + env config"
```

---

## Task 2: Rewrite UI Primitives + Add Badge and StatCard

**Files:**
- Modify: `packages/ui/src/Button.tsx`
- Modify: `packages/ui/src/SurfaceCard.tsx`
- Create: `packages/ui/src/Badge.tsx`
- Create: `packages/ui/src/Badge.test.tsx`
- Create: `packages/ui/src/StatCard.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing test for Badge**

Create `packages/ui/src/Badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders pending status", () => {
    render(<Badge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders succeeded status", () => {
    render(<Badge status="succeeded" />);
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
  });

  it("renders failed status", () => {
    render(<Badge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders in_progress status", () => {
    render(<Badge status="in_progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders completed status", () => {
    render(<Badge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "Badge"
```

Expected: FAIL — `Badge` not found.

- [ ] **Step 3: Create Badge.tsx**

Create `packages/ui/src/Badge.tsx`:

```tsx
type Status = "pending" | "in_progress" | "succeeded" | "failed" | "completed";

const config: Record<Status, { label: string; classes: string }> = {
  pending:     { label: "Pending",     classes: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", classes: "bg-blue-100 text-blue-700" },
  succeeded:   { label: "Succeeded",   classes: "bg-emerald-100 text-emerald-700" },
  failed:      { label: "Failed",      classes: "bg-red-100 text-red-700" },
  completed:   { label: "Completed",   classes: "bg-emerald-100 text-emerald-700" },
};

interface BadgeProps {
  status: Status;
  className?: string;
}

export function Badge({ status, className = "" }: BadgeProps) {
  const { label, classes } = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes} ${className}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify Badge passes**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A10 "Badge"
```

Expected: 5 tests PASS.

- [ ] **Step 5: Rewrite Button.tsx with Tailwind**

Replace `packages/ui/src/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:   "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  secondary: "bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
  danger:    "bg-red-600 hover:bg-red-700 text-white border-transparent",
};

export function Button({
  children,
  type = "button",
  variant = "secondary",
  loading = false,
  disabled,
  className = "",
  ...props
}: PropsWithChildren<ButtonProps>) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

- [ ] **Step 6: Rewrite SurfaceCard.tsx with Tailwind**

Replace `packages/ui/src/SurfaceCard.tsx`:

```tsx
import type { PropsWithChildren } from "react";

interface SurfaceCardProps {
  className?: string;
}

export function SurfaceCard({ children, className = "" }: PropsWithChildren<SurfaceCardProps>) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl p-6 ${className}`}>
      {children}
    </section>
  );
}
```

- [ ] **Step 7: Create StatCard.tsx**

Create `packages/ui/src/StatCard.tsx`:

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}

export function StatCard({ label, value, sub, className = "" }: StatCardProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900" style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
```

- [ ] **Step 8: Update index.ts exports**

Replace `packages/ui/src/index.ts`:

```typescript
export * from "./Button";
export * from "./SurfaceCard";
export * from "./Badge";
export * from "./StatCard";
```

- [ ] **Step 9: Run all tests**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/
git commit -m "feat(ui): Tailwind Button/SurfaceCard + Badge + StatCard primitives"
```

---

## Task 3: Extend SDK with VTEX Connector Types and Methods

**Files:**
- Modify: `packages/sdk-runtime/src/index.ts`
- Create: `packages/sdk-runtime/src/index.test.ts`

The backend connector endpoints:
- `POST /connectors/vtex/publish` — body: `{ vtex_account, products: VTEXProduct[] }` → `PublishBatchResponse`
- `GET /connectors/vtex/publish/batch/{batch_id}` → `BatchStatus`
- `POST /connectors/vtex/publish/batch/{batch_id}/retry` — body: `{ vtex_account?, products: VTEXProduct[] }` → `PublishBatchResponse`

The `products` field matches the backend `productRequest` struct exactly.

- [ ] **Step 1: Write failing test for VTEX SDK methods**

Create `packages/sdk-runtime/src/index.test.ts`:

```typescript
import { createMarketplaceCentralClient } from "./index";

const mockFetch = vi.fn();
const client = createMarketplaceCentralClient({
  baseUrl: "http://localhost:8080",
  fetchImpl: mockFetch as unknown as typeof fetch,
});

function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

const sampleProduct = {
  product_id: "p1",
  name: "Test",
  description: "Desc",
  sku_name: "Test SKU",
  ean: "7890000000001",
  category: "Electronics",
  brand: "BrandX",
  cost: 60,
  base_price: 100,
  image_urls: ["https://example.com/img.png"],
  specs: {},
  stock_qty: 10,
  warehouse_id: "1_1",
  trade_policy_id: "1",
};

beforeEach(() => mockFetch.mockReset());

describe("publishToVTEX", () => {
  it("POSTs to /connectors/vtex/publish with products array", async () => {
    mockOk({ batch_id: "b1", total_products: 1, validated: 1, rejected: 0, rejections: [] });

    const result = await client.publishToVTEX({ vtex_account: "mystore", products: [sampleProduct] });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/connectors/vtex/publish",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.batch_id).toBe("b1");
    expect(result.validated).toBe(1);
  });
});

describe("getBatchStatus", () => {
  it("GETs /connectors/vtex/publish/batch/{id}", async () => {
    mockOk({ batch_id: "b1", vtex_account: "mystore", status: "completed", total: 1, succeeded: 1, failed: 0, in_progress: 0, operations: [] });

    const result = await client.getBatchStatus("b1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/connectors/vtex/publish/batch/b1",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.status).toBe("completed");
  });
});

describe("retryBatch", () => {
  it("POSTs to /connectors/vtex/publish/batch/{id}/retry with products array", async () => {
    mockOk({ batch_id: "b1", total_products: 1, validated: 1, rejected: 0, rejections: [] });

    const result = await client.retryBatch("b1", [sampleProduct]);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/connectors/vtex/publish/batch/b1/retry",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.batch_id).toBe("b1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "publishToVTEX\|getBatchStatus\|retryBatch"
```

Expected: FAIL — methods not found.

- [ ] **Step 3: Add types and methods to SDK**

In `packages/sdk-runtime/src/index.ts`, add these type definitions after `MarketplaceCentralClientError`:

```typescript
export interface VTEXProduct {
  product_id: string;
  name: string;
  description: string;
  sku_name: string;
  ean: string;
  category: string;
  brand: string;
  cost: number;
  base_price: number;
  image_urls: string[];
  specs: Record<string, string>;
  stock_qty: number;
  warehouse_id: string;
  trade_policy_id: string;
}

export interface PublishBatchRequest {
  vtex_account: string;
  products: VTEXProduct[];
}

export interface BatchRejection {
  product_id: string;
  error_code: string;
}

export interface PublishBatchResponse {
  batch_id: string;
  total_products: number;
  validated: number;
  rejected: number;
  rejections: BatchRejection[];
}

export interface BatchOperation {
  product_id: string;
  status: "pending" | "in_progress" | "succeeded" | "failed";
  current_step: string;
  error_code: string | null;
}

export interface BatchStatus {
  batch_id: string;
  vtex_account: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  in_progress: number;
  operations: BatchOperation[];
}
```

Then inside `createMarketplaceCentralClient`, add to the returned object:

```typescript
    publishToVTEX: (req: PublishBatchRequest) =>
      postJson<PublishBatchResponse>("/connectors/vtex/publish", req),
    getBatchStatus: (batchId: string) =>
      getJson<BatchStatus>(`/connectors/vtex/publish/batch/${batchId}`),
    retryBatch: (batchId: string, products: VTEXProduct[]) =>
      postJson<PublishBatchResponse>(`/connectors/vtex/publish/batch/${batchId}/retry`, { supplemental_products: products }),
```

- [ ] **Step 4: Run tests to verify all 3 pass**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A8 "publishToVTEX\|getBatchStatus\|retryBatch"
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-runtime/src/
git commit -m "feat(sdk): add VTEX connector types (VTEXProduct) and methods to SDK"
```

---

## Task 4: Create SDK Client Context

**Files:**
- Create: `apps/web/src/app/ClientContext.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Create ClientContext.tsx**

Create `apps/web/src/app/ClientContext.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createMarketplaceCentralClient } from "@marketplace-central/sdk-runtime";

type Client = ReturnType<typeof createMarketplaceCentralClient>;

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
  const client = useMemo(
    () => createMarketplaceCentralClient({ baseUrl }),
    [baseUrl]
  );
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside <ClientProvider>");
  return ctx;
}
```

- [ ] **Step 2: Wrap App in ClientProvider in main.tsx**

Replace `apps/web/src/main.tsx`:

```tsx
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ClientProvider } from "./app/ClientContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ClientProvider>
      <App />
    </ClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Build to verify no errors**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs` — no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/ClientContext.tsx apps/web/src/main.tsx
git commit -m "feat(ui): add SDK client context with VITE_API_BASE_URL support"
```

---

## Task 5: Build App Shell (Layout + Router)

**Files:**
- Create: `apps/web/src/app/Layout.tsx`
- Create: `packages/feature-connectors/package.json`
- Create: `packages/feature-connectors/src/index.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/AppRouter.tsx`
- Create: `apps/web/src/pages/DashboardPage.tsx` (placeholder)

- [ ] **Step 1: Create the feature-connectors package**

Create `packages/feature-connectors/package.json`:

```json
{
  "name": "@marketplace-central/feature-connectors",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

Create `packages/feature-connectors/src/index.ts` (placeholder):

```typescript
export {};
```

- [ ] **Step 2: Add feature-connectors to apps/web dependencies**

In `apps/web/package.json`, add to `"dependencies"`:

```json
"@marketplace-central/feature-connectors": "0.1.0",
```

- [ ] **Step 3: Install workspace link**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm install
```

Expected: no errors.

- [ ] **Step 4: Create Layout.tsx**

Create `apps/web/src/app/Layout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Send, Store, Calculator } from "lucide-react";

const navItems = [
  { to: "/",                label: "Dashboard",        icon: LayoutDashboard },
  { to: "/connectors/vtex", label: "VTEX Publisher",   icon: Send },
  { to: "/marketplaces",    label: "Marketplaces",     icon: Store },
  { to: "/simulator",       label: "Pricing Simulator", icon: Calculator },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col" style={{ backgroundColor: "#0F172A" }}>
        <div className="px-5 py-5 border-b border-slate-700">
          <span className="text-white font-semibold text-sm tracking-wide">Marketplace Central</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">v0.1.0</p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-6">
          <h1 className="text-sm font-medium text-slate-700">Marketplace Central</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create placeholder DashboardPage**

Create `apps/web/src/pages/DashboardPage.tsx`:

```tsx
export function DashboardPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
    </div>
  );
}
```

- [ ] **Step 6: Update AppRouter with Layout and routes**

Replace `apps/web/src/app/AppRouter.tsx`:

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";
import { Layout } from "./Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { useClient } from "./ClientContext";

function MarketplaceSettingsPageWrapper() {
  const client = useClient();
  return <MarketplaceSettingsPage client={client} />;
}

function PricingSimulatorPageWrapper() {
  const client = useClient();
  return <PricingSimulatorPage client={client} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPageWrapper />} />
          <Route path="/simulator" element={<PricingSimulatorPageWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

Note: connector routes are added in Task 8 once those components exist.

- [ ] **Step 7: Build to verify no errors**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs` — no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/Layout.tsx apps/web/src/app/AppRouter.tsx apps/web/src/pages/DashboardPage.tsx apps/web/package.json packages/feature-connectors/ package-lock.json
git commit -m "feat(ui): app shell — sidebar Layout + router + feature-connectors package"
```

---

## Task 6: Build Dashboard Page

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

Dashboard is justified in `apps/web/src/pages/` because it aggregates data from multiple independent modules (marketplaces + pricing); there is no single `packages/feature-*` that owns it.

- [ ] **Step 1: Build DashboardPage with loading, error, and empty states**

Replace `apps/web/src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useClient } from "../app/ClientContext";
import { StatCard } from "@marketplace-central/ui";
import type { MarketplaceAccount, PricingSimulation } from "@marketplace-central/sdk-runtime";

type LoadState = "loading" | "error" | "ready";

export function DashboardPage() {
  const client = useClient();
  const [state, setState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [simulations, setSimulations] = useState<PricingSimulation[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [accsRes, simsRes] = await Promise.all([
          client.listMarketplaceAccounts(),
          client.listPricingSimulations(),
        ]);
        if (!cancelled) {
          setAccounts(accsRes.items);
          setSimulations(simsRes.items);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Failed to load dashboard data. Is the backend running?");
          setState("error");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [client]);

  if (state === "loading") {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-6 w-36 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      </div>
    );
  }

  const avgMargin =
    simulations.length > 0
      ? (simulations.reduce((s, sim) => s + sim.margin_percent, 0) / simulations.length).toFixed(1) + "%"
      : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Overview of your marketplace operations.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Marketplace Accounts" value={accounts.length} sub="configured channels" />
        <StatCard
          label="Active Accounts"
          value={accounts.filter((a) => a.status === "active").length}
          sub="currently active"
        />
        <StatCard label="Pricing Simulations" value={simulations.length} sub="total run" />
        <StatCard label="Avg Margin" value={avgMargin} sub="across simulations" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accounts list */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Marketplace Accounts</h3>
          </div>
          {accounts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No accounts yet. Go to Marketplaces to add one.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <li key={a.account_id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.display_name}</p>
                    <p className="text-xs text-slate-400">{a.channel_code}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      a.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent simulations */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Recent Simulations</h3>
          </div>
          {simulations.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No simulations yet. Go to Pricing Simulator to run one.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {simulations.slice(0, 5).map((s) => (
                <li key={s.simulation_id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-mono text-slate-500">{s.product_id}</p>
                  <p
                    className={`text-sm font-semibold ${
                      s.margin_percent >= 20
                        ? "text-emerald-600"
                        : s.margin_percent >= 10
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {s.margin_percent.toFixed(1)}%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify no errors**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "feat(ui): dashboard page — KPI cards, accounts list, simulations list"
```

---

## Task 7: Build VTEX Publisher Page

**Files:**
- Create: `packages/feature-connectors/src/VTEXPublishPage.tsx`
- Create: `packages/feature-connectors/src/VTEXPublishPage.test.tsx`
- Modify: `packages/feature-connectors/src/index.ts`

The page collects full product data (matching the `VTEXProduct` SDK type / backend `productRequest` struct) for one product at a time. The user fills all required fields and submits. On success, result is shown and user is navigated to the batch detail page.

- [ ] **Step 1: Write failing tests for VTEXPublishPage**

Create `packages/feature-connectors/src/VTEXPublishPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VTEXPublishPage } from "./VTEXPublishPage";
import type { VTEXProduct, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

const mockPublish = vi.fn();
const mockClient = { publishToVTEX: mockPublish } as any;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/connectors/vtex"]}>
      <Routes>
        <Route path="/connectors/vtex" element={<VTEXPublishPage client={mockClient} />} />
        <Route path="/connectors/vtex/batch/:id" element={<div>Batch Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const successResponse: PublishBatchResponse = {
  batch_id: "batch-001",
  total_products: 1,
  validated: 1,
  rejected: 0,
  rejections: [],
};

describe("VTEXPublishPage", () => {
  beforeEach(() => mockPublish.mockReset());

  it("renders all required form fields", () => {
    renderPage();
    expect(screen.getByLabelText(/vtex account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/product id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("shows validation error when vtex_account is empty", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    expect(await screen.findByText(/vtex account is required/i)).toBeInTheDocument();
  });

  it("shows validation error when product name is empty", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    expect(await screen.findByText(/product name is required/i)).toBeInTheDocument();
  });

  it("calls publishToVTEX with correct products array on submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.change(screen.getByLabelText(/product id/i), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: "Test Product" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A product" } });
    fireEvent.change(screen.getByLabelText(/sku name/i), { target: { value: "Test SKU" } });
    fireEvent.change(screen.getByLabelText(/ean/i), { target: { value: "7890000000001" } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Electronics" } });
    fireEvent.change(screen.getByLabelText(/brand/i), { target: { value: "BrandX" } });
    fireEvent.change(screen.getByLabelText(/cost/i), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/base price/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/image url/i), { target: { value: "https://example.com/img.png" } });
    fireEvent.change(screen.getByLabelText(/stock quantity/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/warehouse id/i), { target: { value: "1_1" } });
    fireEvent.change(screen.getByLabelText(/trade policy id/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(mockPublish).toHaveBeenCalledWith({
        vtex_account: "mystore",
        products: [
          expect.objectContaining({
            product_id: "prod-1",
            name: "Test Product",
            base_price: 100,
            cost: 60,
          }),
        ],
      })
    );
  });

  it("shows batch result after successful submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: "Test Product" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Desc" } });
    fireEvent.change(screen.getByLabelText(/sku name/i), { target: { value: "SKU" } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Cat" } });
    fireEvent.change(screen.getByLabelText(/brand/i), { target: { value: "Brand" } });
    fireEvent.change(screen.getByLabelText(/cost/i), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/base price/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/stock quantity/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/warehouse id/i), { target: { value: "1_1" } });
    fireEvent.change(screen.getByLabelText(/trade policy id/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => expect(screen.getByText(/batch created/i)).toBeInTheDocument());
    expect(screen.getByText("batch-001")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "VTEXPublishPage"
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create VTEXPublishPage.tsx**

Create `packages/feature-connectors/src/VTEXPublishPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@marketplace-central/ui";
import type { VTEXProduct, PublishBatchRequest, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

interface PublishClient {
  publishToVTEX: (req: PublishBatchRequest) => Promise<PublishBatchResponse>;
}

interface VTEXPublishPageProps {
  client: PublishClient;
}

interface ProductForm {
  product_id: string;
  name: string;
  description: string;
  sku_name: string;
  ean: string;
  category: string;
  brand: string;
  cost: string;
  base_price: string;
  image_url: string;
  stock_qty: string;
  warehouse_id: string;
  trade_policy_id: string;
}

interface FormErrors {
  vtex_account?: string;
  name?: string;
}

const emptyProduct: ProductForm = {
  product_id: "",
  name: "",
  description: "",
  sku_name: "",
  ean: "",
  category: "",
  brand: "",
  cost: "",
  base_price: "",
  image_url: "",
  stock_qty: "",
  warehouse_id: "1_1",
  trade_policy_id: "1",
};

function toVTEXProduct(f: ProductForm): VTEXProduct {
  return {
    product_id: f.product_id.trim(),
    name: f.name.trim(),
    description: f.description.trim(),
    sku_name: f.sku_name.trim() || f.name.trim(),
    ean: f.ean.trim(),
    category: f.category.trim(),
    brand: f.brand.trim(),
    cost: parseFloat(f.cost) || 0,
    base_price: parseFloat(f.base_price) || 0,
    image_urls: f.image_url.trim() ? [f.image_url.trim()] : [],
    specs: {},
    stock_qty: parseInt(f.stock_qty, 10) || 0,
    warehouse_id: f.warehouse_id.trim() || "1_1",
    trade_policy_id: f.trade_policy_id.trim() || "1",
  };
}

function validate(vtexAccount: string, product: ProductForm): FormErrors {
  const errors: FormErrors = {};
  if (!vtexAccount.trim()) errors.vtex_account = "VTEX account is required";
  if (!product.name.trim()) errors.name = "Product name is required";
  return errors;
}

function textInput(id: string, label: string, placeholder: string, value: string, onChange: (v: string) => void, required = false) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function numInput(id: string, label: string, placeholder: string, value: string, onChange: (v: string) => void) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        type="number"
        step="any"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export function VTEXPublishPage({ client }: VTEXPublishPageProps) {
  const navigate = useNavigate();
  const [vtexAccount, setVtexAccount] = useState("");
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublishBatchResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  function setField(key: keyof ProductForm) {
    return (v: string) => setProduct((p) => ({ ...p, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(vtexAccount, product);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await client.publishToVTEX({
        vtex_account: vtexAccount.trim(),
        products: [toVTEXProduct(product)],
      });
      setResult(res);
      setTimeout(() => navigate(`/connectors/vtex/batch/${res.batch_id}`, { state: { products: [toVTEXProduct(product)] } }), 2000);
    } catch (err: any) {
      setApiError(err?.error?.message ?? "Failed to start batch. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">VTEX Publisher</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fill in the product details to publish it through the VTEX catalog pipeline.
        </p>
      </div>

      {result ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Batch created successfully</p>
          <p className="text-xs text-emerald-700 font-mono">{result.batch_id}</p>
          <p className="text-xs text-emerald-700">
            {result.validated} validated · {result.rejected} rejected
          </p>
          {result.rejections.map((r) => (
            <p key={r.product_id} className="text-xs text-red-700">
              {r.product_id}: {r.error_code}
            </p>
          ))}
          <p className="text-xs text-emerald-600 mt-1">Redirecting to batch status…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          {/* VTEX Account */}
          <div className="space-y-1">
            <label htmlFor="vtex_account" className="block text-sm font-medium text-slate-700">
              VTEX Account<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="vtex_account"
              type="text"
              placeholder="mystore"
              value={vtexAccount}
              onChange={(e) => setVtexAccount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.vtex_account && <p className="text-xs text-red-600">{errors.vtex_account}</p>}
          </div>

          {/* Product details */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Product Details</p>
            <div className="grid grid-cols-2 gap-4">
              {textInput("product_id", "Product ID", "prod-001", product.product_id, setField("product_id"))}
              {textInput("name", "Product Name", "Blue T-Shirt", product.name, setField("name"), true)}
              {errors.name && <p className="col-span-2 text-xs text-red-600 -mt-2">{errors.name}</p>}
              {textInput("description", "Description", "A blue cotton t-shirt", product.description, setField("description"))}
              {textInput("sku_name", "SKU Name", "Blue T-Shirt M", product.sku_name, setField("sku_name"))}
              {textInput("ean", "EAN", "7890000000001", product.ean, setField("ean"))}
              {textInput("category", "Category", "Clothing", product.category, setField("category"))}
              {textInput("brand", "Brand", "BrandX", product.brand, setField("brand"))}
            </div>
          </div>

          {/* Pricing & Stock */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Pricing & Stock</p>
            <div className="grid grid-cols-2 gap-4">
              {numInput("cost", "Cost (R$)", "60.00", product.cost, setField("cost"))}
              {numInput("base_price", "Base Price (R$)", "100.00", product.base_price, setField("base_price"))}
              {numInput("stock_qty", "Stock Quantity", "10", product.stock_qty, setField("stock_qty"))}
              {textInput("warehouse_id", "Warehouse ID", "1_1", product.warehouse_id, setField("warehouse_id"))}
              {textInput("trade_policy_id", "Trade Policy ID", "1", product.trade_policy_id, setField("trade_policy_id"))}
            </div>
          </div>

          {/* Image */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Image</p>
            {textInput("image_url", "Image URL", "https://example.com/image.png", product.image_url, setField("image_url"))}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary" loading={submitting}>
              Publish to VTEX
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify VTEXPublishPage passes**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A20 "VTEXPublishPage"
```

Expected: 4 tests PASS.

- [ ] **Step 5: Update feature-connectors index.ts**

Replace `packages/feature-connectors/src/index.ts`:

```typescript
export { VTEXPublishPage } from "./VTEXPublishPage";
```

- [ ] **Step 6: Commit**

```bash
git add packages/feature-connectors/src/
git commit -m "feat(ui): VTEX publisher page with full product form and validation"
```

---

## Task 8: Build Batch Detail Page + Wire Connector Routes

**Files:**
- Create: `packages/feature-connectors/src/BatchDetailPage.tsx`
- Create: `packages/feature-connectors/src/BatchDetailPage.test.tsx`
- Modify: `packages/feature-connectors/src/index.ts`
- Modify: `apps/web/src/app/AppRouter.tsx`

The page polls `getBatchStatus(batchId)` every 3 s while `status` is `pending` or `in_progress`. Shows loading skeleton, error state, progress bar, operations table with Badge per status, and Retry button when `failed > 0`.

- [ ] **Step 1: Write failing tests for BatchDetailPage**

Create `packages/feature-connectors/src/BatchDetailPage.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BatchDetailPage } from "./BatchDetailPage";
import type { BatchStatus, VTEXProduct } from "@marketplace-central/sdk-runtime";

const mockGetStatus = vi.fn();
const mockRetry = vi.fn();
const mockClient = { getBatchStatus: mockGetStatus, retryBatch: mockRetry } as any;

const completedBatch: BatchStatus = {
  batch_id: "b1",
  vtex_account: "mystore",
  status: "completed",
  total: 2,
  succeeded: 2,
  failed: 0,
  in_progress: 0,
  operations: [
    { product_id: "p1", status: "succeeded", current_step: "activate", error_code: null },
    { product_id: "p2", status: "succeeded", current_step: "activate", error_code: null },
  ],
};

const failedBatch: BatchStatus = {
  batch_id: "b1",
  vtex_account: "mystore",
  status: "failed",
  total: 2,
  succeeded: 1,
  failed: 1,
  in_progress: 0,
  operations: [
    { product_id: "p1", status: "succeeded", current_step: "activate", error_code: null },
    { product_id: "p2", status: "failed", current_step: "product", error_code: "CONNECTORS_PUBLISH_VTEX_VALIDATION" },
  ],
};

const sampleProduct: VTEXProduct = {
  product_id: "p2", name: "Prod2", description: "", sku_name: "SKU2",
  ean: "", category: "Cat", brand: "Brand", cost: 50, base_price: 90,
  image_urls: [], specs: {}, stock_qty: 5, warehouse_id: "1_1", trade_policy_id: "1",
};

function renderPage(routeState?: { products: VTEXProduct[] }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connectors/vtex/batch/b1", state: routeState }]}>
      <Routes>
        <Route path="/connectors/vtex/batch/:id" element={<BatchDetailPage client={mockClient} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("BatchDetailPage", () => {
  beforeEach(() => {
    mockGetStatus.mockReset();
    mockRetry.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("shows operations table for completed batch", async () => {
    mockGetStatus.mockResolvedValue(completedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByText("p1")).toBeInTheDocument());
    expect(screen.getByText("p2")).toBeInTheDocument();
    expect(screen.getAllByText("Succeeded")).toHaveLength(2);
  });

  it("shows Retry button when batch has failed operations", async () => {
    mockGetStatus.mockResolvedValue(failedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
  });

  it("calls retryBatch with products from route state on retry click", async () => {
    mockGetStatus.mockResolvedValue(failedBatch);
    mockRetry.mockResolvedValue({ batch_id: "b1", total_products: 1, validated: 1, rejected: 0, rejections: [] });
    mockGetStatus.mockResolvedValue(completedBatch); // after retry, polling resolves completed
    renderPage({ products: [sampleProduct] });
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(mockRetry).toHaveBeenCalledWith("b1", [sampleProduct])
    );
  });

  it("does not show Retry button when all operations succeeded", async () => {
    mockGetStatus.mockResolvedValue(completedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByText("p1")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows error code for failed operation", async () => {
    mockGetStatus.mockResolvedValue(failedBatch);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("CONNECTORS_PUBLISH_VTEX_VALIDATION")).toBeInTheDocument()
    );
  });

  it("shows error state when getBatchStatus rejects", async () => {
    mockGetStatus.mockRejectedValue({ error: { message: "Backend unavailable" } });
    renderPage();
    await waitFor(() => expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "BatchDetailPage"
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create BatchDetailPage.tsx**

Create `packages/feature-connectors/src/BatchDetailPage.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Badge, Button } from "@marketplace-central/ui";
import type { BatchStatus, BatchOperation, VTEXProduct, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

interface BatchClient {
  getBatchStatus: (batchId: string) => Promise<BatchStatus>;
  retryBatch: (batchId: string, products: VTEXProduct[]) => Promise<PublishBatchResponse>;
}

interface BatchDetailPageProps {
  client: BatchClient;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(["completed", "failed"]);

const stepLabels: Record<string, string> = {
  category:     "Category",
  brand:        "Brand",
  product:      "Product",
  sku:          "SKU",
  specs_images: "Images",
  trade_policy: "Trade Policy",
  price:        "Price",
  stock:        "Stock",
  activate:     "Activate",
};

export function BatchDetailPage({ client }: BatchDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  // Products passed via router state from VTEXPublishPage for retry — empty array means retry without supplement (server will reject if products missing)
  const routeProducts: VTEXProduct[] = (location.state as { products?: VTEXProduct[] } | null)?.products ?? [];
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    if (!id) return;
    try {
      const data = await client.getBatchStatus(id);
      setBatch(data);
      if (TERMINAL.has(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err: any) {
      setErrorMsg(err?.error?.message ?? "Failed to load batch status.");
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  async function handleRetry() {
    if (!id) return;
    setRetrying(true);
    try {
      await client.retryBatch(id, routeProducts);
      setLoading(true);
      await fetchStatus();
      pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    } catch (err: any) {
      setErrorMsg(err?.error?.message ?? "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (loading && !batch) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && !batch) {
    return (
      <div className="max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {errorMsg}
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const progressPct = batch.total > 0 ? Math.round((batch.succeeded / batch.total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Batch Detail</h2>
          <p className="mt-0.5 text-xs font-mono text-slate-400">{batch.batch_id}</p>
        </div>
        <div className="flex items-center gap-3">
          {batch.failed > 0 && (
            <Button variant="danger" loading={retrying} onClick={handleRetry}>
              Retry Failed
            </Button>
          )}
          <Badge status={batch.status} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">VTEX Account</span>
          <span className="font-mono font-medium text-slate-900">{batch.vtex_account}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Progress</span>
          <span className="font-medium text-slate-900">{batch.succeeded}/{batch.total} succeeded</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex gap-6 text-xs text-slate-500">
          <span><span className="font-medium text-emerald-600">{batch.succeeded}</span> succeeded</span>
          <span><span className="font-medium text-red-600">{batch.failed}</span> failed</span>
          <span><span className="font-medium text-blue-600">{batch.in_progress}</span> in progress</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Operations</h3>
        </div>
        {batch.operations.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No operations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Product ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Current Step</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batch.operations.map((op: BatchOperation) => (
                  <tr key={op.product_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{op.product_id}</td>
                    <td className="px-5 py-3"><Badge status={op.status} /></td>
                    <td className="px-5 py-3 text-slate-600">{stepLabels[op.current_step] ?? op.current_step}</td>
                    <td className="px-5 py-3 font-mono text-xs text-red-600">{op.error_code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify BatchDetailPage passes**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A20 "BatchDetailPage"
```

Expected: 5 tests PASS.

- [ ] **Step 5: Update feature-connectors index.ts**

Replace `packages/feature-connectors/src/index.ts`:

```typescript
export { VTEXPublishPage } from "./VTEXPublishPage";
export { BatchDetailPage } from "./BatchDetailPage";
```

- [ ] **Step 6: Wire connector routes into AppRouter**

Replace `apps/web/src/app/AppRouter.tsx`:

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MarketplaceSettingsPage } from "@marketplace-central/feature-marketplaces";
import { PricingSimulatorPage } from "@marketplace-central/feature-simulator";
import { VTEXPublishPage, BatchDetailPage } from "@marketplace-central/feature-connectors";
import { Layout } from "./Layout";
import { DashboardPage } from "../pages/DashboardPage";
import { useClient } from "./ClientContext";

function VTEXPublishPageWrapper() {
  const client = useClient();
  return <VTEXPublishPage client={client} />;
}

function BatchDetailPageWrapper() {
  const client = useClient();
  return <BatchDetailPage client={client} />;
}

function MarketplaceSettingsPageWrapper() {
  const client = useClient();
  return <MarketplaceSettingsPage client={client} />;
}

function PricingSimulatorPageWrapper() {
  const client = useClient();
  return <PricingSimulatorPage client={client} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/connectors/vtex" element={<VTEXPublishPageWrapper />} />
          <Route path="/connectors/vtex/batch/:id" element={<BatchDetailPageWrapper />} />
          <Route path="/marketplaces" element={<MarketplaceSettingsPageWrapper />} />
          <Route path="/simulator" element={<PricingSimulatorPageWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Build to verify**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs`.

- [ ] **Step 8: Commit**

```bash
git add packages/feature-connectors/src/ apps/web/src/app/AppRouter.tsx
git commit -m "feat(ui): batch detail page with polling, retry, and connector routes wired"
```

---

## Task 9: Build Marketplace Settings Page — Accounts + Policies

**Files:**
- Modify: `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx`
- Create: `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx`

The page has two sections: Accounts (list + create form) and Policies (list + create form). Both are loaded on mount. The `client` prop provides all four methods.

- [ ] **Step 1: Write failing tests**

Create `packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarketplaceSettingsPage } from "./MarketplaceSettingsPage";
import type { MarketplaceAccount, MarketplacePolicy } from "@marketplace-central/sdk-runtime";

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

const fakeAccount: MarketplaceAccount = {
  account_id: "acc-1",
  tenant_id: "t1",
  channel_code: "vtex",
  display_name: "My VTEX Store",
  status: "active",
  connection_mode: "api",
};

const fakePolicy: MarketplacePolicy = {
  policy_id: "pol-1",
  tenant_id: "t1",
  account_id: "acc-1",
  commission_percent: 0.16,
  fixed_fee_amount: 5,
  default_shipping: 10,
  tax_percent: 0,
  min_margin_percent: 0.10,
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

  it("renders accounts list when loaded", async () => {
    mockListAccounts.mockResolvedValue({ items: [fakeAccount] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText("My VTEX Store")).toBeInTheDocument());
  });

  it("shows empty state when no accounts", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument());
  });

  it("renders policies list when loaded", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [fakePolicy] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText("pol-1")).toBeInTheDocument());
  });

  it("calls createMarketplaceAccount on account form submit", async () => {
    mockListAccounts.mockResolvedValue({ items: [] });
    mockListPolicies.mockResolvedValue({ items: [] });
    mockCreateAccount.mockResolvedValue(fakeAccount);
    render(<MarketplaceSettingsPage client={mockClient} />);

    await waitFor(() => screen.getByLabelText(/account id/i));
    fireEvent.change(screen.getByLabelText(/account id/i), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText(/channel code/i), { target: { value: "vtex" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "My VTEX Store" } });
    fireEvent.change(screen.getByLabelText(/connection mode/i), { target: { value: "api" } });
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));

    await waitFor(() =>
      expect(mockCreateAccount).toHaveBeenCalledWith({
        account_id: "acc-1",
        channel_code: "vtex",
        display_name: "My VTEX Store",
        connection_mode: "api",
      })
    );
  });

  it("shows error state when loading fails", async () => {
    mockListAccounts.mockRejectedValue(new Error("Network error"));
    mockListPolicies.mockResolvedValue({ items: [] });
    render(<MarketplaceSettingsPage client={mockClient} />);
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "MarketplaceSettingsPage"
```

Expected: FAIL.

- [ ] **Step 3: Rewrite MarketplaceSettingsPage.tsx**

Replace `packages/feature-marketplaces/src/MarketplaceSettingsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button, Badge, SurfaceCard } from "@marketplace-central/ui";
import type {
  MarketplaceAccount,
  MarketplacePolicy,
  CreateMarketplaceAccountRequest,
  CreateMarketplacePolicyRequest,
} from "@marketplace-central/sdk-runtime";

interface MarketplaceClient {
  listMarketplaceAccounts: () => Promise<{ items: MarketplaceAccount[] }>;
  createMarketplaceAccount: (req: CreateMarketplaceAccountRequest) => Promise<MarketplaceAccount>;
  listMarketplacePolicies: () => Promise<{ items: MarketplacePolicy[] }>;
  createMarketplacePolicy: (req: CreateMarketplacePolicyRequest) => Promise<MarketplacePolicy>;
}

interface MarketplaceSettingsPageProps {
  client: MarketplaceClient;
}

const emptyAccount: CreateMarketplaceAccountRequest = {
  account_id: "",
  channel_code: "",
  display_name: "",
  connection_mode: "",
};

const emptyPolicy: CreateMarketplacePolicyRequest = {
  policy_id: "",
  account_id: "",
  commission_percent: 0,
  fixed_fee_amount: 0,
  default_shipping: 0,
  min_margin_percent: 0,
  sla_question_minutes: 60,
  sla_dispatch_hours: 24,
};

function textField(id: string, label: string, placeholder: string, value: string, onChange: (v: string) => void) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function numField(id: string, label: string, placeholder: string, value: number, onChange: (v: number) => void) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        type="number"
        step="any"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export function MarketplaceSettingsPage({ client }: MarketplaceSettingsPageProps) {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [policyForm, setPolicyForm] = useState(emptyPolicy);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [submittingPolicy, setSubmittingPolicy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);

  async function load() {
    try {
      const [accsRes, polsRes] = await Promise.all([
        client.listMarketplaceAccounts(),
        client.listMarketplacePolicies(),
      ]);
      setAccounts(accsRes.items);
      setPolicies(polsRes.items);
      setLoadError(null);
    } catch {
      setLoadError("Failed to load marketplace data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingAccount(true);
    setAccountError(null);
    try {
      await client.createMarketplaceAccount(accountForm);
      setAccountForm(emptyAccount);
      await load();
    } catch (err: any) {
      setAccountError(err?.error?.message ?? "Failed to create account.");
    } finally {
      setSubmittingAccount(false);
    }
  }

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingPolicy(true);
    setPolicyError(null);
    try {
      await client.createMarketplacePolicy(policyForm);
      setPolicyForm(emptyPolicy);
      await load();
    } catch (err: any) {
      setPolicyError(err?.error?.message ?? "Failed to create policy.");
    } finally {
      setSubmittingPolicy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Marketplace Accounts</h2>
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Marketplaces</h2>
        <p className="mt-1 text-sm text-slate-500">Manage connected marketplace accounts and their pricing policies.</p>
      </div>

      {/* ── Accounts ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-800">Accounts</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {accounts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No accounts yet. Add one below.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <li key={a.account_id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.display_name}</p>
                    <p className="text-xs text-slate-400">
                      {a.channel_code} · {a.connection_mode} · <span className="font-mono">{a.account_id}</span>
                    </p>
                  </div>
                  <Badge status={a.status === "active" ? "succeeded" : "pending"} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <SurfaceCard>
          <h4 className="text-sm font-semibold text-slate-900 mb-4">Add Account</h4>
          {accountError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{accountError}</div>
          )}
          <form onSubmit={handleAddAccount} className="grid grid-cols-2 gap-4">
            {textField("account_id", "Account ID", "acc-001", accountForm.account_id, (v) => setAccountForm((f) => ({ ...f, account_id: v })))}
            {textField("channel_code", "Channel Code", "vtex", accountForm.channel_code, (v) => setAccountForm((f) => ({ ...f, channel_code: v })))}
            {textField("display_name", "Display Name", "My VTEX Store", accountForm.display_name, (v) => setAccountForm((f) => ({ ...f, display_name: v })))}
            {textField("connection_mode", "Connection Mode", "api", accountForm.connection_mode, (v) => setAccountForm((f) => ({ ...f, connection_mode: v })))}
            <div className="col-span-2 flex justify-end">
              <Button type="submit" variant="primary" loading={submittingAccount}>Add Account</Button>
            </div>
          </form>
        </SurfaceCard>
      </section>

      {/* ── Policies ── */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-800">Pricing Policies</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {policies.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No policies yet. Add one below.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Policy ID</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Account</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Commission</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Fixed Fee</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Min Margin</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">SLA Q</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">SLA Dispatch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {policies.map((p) => (
                    <tr key={p.policy_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{p.policy_id}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{p.account_id}</td>
                      <td className="px-5 py-3 text-xs font-mono">{(p.commission_percent * 100).toFixed(1)}%</td>
                      <td className="px-5 py-3 text-xs font-mono">R$ {p.fixed_fee_amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-xs font-mono">{(p.min_margin_percent * 100).toFixed(1)}%</td>
                      <td className="px-5 py-3 text-xs">{p.sla_question_minutes} min</td>
                      <td className="px-5 py-3 text-xs">{p.sla_dispatch_hours} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <SurfaceCard>
          <h4 className="text-sm font-semibold text-slate-900 mb-4">Add Policy</h4>
          {policyError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{policyError}</div>
          )}
          <form onSubmit={handleAddPolicy} className="grid grid-cols-2 gap-4">
            {textField("policy_id", "Policy ID", "pol-001", policyForm.policy_id, (v) => setPolicyForm((f) => ({ ...f, policy_id: v })))}
            {textField("policy_account_id", "Account ID", "acc-001", policyForm.account_id, (v) => setPolicyForm((f) => ({ ...f, account_id: v })))}
            {numField("commission_percent", "Commission (0.16 = 16%)", "0.16", policyForm.commission_percent, (v) => setPolicyForm((f) => ({ ...f, commission_percent: v })))}
            {numField("fixed_fee_amount", "Fixed Fee (R$)", "5.00", policyForm.fixed_fee_amount, (v) => setPolicyForm((f) => ({ ...f, fixed_fee_amount: v })))}
            {numField("default_shipping", "Default Shipping (R$)", "10.00", policyForm.default_shipping, (v) => setPolicyForm((f) => ({ ...f, default_shipping: v })))}
            {numField("min_margin_percent", "Min Margin (0.10 = 10%)", "0.10", policyForm.min_margin_percent, (v) => setPolicyForm((f) => ({ ...f, min_margin_percent: v })))}
            {numField("sla_question_minutes", "SLA Question (min)", "60", policyForm.sla_question_minutes, (v) => setPolicyForm((f) => ({ ...f, sla_question_minutes: v })))}
            {numField("sla_dispatch_hours", "SLA Dispatch (h)", "24", policyForm.sla_dispatch_hours, (v) => setPolicyForm((f) => ({ ...f, sla_dispatch_hours: v })))}
            <div className="col-span-2 flex justify-end">
              <Button type="submit" variant="primary" loading={submittingPolicy}>Add Policy</Button>
            </div>
          </form>
        </SurfaceCard>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify MarketplaceSettingsPage passes**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A20 "MarketplaceSettingsPage"
```

Expected: 5 tests PASS.

- [ ] **Step 5: Build to verify**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs`.

- [ ] **Step 6: Commit**

```bash
git add packages/feature-marketplaces/src/
git commit -m "feat(ui): marketplace settings — accounts list/create + policies list/create"
```

---

## Task 10: Build Pricing Simulator Page

**Files:**
- Modify: `packages/feature-simulator/src/PricingSimulatorPage.tsx`
- Create: `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`

Numeric form that calls `runPricingSimulation`. Result shows `margin_percent` with green/amber/red health color. `simulation_id` is generated client-side with `crypto.randomUUID()` (available in all modern browsers, no library needed).

- [ ] **Step 1: Write failing tests**

Create `packages/feature-simulator/src/PricingSimulatorPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingSimulatorPage } from "./PricingSimulatorPage";
import type { PricingSimulation } from "@marketplace-central/sdk-runtime";

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test -- --reporter=verbose 2>&1 | grep -A5 "PricingSimulatorPage"
```

Expected: FAIL.

- [ ] **Step 3: Rewrite PricingSimulatorPage.tsx**

Replace `packages/feature-simulator/src/PricingSimulatorPage.tsx`:

```tsx
import { useState } from "react";
import { Button, SurfaceCard } from "@marketplace-central/ui";
import type { PricingSimulation, RunPricingSimulationRequest } from "@marketplace-central/sdk-runtime";

interface SimulatorClient {
  runPricingSimulation: (req: RunPricingSimulationRequest) => Promise<PricingSimulation>;
}

interface PricingSimulatorPageProps {
  client: SimulatorClient;
}

const emptyForm = {
  product_id: "",
  account_id: "",
  base_price_amount: "",
  cost_amount: "",
  commission_percent: "",
  fixed_fee_amount: "",
  shipping_amount: "",
  min_margin_percent: "",
};

function marginColor(pct: number): string {
  if (pct >= 20) return "text-emerald-600";
  if (pct >= 10) return "text-amber-600";
  return "text-red-600";
}

export function PricingSimulatorPage({ client }: PricingSimulatorPageProps) {
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState<PricingSimulation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function setField(key: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setApiError(null);
    try {
      const sim = await client.runPricingSimulation({
        simulation_id: crypto.randomUUID(),
        product_id: form.product_id.trim(),
        account_id: form.account_id.trim(),
        base_price_amount: parseFloat(form.base_price_amount) || 0,
        cost_amount: parseFloat(form.cost_amount) || 0,
        commission_percent: parseFloat(form.commission_percent) || 0,
        fixed_fee_amount: parseFloat(form.fixed_fee_amount) || 0,
        shipping_amount: parseFloat(form.shipping_amount) || 0,
        min_margin_percent: parseFloat(form.min_margin_percent) || 0,
      });
      setResult(sim);
    } catch (err: any) {
      setApiError(err?.error?.message ?? "Simulation failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function field(id: keyof typeof emptyForm, label: string, placeholder: string, type: "text" | "number" = "number") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
        <input
          id={id}
          type={type}
          step="any"
          placeholder={placeholder}
          value={form[id]}
          onChange={setField(id)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Pricing Simulator</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calculate margin for a product across fees, commissions, and freight.
        </p>
      </div>

      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Result</p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className={`text-4xl font-bold ${marginColor(result.margin_percent)}`} style={{ fontFamily: "var(--font-mono)" }}>
              {result.margin_percent.toFixed(1)}%
            </span>
            <span className="text-sm text-slate-400">margin</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            R$ <span className="font-mono font-medium text-slate-800">{result.margin_amount.toFixed(2)}</span> margin amount
          </p>
          <button
            onClick={() => setResult(null)}
            className="mt-3 text-xs text-blue-600 hover:underline cursor-pointer"
          >
            Run another simulation
          </button>
        </div>
      )}

      <SurfaceCard>
        {apiError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("product_id", "Product ID", "prod-001", "text")}
            {field("account_id", "Account ID", "acc-001", "text")}
            {field("base_price_amount", "Base Price (R$)", "100.00")}
            {field("cost_amount", "Cost (R$)", "60.00")}
            {field("commission_percent", "Commission", "0.16")}
            {field("fixed_fee_amount", "Fixed Fee (R$)", "5.00")}
            {field("shipping_amount", "Shipping (R$)", "10.00")}
            {field("min_margin_percent", "Min Margin", "0.10")}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={submitting}>Simulate</Button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test
```

Expected: All tests PASS.

- [ ] **Step 5: Build final production bundle**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run build
```

Expected: `✓ built in Xs` — no TypeScript or build errors.

- [ ] **Step 6: Commit**

```bash
git add packages/feature-simulator/src/
git commit -m "feat(ui): pricing simulator page with margin result and health indicator"
```

---

## Final Verification

- [ ] **Run all tests**

```bash
cd /c/Users/leandro.theodoro.MN-NTB-LEANDROT/Documents/marketplace-central
npm run test
```

Expected: All tests PASS. No failures.

- [ ] **Final build**

```bash
npm run build
```

Expected: `✓ built in Xs`.

- [ ] **Dev server smoke test**

```bash
npm run dev
```

Navigate to: `/` (Dashboard), `/connectors/vtex` (Publisher), `/marketplaces` (Accounts + Policies), `/simulator` (Pricing). All pages render without white screens or console errors.
