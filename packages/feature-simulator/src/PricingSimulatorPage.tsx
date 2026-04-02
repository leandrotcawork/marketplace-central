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
            {field("commission_percent", "Commission (0.16 = 16%)", "0.16")}
            {field("fixed_fee_amount", "Fixed Fee (R$)", "5.00")}
            {field("shipping_amount", "Shipping (R$)", "10.00")}
            {field("min_margin_percent", "Min Margin (0.10 = 10%)", "0.10")}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={submitting}>Simulate</Button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}
