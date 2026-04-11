import type {
  IntegrationAuthStatusResponse,
  IntegrationInstallation,
  IntegrationOperationRun,
} from "@marketplace-central/sdk-runtime";
import { AuthStatusPanel, type AuthStatusAction } from "./AuthStatusPanel";
import { OperationsTimeline } from "./OperationsTimeline";

interface InstallationDrawerProps {
  installation: IntegrationInstallation;
  providerName: string;
  authStatus: IntegrationAuthStatusResponse | null;
  authStatusLoading: boolean;
  authStatusError: string | null;
  operationRuns: IntegrationOperationRun[];
  operationRunsLoading: boolean;
  operationRunsError: string | null;
  pendingAction: string | null;
  actions: AuthStatusAction[];
  onClose: () => void;
}

export function InstallationDrawer({
  installation,
  providerName,
  authStatus,
  authStatusLoading,
  authStatusError,
  operationRuns,
  operationRunsLoading,
  operationRunsError,
  pendingAction,
  actions,
  onClose,
}: InstallationDrawerProps) {
  return (
    <div
      role="dialog"
      aria-label={`${installation.display_name} details`}
      className={[
        "mt-4 flex w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm",
        "lg:fixed lg:right-0 lg:top-0 lg:z-40 lg:mt-0 lg:h-full lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-[-4px_0_24px_rgba(15,23,42,0.08)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{installation.display_name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{providerName}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close installation drawer"
          className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Connection snapshot
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
              <dd className="mt-1 text-slate-700">{installation.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Health</dt>
              <dd className="mt-1 text-slate-700">{installation.health_status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">External account</dt>
              <dd className="mt-1 text-slate-700">{installation.external_account_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Credential</dt>
              <dd className="mt-1 text-slate-700">
                {installation.active_credential_id ?? "Not connected"}
              </dd>
            </div>
          </dl>
        </section>

        <AuthStatusPanel
          authStatus={authStatus}
          installationStatus={installation.status}
          healthStatus={installation.health_status}
          loading={authStatusLoading}
          errorMessage={authStatusError}
          pendingAction={pendingAction}
          actions={actions}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit details</p>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Installation ID</dt>
              <dd className="mt-1 font-mono text-slate-700">{installation.installation_id}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Last verified</dt>
              <dd className="mt-1 text-slate-700">{installation.last_verified_at ?? "Not yet verified"}</dd>
            </div>
          </dl>
        </section>

        <OperationsTimeline
          operations={operationRuns}
          loading={operationRunsLoading}
          errorMessage={operationRunsError}
        />
      </div>
    </div>
  );
}
