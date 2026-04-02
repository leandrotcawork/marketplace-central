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
