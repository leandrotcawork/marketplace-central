import type { IntegrationOperationRun } from "@marketplace-central/sdk-runtime";

interface OperationsTimelineProps {
  operations: IntegrationOperationRun[];
  loading: boolean;
  errorMessage: string | null;
}

function formatTimestamp(value?: string) {
  return value ?? "Not available";
}

export function OperationsTimeline({ operations, loading, errorMessage }: OperationsTimelineProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operations timeline</p>

      {loading && <p className="mt-3 text-sm text-slate-500">Loading operation runs...</p>}

      {!loading && errorMessage && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && operations.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No operation runs yet.</p>
      )}

      {!loading && !errorMessage && operations.length > 0 && (
        <ol className="mt-3 space-y-3">
          {operations.map((operation) => (
            <li key={operation.operation_run_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{operation.operation_type}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{operation.operation_run_id}</p>
                </div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {operation.status}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Result</dt>
                  <dd className="mt-1">{operation.result_code || "-"}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Failure</dt>
                  <dd className="mt-1">{operation.failure_code || "-"}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Attempt count</dt>
                  <dd className="mt-1">{operation.attempt_count}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Actor</dt>
                  <dd className="mt-1">{operation.actor_type}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Started</dt>
                  <dd className="mt-1">{formatTimestamp(operation.started_at)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide text-slate-400">Completed</dt>
                  <dd className="mt-1">{formatTimestamp(operation.completed_at)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
