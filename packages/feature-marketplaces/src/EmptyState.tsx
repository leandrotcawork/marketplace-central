import { Store, Plus } from "lucide-react";

interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Store className="w-12 h-12 text-slate-200 mb-4" />
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        No marketplaces connected
      </h3>
      <p className="text-sm text-slate-400 max-w-xs mb-6">
        Connect your first marketplace to start managing channels and pricing policies.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="
          inline-flex items-center gap-2
          px-4 py-2 bg-orange-500 hover:bg-orange-600
          text-white text-sm font-semibold
          rounded-lg shadow-sm transition-all duration-150 cursor-pointer
        "
      >
        <Plus className="w-4 h-4" />
        Connect Marketplace
      </button>
    </div>
  );
}
