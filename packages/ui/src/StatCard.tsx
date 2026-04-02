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
