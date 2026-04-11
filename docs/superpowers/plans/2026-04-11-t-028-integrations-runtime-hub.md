# T-028 Integrations Runtime Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/integrations` runtime hub so operators can connect, reauthorize, disconnect, inspect auth health, trigger fee sync, and review operation history without mixing runtime operations into the existing `Marketplaces` setup page.

**Architecture:** Keep setup and runtime concerns split. `packages/feature-marketplaces` remains the commercial setup surface, while a new `packages/feature-integrations` package owns the operational UI. All runtime data flows through `packages/sdk-runtime`, and `apps/web` only wires routes, navigation, and workspace dependencies.

**Tech Stack:** React 19, React Router 7, Vitest, Testing Library, TypeScript, Vite, Tailwind via `@source`, `@marketplace-central/sdk-runtime`

---

## File Structure Map

### New files

- `packages/feature-integrations/package.json` - workspace package manifest for the runtime hub feature.
- `packages/feature-integrations/src/index.ts` - package export surface.
- `packages/feature-integrations/src/IntegrationsHubPage.tsx` - page container, data loading, filter state, selection state, optimistic action state.
- `packages/feature-integrations/src/IntegrationsHubPage.test.tsx` - page-level integration tests for loading, filtering, query-sync, and actions.
- `packages/feature-integrations/src/components/OperationalSummary.tsx` - KPI strip for connected, warning, requires reauth, critical, sync failures.
- `packages/feature-integrations/src/components/FilterBar.tsx` - provider/status/health filters and search input.
- `packages/feature-integrations/src/components/InstallationCard.tsx` - installation runtime card with contextual actions.
- `packages/feature-integrations/src/components/InstallationDrawer.tsx` - right-side drawer shell.
- `packages/feature-integrations/src/components/AuthStatusPanel.tsx` - auth strategy, health metadata, authorize/reauth/credentials UI.
- `packages/feature-integrations/src/components/OperationsTimeline.tsx` - operation run list with result/failure metadata.

### Modified files

- `packages/sdk-runtime/src/index.ts` - auth status types and runtime action methods.
- `packages/sdk-runtime/src/index.test.ts` - request/response tests for new runtime methods.
- `apps/web/package.json` - add `@marketplace-central/feature-integrations`.
- `apps/web/src/app/AppRouter.tsx` - register `/integrations` route and wrapper.
- `apps/web/src/app/Layout.tsx` - add sidebar navigation entry for `Integrations`.
- `apps/web/src/index.css` - include Tailwind source path for the new feature package.
- `apps/web/src/app/AppRouter.test.tsx` - smoke test route registration with mocked page packages.

## Task 1: Extend SDK Runtime for Integration Auth and Runtime Actions

**Files:**
- Modify: `packages/sdk-runtime/src/index.ts`
- Modify: `packages/sdk-runtime/src/index.test.ts`

- [ ] **Step 1: Write the failing SDK tests**

Add these tests to `packages/sdk-runtime/src/index.test.ts`:

```ts
it("POSTs /integrations/installations/{id}/auth/authorize and returns authorize URL", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createMarketplaceCentralClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: async (input, init) => {
      requests.push({ input, init });
      return new Response(
        JSON.stringify({
          authorize_url: "https://provider.example/authorize?state=abc",
          expires_in: 600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const result = await client.startIntegrationAuthorize("inst-1");

  expect(String(requests[0].input)).toBe("http://localhost:8080/integrations/installations/inst-1/auth/authorize");
  expect(requests[0].init?.method).toBe("POST");
  expect(result.authorize_url).toContain("provider.example");
  expect(result.expires_in).toBe(600);
});

it("GETs /integrations/installations/{id}/auth/status", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createMarketplaceCentralClient({
    baseUrl: "http://localhost:8080",
    fetchImpl: async (input, init) => {
      requests.push({ input, init });
      return new Response(
        JSON.stringify({
          installation_id: "inst-1",
          auth_strategy: "oauth2",
          auth_state: "valid",
          health_status: "healthy",
          provider_account_id: "seller-123",
          credential_version: 2,
          capabilities: [
            { code: "catalog_sync", status: "enabled" },
            { code: "fee_sync", status: "enabled" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const result = await client.getIntegrationAuthStatus("inst-1");

  expect(String(requests[0].input)).toBe("http://localhost:8080/integrations/installations/inst-1/auth/status");
  expect(requests[0].init?.method).toBe("GET");
  expect(result.auth_state).toBe("valid");
  expect(result.capabilities[0].code).toBe("catalog_sync");
});
```

- [ ] **Step 2: Run the SDK tests to verify failure**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/sdk-runtime/src/index.test.ts -t "POSTs /integrations/installations/{id}/auth/authorize and returns authorize URL"
```

Expected: FAIL with `client.startIntegrationAuthorize is not a function`.

- [ ] **Step 3: Add the missing SDK types and methods**

Add these types near the other integration types in `packages/sdk-runtime/src/index.ts`:

```ts
export interface IntegrationAuthorizeResponse {
  authorize_url: string;
  expires_in: number;
}

export interface IntegrationCapabilityRuntime {
  code: string;
  status: "enabled" | "degraded" | "requires_reauth" | "disabled";
}

export interface IntegrationAuthStatus {
  installation_id: string;
  auth_strategy: "oauth2" | "api_key" | "token" | "none" | "unknown";
  auth_state: "valid" | "expiring" | "refresh_failed" | "invalid" | "unknown";
  health_status: "healthy" | "warning" | "critical";
  access_token_expires_at?: string;
  last_refresh_at?: string;
  consecutive_failures?: number;
  refresh_failure_code?: string | null;
  provider_account_id?: string;
  credential_version?: number;
  capabilities: IntegrationCapabilityRuntime[];
}

export interface SubmitIntegrationCredentialsRequest {
  credentials: Record<string, string>;
}

export interface IntegrationDisconnectResponse {
  installation_id: string;
  status: "disconnected";
  revocation_result: "succeeded" | "failed" | "not_supported";
  disconnected_at: string;
}
```

Add these client methods inside the returned object from `createMarketplaceCentralClient`:

```ts
startIntegrationAuthorize: (installationId: string) =>
  postJson<IntegrationAuthorizeResponse>(`/integrations/installations/${installationId}/auth/authorize`, {}),
startIntegrationReauth: (installationId: string) =>
  postJson<IntegrationAuthorizeResponse>(`/integrations/installations/${installationId}/reauth/authorize`, {}),
submitIntegrationCredentials: (installationId: string, req: SubmitIntegrationCredentialsRequest) =>
  postJson<IntegrationInstallation>(`/integrations/installations/${installationId}/auth/credentials`, req),
disconnectIntegrationInstallation: (installationId: string) =>
  postJson<IntegrationDisconnectResponse>(`/integrations/installations/${installationId}/disconnect`, {}),
getIntegrationAuthStatus: (installationId: string) =>
  getJson<IntegrationAuthStatus>(`/integrations/installations/${installationId}/auth/status`),
```

- [ ] **Step 4: Run the focused SDK tests to verify they pass**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/sdk-runtime/src/index.test.ts -t "POSTs /integrations/installations/{id}/auth/authorize and returns authorize URL|GETs /integrations/installations/{id}/auth/status"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-runtime/src/index.ts packages/sdk-runtime/src/index.test.ts
git commit -m "feat(sdk-runtime): add integration auth runtime methods"
```

## Task 2: Scaffold `feature-integrations` with Loading, Error, and Empty States

**Files:**
- Create: `packages/feature-integrations/package.json`
- Create: `packages/feature-integrations/src/index.ts`
- Create: `packages/feature-integrations/src/IntegrationsHubPage.tsx`
- Create: `packages/feature-integrations/src/IntegrationsHubPage.test.tsx`

- [ ] **Step 1: Write the failing page-shell tests**

Create `packages/feature-integrations/src/IntegrationsHubPage.test.tsx` with:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { IntegrationsHubPage } from "./IntegrationsHubPage";

const baseClient = {
  listIntegrationProviders: vi.fn(),
  listIntegrationInstallations: vi.fn(),
  listIntegrationOperationRuns: vi.fn(),
  getIntegrationAuthStatus: vi.fn(),
  startIntegrationAuthorize: vi.fn(),
  startIntegrationReauth: vi.fn(),
  submitIntegrationCredentials: vi.fn(),
  disconnectIntegrationInstallation: vi.fn(),
  startIntegrationFeeSync: vi.fn(),
};

describe("IntegrationsHubPage", () => {
  it("renders empty state when there are no installations", async () => {
    const client = {
      ...baseClient,
      listIntegrationProviders: vi.fn().mockResolvedValue({ items: [] }),
      listIntegrationInstallations: vi.fn().mockResolvedValue({ items: [] }),
    };

    render(
      <MemoryRouter initialEntries={["/integrations"]}>
        <IntegrationsHubPage client={client} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/no integrations connected yet/i)).toBeInTheDocument());
  });

  it("renders error state when list loading fails", async () => {
    const client = {
      ...baseClient,
      listIntegrationProviders: vi.fn().mockResolvedValue({ items: [] }),
      listIntegrationInstallations: vi.fn().mockRejectedValue({ error: { message: "backend unavailable" } }),
    };

    render(
      <MemoryRouter initialEntries={["/integrations"]}>
        <IntegrationsHubPage client={client} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the page-shell tests to verify failure**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx
```

Expected: FAIL because `packages/feature-integrations` does not exist yet.

- [ ] **Step 3: Create the package and minimal page implementation**

Create `packages/feature-integrations/package.json`:

```json
{
  "name": "@marketplace-central/feature-integrations",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@marketplace-central/sdk-runtime": "0.1.0",
    "react": "^19.2.0",
    "react-router-dom": "^7.7.1"
  }
}
```

Create `packages/feature-integrations/src/index.ts`:

```ts
export { IntegrationsHubPage } from "./IntegrationsHubPage";
```

Create `packages/feature-integrations/src/IntegrationsHubPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import type {
  IntegrationInstallation,
  IntegrationProviderDefinition,
  IntegrationOperationRun,
  IntegrationAuthStatus,
} from "@marketplace-central/sdk-runtime";

interface IntegrationsClient {
  listIntegrationProviders: () => Promise<{ items: IntegrationProviderDefinition[] }>;
  listIntegrationInstallations: () => Promise<{ items: IntegrationInstallation[] }>;
  listIntegrationOperationRuns: (installationId: string) => Promise<{ items: IntegrationOperationRun[] }>;
  getIntegrationAuthStatus: (installationId: string) => Promise<IntegrationAuthStatus>;
  startIntegrationAuthorize: (installationId: string) => Promise<{ authorize_url: string; expires_in: number }>;
  startIntegrationReauth: (installationId: string) => Promise<{ authorize_url: string; expires_in: number }>;
  submitIntegrationCredentials: (installationId: string, req: { credentials: Record<string, string> }) => Promise<IntegrationInstallation>;
  disconnectIntegrationInstallation: (installationId: string) => Promise<{ installation_id: string; status: "disconnected" }>;
  startIntegrationFeeSync: (installationId: string) => Promise<{ installation_id: string; operation_run_id: string; status: "queued" }>;
}

export function IntegrationsHubPage({ client }: { client: IntegrationsClient }) {
  const [installations, setInstallations] = useState<IntegrationInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await client.listIntegrationProviders();
        const result = await client.listIntegrationInstallations();
        if (!cancelled) setInstallations(result.items);
      } catch (err) {
        const message = (err as { error?: { message?: string } })?.error?.message ?? "Failed to load integrations.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (loading) return <div className="rounded-3xl border border-slate-200 bg-white p-6">Loading integrations...</div>;
  if (error) return <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  if (installations.length === 0) return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8">No integrations connected yet.</div>;

  return <div>Integrations hub</div>;
}
```

- [ ] **Step 4: Run the page-shell tests to verify they pass**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-integrations/package.json packages/feature-integrations/src/index.ts packages/feature-integrations/src/IntegrationsHubPage.tsx packages/feature-integrations/src/IntegrationsHubPage.test.tsx
git commit -m "feat(integrations-ui): scaffold integrations runtime hub"
```

## Task 3: Add Installation Grid, KPI Summary, Filters, and URL-Synced Selection

**Files:**
- Create: `packages/feature-integrations/src/components/OperationalSummary.tsx`
- Create: `packages/feature-integrations/src/components/FilterBar.tsx`
- Create: `packages/feature-integrations/src/components/InstallationCard.tsx`
- Modify: `packages/feature-integrations/src/IntegrationsHubPage.tsx`
- Modify: `packages/feature-integrations/src/IntegrationsHubPage.test.tsx`

- [ ] **Step 1: Write the failing interaction tests**

Add these tests to `packages/feature-integrations/src/IntegrationsHubPage.test.tsx`:

```ts
it("filters installations by provider and needs-action", async () => {
  const client = {
    ...baseClient,
    listIntegrationProviders: vi.fn().mockResolvedValue({ items: [{ provider_code: "mercado_livre", display_name: "Mercado Livre" }] }),
    listIntegrationInstallations: vi.fn().mockResolvedValue({
      items: [
        {
          installation_id: "inst-1",
          tenant_id: "t1",
          provider_code: "mercado_livre",
          family: "marketplace",
          display_name: "ML Main",
          status: "connected",
          health_status: "healthy",
          external_account_id: "seller-1",
          external_account_name: "Seller One",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
        },
        {
          installation_id: "inst-2",
          tenant_id: "t1",
          provider_code: "magalu",
          family: "marketplace",
          display_name: "Magalu Ops",
          status: "requires_reauth",
          health_status: "critical",
          external_account_id: "seller-2",
          external_account_name: "Seller Two",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
        },
      ],
    }),
  };

  render(
    <MemoryRouter initialEntries={["/integrations"]}>
      <IntegrationsHubPage client={client} />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByText("ML Main")).toBeInTheDocument());
  expect(screen.getByText("Magalu Ops")).toBeInTheDocument();
});

it("opens drawer selection from query string", async () => {
  const client = {
    ...baseClient,
    listIntegrationProviders: vi.fn().mockResolvedValue({ items: [] }),
    listIntegrationInstallations: vi.fn().mockResolvedValue({
      items: [
        {
          installation_id: "inst-99",
          tenant_id: "t1",
          provider_code: "mercado_livre",
          family: "marketplace",
          display_name: "Preselected Installation",
          status: "connected",
          health_status: "healthy",
          external_account_id: "seller-99",
          external_account_name: "Seller Ninety Nine",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
        },
      ],
    }),
  };

  render(
    <MemoryRouter initialEntries={["/integrations?installation=inst-99"]}>
      <IntegrationsHubPage client={client} />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByRole("dialog", { name: /integration details/i })).toBeInTheDocument());
});
```

- [ ] **Step 2: Run the interaction tests to verify failure**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx -t "filters installations by provider and needs-action|opens drawer selection from query string"
```

Expected: FAIL because the page still renders a static `Integrations hub`.

- [ ] **Step 3: Implement summary, filters, cards, and URL selection**

Create `packages/feature-integrations/src/components/OperationalSummary.tsx`:

```tsx
import type { IntegrationInstallation, IntegrationOperationRun } from "@marketplace-central/sdk-runtime";

export function OperationalSummary({
  installations,
  runs,
  onQuickFilter,
}: {
  installations: IntegrationInstallation[];
  runs: IntegrationOperationRun[];
  onQuickFilter: (filter: "connected" | "requires_reauth" | "warning" | "critical" | "sync_failures") => void;
}) {
  const connected = installations.filter((item) => item.status === "connected").length;
  const requiresReauth = installations.filter((item) => item.status === "requires_reauth").length;
  const warning = installations.filter((item) => item.health_status === "warning").length;
  const critical = installations.filter((item) => item.health_status === "critical").length;
  const syncFailures = runs.filter((item) => item.operation_type === "fee_sync" && item.status === "failed").length;

  return (
    <div className="grid gap-3 md:grid-cols-5">
      {[
        ["Connected", connected, "connected"],
        ["Requires Reauth", requiresReauth, "requires_reauth"],
        ["Warning", warning, "warning"],
        ["Critical", critical, "critical"],
        ["Sync Failures (24h)", syncFailures, "sync_failures"],
      ].map(([label, value, key]) => (
        <button key={String(key)} type="button" onClick={() => onQuickFilter(key as never)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left">
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
        </button>
      ))}
    </div>
  );
}
```

Create `packages/feature-integrations/src/components/FilterBar.tsx`:

```tsx
export function FilterBar({
  providerFilter,
  statusFilter,
  healthFilter,
  needsActionOnly,
  search,
  providerOptions,
  onProviderFilterChange,
  onStatusFilterChange,
  onHealthFilterChange,
  onNeedsActionOnlyChange,
  onSearchChange,
}: {
  providerFilter: string;
  statusFilter: string;
  healthFilter: string;
  needsActionOnly: boolean;
  search: string;
  providerOptions: Array<{ value: string; label: string }>;
  onProviderFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onHealthFilterChange: (value: string) => void;
  onNeedsActionOnlyChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_160px_160px_160px_auto]">
      <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by installation, provider, or account" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      <select value={providerFilter} onChange={(event) => onProviderFilterChange(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="all">All providers</option>
        {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="all">All statuses</option>
        <option value="connected">Connected</option>
        <option value="pending_connection">Pending</option>
        <option value="requires_reauth">Requires reauth</option>
      </select>
      <select value={healthFilter} onChange={(event) => onHealthFilterChange(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="all">All health</option>
        <option value="healthy">Healthy</option>
        <option value="warning">Warning</option>
        <option value="critical">Critical</option>
      </select>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <input type="checkbox" checked={needsActionOnly} onChange={(event) => onNeedsActionOnlyChange(event.target.checked)} />
        Needs action
      </label>
    </div>
  );
}
```

Create `packages/feature-integrations/src/components/InstallationCard.tsx`:

```tsx
import type { IntegrationInstallation, IntegrationOperationRun } from "@marketplace-central/sdk-runtime";

export function InstallationCard({
  installation,
  latestRun,
  selected,
  onSelect,
}: {
  installation: IntegrationInstallation;
  latestRun?: IntegrationOperationRun;
  selected: boolean;
  onSelect: (installationId: string) => void;
}) {
  return (
    <button type="button" onClick={() => onSelect(installation.installation_id)} className={selected ? "rounded-3xl border-2 border-blue-500 bg-blue-50 p-5 text-left" : "rounded-3xl border border-slate-200 bg-white p-5 text-left"}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{installation.display_name}</div>
          <div className="text-xs text-slate-500">{installation.provider_code}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">{installation.status}</div>
          <div className="text-xs text-slate-600">{installation.health_status}</div>
        </div>
      </div>
      <div className="mt-4 text-sm text-slate-700">{installation.external_account_name || installation.external_account_id || "Account pending"}</div>
      <div className="mt-3 text-xs text-slate-500">
        Last operation: {latestRun ? `${latestRun.operation_type} / ${latestRun.status}` : "No operations yet"}
      </div>
    </button>
  );
}
```

Update `packages/feature-integrations/src/IntegrationsHubPage.tsx` to use router state:

```tsx
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OperationalSummary } from "./components/OperationalSummary";
import { FilterBar } from "./components/FilterBar";
import { InstallationCard } from "./components/InstallationCard";
import { InstallationDrawer } from "./components/InstallationDrawer";

const [searchParams, setSearchParams] = useSearchParams();
const selectedInstallationId = searchParams.get("installation");
const deferredSearch = useDeferredValue(search);

const visibleInstallations = installations.filter((item) => {
  if (providerFilter !== "all" && item.provider_code !== providerFilter) return false;
  if (statusFilter !== "all" && item.status !== statusFilter) return false;
  if (healthFilter !== "all" && item.health_status !== healthFilter) return false;
  if (needsActionOnly && !["requires_reauth", "failed", "disconnected"].includes(item.status)) return false;
  if (!deferredSearch.trim()) return true;
  const haystack = `${item.display_name} ${item.external_account_id} ${item.external_account_name} ${item.provider_code}`.toLowerCase();
  return haystack.includes(deferredSearch.toLowerCase());
});

function handleSelectInstallation(installationId: string) {
  startTransition(() => {
    const next = new URLSearchParams(searchParams);
    next.set("installation", installationId);
    setSearchParams(next);
  });
}
```

- [ ] **Step 4: Run the interaction tests to verify they pass**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx -t "filters installations by provider and needs-action|opens drawer selection from query string"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-integrations/src/components/OperationalSummary.tsx packages/feature-integrations/src/components/FilterBar.tsx packages/feature-integrations/src/components/InstallationCard.tsx packages/feature-integrations/src/IntegrationsHubPage.tsx packages/feature-integrations/src/IntegrationsHubPage.test.tsx
git commit -m "feat(integrations-ui): add hub grid filters and selection"
```

## Task 4: Implement Drawer Runtime Modules and Operational Actions

**Files:**
- Create: `packages/feature-integrations/src/components/InstallationDrawer.tsx`
- Create: `packages/feature-integrations/src/components/AuthStatusPanel.tsx`
- Create: `packages/feature-integrations/src/components/OperationsTimeline.tsx`
- Modify: `packages/feature-integrations/src/IntegrationsHubPage.tsx`
- Modify: `packages/feature-integrations/src/IntegrationsHubPage.test.tsx`

- [ ] **Step 1: Write the failing drawer/action tests**

Add these tests to `packages/feature-integrations/src/IntegrationsHubPage.test.tsx`:

```ts
import userEvent from "@testing-library/user-event";

const connectedInstallation = {
  installation_id: "inst-1",
  tenant_id: "t1",
  provider_code: "mercado_livre",
  family: "marketplace",
  display_name: "Connected Installation",
  status: "connected",
  health_status: "healthy",
  external_account_id: "seller-1",
  external_account_name: "Seller One",
  created_at: "2026-04-11T00:00:00Z",
  updated_at: "2026-04-11T00:00:00Z",
};

const validAuthStatus = {
  installation_id: "inst-1",
  auth_strategy: "oauth2",
  auth_state: "valid",
  health_status: "healthy",
  provider_account_id: "seller-1",
  credential_version: 2,
  capabilities: [{ code: "fee_sync", status: "enabled" }],
};

it("calls authorize action for a pending installation", async () => {
  const client = {
    ...baseClient,
    listIntegrationProviders: vi.fn().mockResolvedValue({ items: [] }),
    listIntegrationInstallations: vi.fn().mockResolvedValue({
      items: [
        {
          installation_id: "inst-1",
          tenant_id: "t1",
          provider_code: "mercado_livre",
          family: "marketplace",
          display_name: "Pending OAuth",
          status: "pending_connection",
          health_status: "warning",
          external_account_id: "",
          external_account_name: "",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
        },
      ],
    }),
    getIntegrationAuthStatus: vi.fn().mockResolvedValue({
      installation_id: "inst-1",
      auth_strategy: "oauth2",
      auth_state: "expiring",
      health_status: "warning",
      capabilities: [],
    }),
    listIntegrationOperationRuns: vi.fn().mockResolvedValue({ items: [] }),
    startIntegrationAuthorize: vi.fn().mockResolvedValue({
      authorize_url: "https://provider.example/oauth",
      expires_in: 600,
    }),
  };

  const assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {});

  render(
    <MemoryRouter initialEntries={["/integrations?installation=inst-1"]}>
      <IntegrationsHubPage client={client} />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByRole("button", { name: /authorize/i })).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /authorize/i }));

  expect(client.startIntegrationAuthorize).toHaveBeenCalledWith("inst-1");
  expect(assignSpy).toHaveBeenCalledWith("https://provider.example/oauth");
});

it("queues fee sync and refreshes drawer timeline", async () => {
  const client = {
    ...baseClient,
    listIntegrationProviders: vi.fn().mockResolvedValue({ items: [] }),
    listIntegrationInstallations: vi.fn().mockResolvedValue({ items: [connectedInstallation] }),
    getIntegrationAuthStatus: vi.fn().mockResolvedValue(validAuthStatus),
    listIntegrationOperationRuns: vi.fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [
          {
            operation_run_id: "run-1",
            installation_id: "inst-1",
            operation_type: "fee_sync",
            status: "queued",
            result_code: "",
            failure_code: "",
            attempt_count: 1,
            actor_type: "user",
            actor_id: "tenant_default",
            created_at: "2026-04-11T00:00:00Z",
            updated_at: "2026-04-11T00:00:00Z",
          },
        ],
      }),
    startIntegrationFeeSync: vi.fn().mockResolvedValue({
      installation_id: "inst-1",
      operation_run_id: "run-1",
      status: "queued",
    }),
  };

  render(
    <MemoryRouter initialEntries={["/integrations?installation=inst-1"]}>
      <IntegrationsHubPage client={client} />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByRole("button", { name: /run fee sync/i })).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /run fee sync/i }));

  expect(client.startIntegrationFeeSync).toHaveBeenCalledWith("inst-1");
  await waitFor(() => expect(screen.getByText(/queued/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run the drawer/action tests to verify failure**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx -t "calls authorize action for a pending installation|queues fee sync and refreshes drawer timeline"
```

Expected: FAIL because the drawer and action handlers do not exist.

- [ ] **Step 3: Implement the drawer modules and handlers**

Create `packages/feature-integrations/src/components/AuthStatusPanel.tsx`:

```tsx
import type { IntegrationAuthStatus, IntegrationInstallation } from "@marketplace-central/sdk-runtime";

export function AuthStatusPanel({
  installation,
  authStatus,
  actionPending,
  onAuthorize,
  onReauth,
  onDisconnect,
}: {
  installation: IntegrationInstallation;
  authStatus: IntegrationAuthStatus | null;
  actionPending: string | null;
  onAuthorize: () => Promise<void>;
  onReauth: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Auth lifecycle</div>
        <div className="mt-2 text-sm text-slate-900">Strategy: {authStatus?.auth_strategy ?? "unknown"}</div>
        <div className="text-sm text-slate-700">State: {authStatus?.auth_state ?? "unknown"}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {installation.status === "pending_connection" && (
          <button type="button" onClick={onAuthorize} disabled={actionPending === "authorize"} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            Authorize
          </button>
        )}
        {installation.status === "requires_reauth" && (
          <button type="button" onClick={onReauth} disabled={actionPending === "reauth"} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white">
            Reauthorize
          </button>
        )}
        {["connected", "requires_reauth"].includes(installation.status) && (
          <button type="button" onClick={onDisconnect} disabled={actionPending === "disconnect"} className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700">
            Disconnect
          </button>
        )}
      </div>
    </section>
  );
}
```

Create `packages/feature-integrations/src/components/OperationsTimeline.tsx`:

```tsx
import type { IntegrationOperationRun } from "@marketplace-central/sdk-runtime";

export function OperationsTimeline({ runs }: { runs: IntegrationOperationRun[] }) {
  if (runs.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No operation runs yet.</div>;
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <article key={run.operation_run_id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-900">{run.operation_type}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{run.status}</div>
          </div>
          <div className="mt-2 text-xs text-slate-600">Result: {run.result_code || "n/a"} | Failure: {run.failure_code || "n/a"}</div>
        </article>
      ))}
    </div>
  );
}
```

Create `packages/feature-integrations/src/components/InstallationDrawer.tsx`:

```tsx
import type { IntegrationAuthStatus, IntegrationInstallation, IntegrationOperationRun } from "@marketplace-central/sdk-runtime";
import { AuthStatusPanel } from "./AuthStatusPanel";
import { OperationsTimeline } from "./OperationsTimeline";

export function InstallationDrawer({
  installation,
  authStatus,
  runs,
  actionPending,
  onClose,
  onAuthorize,
  onReauth,
  onDisconnect,
  onFeeSync,
}: {
  installation: IntegrationInstallation;
  authStatus: IntegrationAuthStatus | null;
  runs: IntegrationOperationRun[];
  actionPending: string | null;
  onClose: () => void;
  onAuthorize: () => Promise<void>;
  onReauth: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onFeeSync: () => Promise<void>;
}) {
  return (
    <aside role="dialog" aria-label="Integration details" className="fixed right-0 top-0 h-full w-[420px] overflow-y-auto border-l border-slate-200 bg-slate-50 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900">{installation.display_name}</div>
          <div className="text-xs text-slate-500">{installation.installation_id}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-3 py-1 text-sm">Close</button>
      </div>
      <AuthStatusPanel installation={installation} authStatus={authStatus} actionPending={actionPending} onAuthorize={onAuthorize} onReauth={onReauth} onDisconnect={onDisconnect} />
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">Sync operations</div>
        <button type="button" onClick={onFeeSync} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Run Fee Sync</button>
      </div>
      <div className="mt-4">
        <OperationsTimeline runs={runs} />
      </div>
    </aside>
  );
}
```

Update `packages/feature-integrations/src/IntegrationsHubPage.tsx` with per-installation action handlers:

```tsx
async function handleAuthorize(installationId: string) {
  setActionPendingMap((current) => ({ ...current, [installationId]: "authorize" }));
  try {
    const result = await client.startIntegrationAuthorize(installationId);
    window.location.assign(result.authorize_url);
  } finally {
    setActionPendingMap((current) => ({ ...current, [installationId]: null }));
  }
}

async function handleFeeSync(installationId: string) {
  setInlineNotice("Fee sync queued.");
  await client.startIntegrationFeeSync(installationId);
  const runs = await client.listIntegrationOperationRuns(installationId);
  setOperationRunsByInstallation((current) => ({ ...current, [installationId]: runs.items }));
}
```

- [ ] **Step 4: Run the drawer/action tests to verify they pass**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/feature-integrations/src/IntegrationsHubPage.test.tsx -t "calls authorize action for a pending installation|queues fee sync and refreshes drawer timeline"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-integrations/src/components/InstallationDrawer.tsx packages/feature-integrations/src/components/AuthStatusPanel.tsx packages/feature-integrations/src/components/OperationsTimeline.tsx packages/feature-integrations/src/IntegrationsHubPage.tsx packages/feature-integrations/src/IntegrationsHubPage.test.tsx
git commit -m "feat(integrations-ui): add drawer runtime actions and timeline"
```

## Task 5: Wire the New Feature into `apps/web` and Add Route Smoke Coverage

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/AppRouter.tsx`
- Modify: `apps/web/src/app/Layout.tsx`
- Modify: `apps/web/src/index.css`
- Create: `apps/web/src/app/AppRouter.test.tsx`

- [ ] **Step 1: Write the failing route smoke test**

Create `apps/web/src/app/AppRouter.test.tsx`:

```ts
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
```

- [ ] **Step 2: Run the route smoke test to verify failure**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run apps/web/src/app/AppRouter.test.tsx
```

Expected: FAIL because the route and dependency do not exist yet.

- [ ] **Step 3: Register the route, sidebar nav, and Tailwind source**

Modify `apps/web/package.json` dependencies:

```json
"@marketplace-central/feature-integrations": "0.1.0",
```

Modify `apps/web/src/app/AppRouter.tsx`:

```tsx
import { IntegrationsHubPage } from "@marketplace-central/feature-integrations";

function IntegrationsHubPageWrapper() {
  const client = useClient();
  return <IntegrationsHubPage client={client} />;
}

<Route path="/integrations" element={<IntegrationsHubPageWrapper />} />
```

Modify `apps/web/src/app/Layout.tsx`:

```tsx
import { ActivitySquare } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/classifications", label: "Classifications", icon: Tags },
  { to: "/connectors/vtex", label: "VTEX Publisher", icon: Send },
  { to: "/marketplaces", label: "Marketplaces", icon: Store },
  { to: "/integrations", label: "Integrations", icon: ActivitySquare },
  { to: "/simulator", label: "Pricing Simulator", icon: Calculator },
];
```

Modify `apps/web/src/index.css`:

```css
@source "../../../packages/feature-integrations/src";
```

- [ ] **Step 4: Run the route smoke test to verify it passes**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run apps/web/src/app/AppRouter.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/app/AppRouter.tsx apps/web/src/app/Layout.tsx apps/web/src/index.css apps/web/src/app/AppRouter.test.tsx
git commit -m "feat(web): wire integrations runtime hub route"
```

## Task 6: Regression Verification and Frontend Done Gate

**Files:**
- Verify only; no new files expected unless test fixes are required.

- [ ] **Step 1: Run the focused frontend test suites**

Run:

```bash
npm exec --workspace @marketplace-central/web vitest run packages/sdk-runtime/src/index.test.ts packages/feature-integrations/src/IntegrationsHubPage.test.tsx apps/web/src/app/AppRouter.test.tsx packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the web build**

Run:

```bash
npm run build --workspace @marketplace-central/web
```

Expected: PASS with zero TypeScript/Vite errors.

- [ ] **Step 3: Run a browser smoke pass on localhost**

Run:

```bash
npm run dev --workspace @marketplace-central/web
```

Manual checks:
1. `/marketplaces` still renders and behaves as before.
2. `/integrations` shows loading, empty, or populated state correctly.
3. Selecting a card opens the right drawer.
4. Contextual actions match installation state.
5. Refreshing a deep link like `/integrations?installation=inst-1` preserves drawer selection.

- [ ] **Step 4: Commit the final verified frontend slice**

```bash
git add packages/sdk-runtime/src/index.ts packages/sdk-runtime/src/index.test.ts packages/feature-integrations apps/web/package.json apps/web/src/app/AppRouter.tsx apps/web/src/app/Layout.tsx apps/web/src/index.css apps/web/src/app/AppRouter.test.tsx
git commit -m "feat(integrations): deliver runtime hub UI for T-028"
```

## Self-Review Notes

Spec coverage:
1. Dedicated `/integrations` hub: Tasks 2, 3, 5.
2. Grid + right drawer IA: Tasks 3 and 4.
3. Auth lifecycle actions: Tasks 1 and 4.
4. Fee sync trigger and timeline: Tasks 1 and 4.
5. Route wiring and app navigation: Task 5.
6. Loading/error/empty states and regression safety: Tasks 2 and 6.

Placeholder scan:
1. No `TBD`, `TODO`, or deferred code markers remain.
2. Each task contains exact file paths, code snippets, and test/build commands.

Type consistency:
1. SDK method names stay consistent across the plan:
   - `startIntegrationAuthorize`
   - `startIntegrationReauth`
   - `submitIntegrationCredentials`
   - `disconnectIntegrationInstallation`
   - `getIntegrationAuthStatus`
2. The feature package consumes the same method names and response shapes defined in Task 1.
