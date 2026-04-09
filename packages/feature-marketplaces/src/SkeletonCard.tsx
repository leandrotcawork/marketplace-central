export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-slate-200" />
        <div className="w-16 h-5 rounded-full bg-slate-200" />
      </div>
      <div className="w-32 h-4 bg-slate-200 rounded mb-1.5" />
      <div className="w-24 h-3 bg-slate-100 rounded mb-4" />
      <div className="border-t border-slate-100 mb-4" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="w-16 h-3 bg-slate-100 rounded" />
          <div className="w-10 h-4 bg-slate-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="w-16 h-3 bg-slate-100 rounded" />
          <div className="w-10 h-4 bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  );
}
