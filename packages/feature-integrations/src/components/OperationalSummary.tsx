export type OperationalQuickFilter =
  | "connected"
  | "requires_reauth"
  | "warning"
  | "critical"
  | "sync_failures";

interface OperationalSummaryProps {
  connectedCount: number;
  requiresReauthCount: number;
  warningCount: number;
  criticalCount: number;
  syncFailures24hCount: number;
  activeQuickFilter: OperationalQuickFilter | null;
  onQuickFilter: (next: OperationalQuickFilter | null) => void;
}

function SummaryMetric({
  label,
  value,
  helper,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  helper: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors",
        selected
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-slate-300",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </button>
  );
}

export function OperationalSummary({
  connectedCount,
  requiresReauthCount,
  warningCount,
  criticalCount,
  syncFailures24hCount,
  activeQuickFilter,
  onQuickFilter,
}: OperationalSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryMetric
        label="Connected"
        value={String(connectedCount)}
        helper="Healthy and ready for sync"
        selected={activeQuickFilter === "connected"}
        onClick={() => onQuickFilter(activeQuickFilter === "connected" ? null : "connected")}
      />
      <SummaryMetric
        label="Requires reauth"
        value={String(requiresReauthCount)}
        helper="Needs auth lifecycle action"
        selected={activeQuickFilter === "requires_reauth"}
        onClick={() => onQuickFilter(activeQuickFilter === "requires_reauth" ? null : "requires_reauth")}
      />
      <SummaryMetric
        label="Warning"
        value={String(warningCount)}
        helper="Auth health degraded"
        selected={activeQuickFilter === "warning"}
        onClick={() => onQuickFilter(activeQuickFilter === "warning" ? null : "warning")}
      />
      <SummaryMetric
        label="Critical"
        value={String(criticalCount)}
        helper="Immediate operator action"
        selected={activeQuickFilter === "critical"}
        onClick={() => onQuickFilter(activeQuickFilter === "critical" ? null : "critical")}
      />
      <SummaryMetric
        label="Sync failures (24h)"
        value={String(syncFailures24hCount)}
        helper="Recent failed fee-sync operations"
        selected={activeQuickFilter === "sync_failures"}
        onClick={() => onQuickFilter(activeQuickFilter === "sync_failures" ? null : "sync_failures")}
      />
    </div>
  );
}
