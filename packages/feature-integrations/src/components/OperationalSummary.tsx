interface OperationalSummaryProps {
  totalCount: number;
  connectedCount: number;
  needsActionCount: number;
  providerCount: number;
}

function SummaryMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

export function OperationalSummary({
  totalCount,
  connectedCount,
  needsActionCount,
  providerCount,
}: OperationalSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric
        label="Total installations"
        value={String(totalCount)}
        helper="Loaded from the integrations registry"
      />
      <SummaryMetric
        label="Connected"
        value={String(connectedCount)}
        helper="Healthy and ready for sync"
      />
      <SummaryMetric
        label="Needs action"
        value={String(needsActionCount)}
        helper="Requires auth or attention"
      />
      <SummaryMetric
        label="Providers"
        value={String(providerCount)}
        helper="Provider metadata available"
      />
    </div>
  );
}
