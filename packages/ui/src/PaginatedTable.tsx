import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginatedTableProps<T> {
  items: T[];
  pageSize?: number;
  renderHeader: () => React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
  loading?: boolean;
}

export function PaginatedTable<T>({
  items,
  pageSize = 25,
  renderHeader,
  renderRow,
  emptyState,
  loading = false,
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);
  const pageItems = items.slice(start, end);

  const handlePrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const handleNext = useCallback(() => setPage((p) => Math.min(totalPages, p + 1)), [totalPages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-blue-600 mr-3" />
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
        {emptyState ?? <p>No items found.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            {renderHeader()}
          </thead>
          <tbody>
            {pageItems.map((item, i) => renderRow(item, start + i))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-500">
          Showing {start + 1}–{end} of {items.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Prev page"
            onClick={handlePrev}
            disabled={safePage === 1}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-xs text-slate-600 font-medium min-w-[80px] text-center">
            Page {safePage} of {totalPages}
          </span>
          <button
            aria-label="Next page"
            onClick={handleNext}
            disabled={safePage === totalPages}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
