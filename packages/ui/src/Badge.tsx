type Status = "pending" | "in_progress" | "succeeded" | "failed" | "completed";

const config: Record<Status, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", classes: "bg-blue-100 text-blue-700" },
  succeeded: { label: "Succeeded", classes: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", classes: "bg-red-100 text-red-700" },
  completed: { label: "Completed", classes: "bg-emerald-100 text-emerald-700" },
};

interface BadgeProps {
  status: Status;
  className?: string;
}

export function Badge({ status, className = "" }: BadgeProps) {
  const { label, classes } = config[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes} ${className}`}>{label}</span>;
}
