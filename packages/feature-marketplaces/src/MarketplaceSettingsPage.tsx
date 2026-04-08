import { useEffect, useState } from "react";
import { Button, SurfaceCard } from "@marketplace-central/ui";
import type {
  MarketplaceAccount,
  MarketplaceDefinition,
  MarketplacePolicy,
  CreateMarketplaceAccountRequest,
  CreateMarketplacePolicyRequest,
} from "@marketplace-central/sdk-runtime";

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

const emptyAccount: CreateMarketplaceAccountRequest = {
  account_id: "",
  channel_code: "",
  display_name: "",
  connection_mode: "",
  marketplace_code: "",
  credentials_json: {},
};

const emptyPolicy = {
  policy_id: "",
  account_id: "",
  commission_percent: "",
  fixed_fee_amount: "",
  default_shipping: "",
  min_margin_percent: "",
  sla_question_minutes: "",
  sla_dispatch_hours: "",
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

function numField(id: string, label: string, placeholder: string, value: string, onChange: (v: string) => void) {
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

export function MarketplaceSettingsPage({ client }: MarketplaceSettingsPageProps) {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [policies, setPolicies] = useState<MarketplacePolicy[]>([]);
  const [definitions, setDefinitions] = useState<MarketplaceDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(true);
  const [definitionsError, setDefinitionsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<CreateMarketplaceAccountRequest>(emptyAccount);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [policyForm, setPolicyForm] = useState(emptyPolicy);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [submittingPolicy, setSubmittingPolicy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const selectedDefinition = definitions.find(
    (d) => d.marketplace_code === accountForm.marketplace_code
  ) ?? null;

  async function load() {
    try {
      const [accsRes, polsRes] = await Promise.all([
        client.listMarketplaceAccounts(),
        client.listMarketplacePolicies(),
      ]);
      setAccounts(accsRes.items);
      setPolicies(polsRes.items);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.error?.message ?? "Failed to load marketplace data.");
    }
  }

  async function loadDefinitions() {
    setLoadingDefinitions(true);
    setDefinitionsError(null);
    try {
      const res = await client.listMarketplaceDefinitions();
      setDefinitions(res.items);
    } catch (err: any) {
      setDefinitionsError(err?.error?.message ?? "Failed to load marketplace definitions.");
    } finally {
      setLoadingDefinitions(false);
    }
  }

  useEffect(() => {
    load();
    loadDefinitions();
  }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingAccount(true);
    setAccountError(null);
    try {
      await client.createMarketplaceAccount({
        ...accountForm,
        marketplace_code: accountForm.marketplace_code || undefined,
        credentials_json: Object.keys(credentials).length > 0 ? credentials : undefined,
      });
      setAccountForm(emptyAccount);
      setCredentials({});
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
      await client.createMarketplacePolicy({
        policy_id: policyForm.policy_id,
        account_id: policyForm.account_id,
        commission_percent: parseFloat(policyForm.commission_percent) || 0,
        fixed_fee_amount: parseFloat(policyForm.fixed_fee_amount) || 0,
        default_shipping: parseFloat(policyForm.default_shipping) || 0,
        min_margin_percent: parseFloat(policyForm.min_margin_percent) || 0,
        sla_question_minutes: parseInt(policyForm.sla_question_minutes, 10) || 0,
        sla_dispatch_hours: parseInt(policyForm.sla_dispatch_hours, 10) || 0,
      });
      setPolicyForm(emptyPolicy);
      await load();
    } catch (err: any) {
      setPolicyError(err?.error?.message ?? "Failed to create policy.");
    } finally {
      setSubmittingPolicy(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-6 max-w-4xl">
        <h2 className="text-xl font-semibold text-slate-900">Marketplace Settings</h2>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Marketplace Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your marketplace accounts and pricing policies.</p>
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
                <li key={a.account_id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.display_name}</p>
                    <p className="text-xs text-slate-400">{a.channel_code} · {a.account_id}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {a.status}
                  </span>
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
            {textField("display_name", "Display Name", "My VTEX Store", accountForm.display_name, (v) => setAccountForm((f) => ({ ...f, display_name: v })))}
            {textField("connection_mode", "Connection Mode", "api", accountForm.connection_mode, (v) => setAccountForm((f) => ({ ...f, connection_mode: v })))}

            {/* Marketplace selection from definitions */}
            <div className="col-span-2 space-y-1">
              <label htmlFor="marketplace_code" className="block text-sm font-medium text-slate-700">Marketplace</label>
              {loadingDefinitions ? (
                <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400">Loading marketplaces…</div>
              ) : definitionsError ? (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{definitionsError}</div>
              ) : definitions.length === 0 ? (
                <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400">No marketplace definitions available.</div>
              ) : (
                <select
                  id="marketplace_code"
                  value={accountForm.marketplace_code ?? ""}
                  onChange={(e) => {
                    const code = e.target.value;
                    setAccountForm((f) => ({ ...f, marketplace_code: code, channel_code: code }));
                    setCredentials({});
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Select a marketplace —</option>
                  {definitions.map((d) => (
                    <option key={d.marketplace_code} value={d.marketplace_code}>{d.display_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Dynamic credential fields from credential_schema */}
            {selectedDefinition && selectedDefinition.credential_schema.length > 0 && (
              <>
                <div className="col-span-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Credentials</p>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedDefinition.credential_schema.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label htmlFor={`cred_${field.key}`} className="block text-sm font-medium text-slate-700">{field.label}</label>
                        <input
                          id={`cred_${field.key}`}
                          type={field.secret ? "password" : "text"}
                          placeholder={field.label}
                          value={credentials[field.key] ?? ""}
                          onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

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
            {textField("policy_account_id", "Linked Account", "acc-001", policyForm.account_id, (v) => setPolicyForm((f) => ({ ...f, account_id: v })))}
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
