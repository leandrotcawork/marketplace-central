interface FilterBarProps {
  query: string;
  providerCode: string;
  needsActionOnly: boolean;
  providerOptions: Array<{ value: string; label: string }>;
  totalCount: number;
  visibleCount: number;
  onQueryChange: (next: string) => void;
  onProviderCodeChange: (next: string) => void;
  onNeedsActionOnlyChange: (next: boolean) => void;
  onClearFilters: () => void;
}

export function FilterBar({
  query,
  providerCode,
  needsActionOnly,
  providerOptions,
  totalCount,
  visibleCount,
  onQueryChange,
  onProviderCodeChange,
  onNeedsActionOnlyChange,
  onClearFilters,
}: FilterBarProps) {
  const hasActiveFilters = Boolean(query.trim() || providerCode || needsActionOnly);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor="integrations-search" className="block text-xs font-medium text-slate-700">
            Search
          </label>
          <input
            id="integrations-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by installation, account, or provider"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="space-y-1 lg:w-56">
          <label htmlFor="integrations-provider" className="block text-xs font-medium text-slate-700">
            Provider
          </label>
          <select
            id="integrations-provider"
            value={providerCode}
            onChange={(event) => onProviderCodeChange(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All providers</option>
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          aria-pressed={needsActionOnly}
          onClick={() => onNeedsActionOnlyChange(!needsActionOnly)}
          className={[
            "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            needsActionOnly
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200",
          ].join(" ")}
        >
          Needs action
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <p>
          Showing <span className="font-medium text-slate-700">{visibleCount}</span> of{" "}
          <span className="font-medium text-slate-700">{totalCount}</span> installations
        </p>
        <p>Filter state stays in the page shell for Task 4 actions.</p>
      </div>
    </div>
  );
}
