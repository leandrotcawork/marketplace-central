import { Plus } from "lucide-react";

interface AddAccountCardProps {
  onAdd: () => void;
}

export function AddAccountCard({ onAdd }: AddAccountCardProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Connect new marketplace"
      className="
        flex flex-col items-center justify-center gap-2
        rounded-2xl p-5 min-h-[184px]
        border-2 border-dashed border-slate-200
        bg-white text-slate-400
        hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-500
        transition-all duration-150 cursor-pointer w-full
      "
    >
      <Plus className="w-6 h-6" />
      <span className="text-sm font-medium">Connect Marketplace</span>
    </button>
  );
}
