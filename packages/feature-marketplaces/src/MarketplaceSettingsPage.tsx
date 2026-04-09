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
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setLoadError(e?.error?.message ?? "Failed to load marketplace data.");
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
    ? (definitions.find((d) => {
        const raw = d as unknown as Record<string, unknown>;
        const code = (raw.marketplace_code ?? raw.code ?? "") as string;
        return code === panelAccount.channel_code;
      }) ?? null)
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
          aria-label="Connect Marketplace"
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
