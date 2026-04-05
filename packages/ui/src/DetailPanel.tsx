import { useEffect } from "react";
import { X } from "lucide-react";

export interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function DetailPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 380,
}: DetailPanelProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="complementary"
      aria-label={title}
      style={{ width }}
      className="fixed right-0 top-0 bottom-0 bg-white border-l border-slate-200 shadow-xl flex flex-col z-40"
    >
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{subtitle}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="ml-3 shrink-0 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {children}
      </div>

      {footer && (
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}
