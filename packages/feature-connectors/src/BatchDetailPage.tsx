import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Badge, Button } from "@marketplace-central/ui";
import type { BatchStatus, BatchOperation, VTEXProduct, PublishBatchResponse } from "@marketplace-central/sdk-runtime";

interface BatchClient {
  getBatchStatus: (batchId: string) => Promise<BatchStatus>;
  retryBatch: (batchId: string, products: VTEXProduct[]) => Promise<PublishBatchResponse>;
}

interface BatchDetailPageProps {
  client: BatchClient;
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(["completed", "failed"]);

const stepLabels: Record<string, string> = {
  category:     "Category",
  brand:        "Brand",
  product:      "Product",
  sku:          "SKU",
  specs_images: "Images",
  trade_policy: "Trade Policy",
  price:        "Price",
  stock:        "Stock",
  activate:     "Activate",
};

export function BatchDetailPage({ client }: BatchDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const routeProducts: VTEXProduct[] = (location.state as { products?: VTEXProduct[] } | null)?.products ?? [];
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    if (!id) return;
    try {
      const data = await client.getBatchStatus(id);
      setBatch(data);
      if (TERMINAL.has(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err: any) {
      setErrorMsg(err?.error?.message ?? "Failed to load batch status.");
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  async function handleRetry() {
    if (!id) return;
    setRetrying(true);
    try {
      await client.retryBatch(id, routeProducts);
      setLoading(true);
      await fetchStatus();
      pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    } catch (err: any) {
      setErrorMsg(err?.error?.message ?? "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (loading && !batch) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && !batch) {
    return (
      <div className="max-w-4xl">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {errorMsg}
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const progressPct = batch.total > 0 ? Math.round((batch.succeeded / batch.total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Batch Detail</h2>
          <p className="mt-0.5 text-xs font-mono text-slate-400">{batch.batch_id}</p>
        </div>
        <div className="flex items-center gap-3">
          {batch.failed > 0 && (
            <Button variant="danger" loading={retrying} onClick={handleRetry}>
              Retry Failed
            </Button>
          )}
          <Badge status={batch.status} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">VTEX Account</span>
          <span className="font-mono font-medium text-slate-900">{batch.vtex_account}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Progress</span>
          <span className="font-medium text-slate-900">{batch.succeeded}/{batch.total} succeeded</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex gap-6 text-xs text-slate-500">
          <span><span className="font-medium text-emerald-600">{batch.succeeded}</span> succeeded</span>
          <span><span className="font-medium text-red-600">{batch.failed}</span> failed</span>
          <span><span className="font-medium text-blue-600">{batch.in_progress}</span> in progress</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Operations</h3>
        </div>
        {batch.operations.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No operations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Product ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Current Step</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batch.operations.map((op: BatchOperation) => (
                  <tr key={op.product_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{op.product_id}</td>
                    <td className="px-5 py-3"><Badge status={op.status} /></td>
                    <td className="px-5 py-3 text-slate-600">{stepLabels[op.current_step] ?? op.current_step}</td>
                    <td className="px-5 py-3 font-mono text-xs text-red-600">{op.error_code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
