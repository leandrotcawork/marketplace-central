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
