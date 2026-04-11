import type { IntegrationAuthStatusResponse } from "@marketplace-central/sdk-runtime";

export interface AuthStatusAction {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

interface AuthStatusPanelProps {
  authStatus: IntegrationAuthStatusResponse | null;
  installationStatus: string;
  healthStatus: string;
  loading: boolean;
  errorMessage: string | null;
  pendingAction: string | null;
  actions: AuthStatusAction[];
}

function actionClassName(variant: AuthStatusAction["variant"] | undefined, disabled: boolean) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const disabledClass = disabled ? "cursor-not-allowed opacity-60" : "";

  if (variant === "danger") {
    return [base, disabledClass, "bg-rose-600 text-white hover:bg-rose-700"].join(" ");
  }

  if (variant === "primary") {
    return [base, disabledClass, "bg-blue-600 text-white hover:bg-blue-700"].join(" ");
  }

  return [base, disabledClass, "bg-slate-100 text-slate-700 hover:bg-slate-200"].join(" ");
}

export function AuthStatusPanel({
  authStatus,
  installationStatus,
  healthStatus,
  loading,
  errorMessage,
  pendingAction,
  actions,
}: AuthStatusPanelProps) {
  const status = authStatus?.status ?? installationStatus;
  const resolvedHealth = authStatus?.health_status ?? healthStatus;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorization</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
          <dd className="mt-1 text-slate-700">{loading ? "Loading..." : status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Health</dt>
          <dd className="mt-1 text-slate-700">{loading ? "Loading..." : resolvedHealth}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Auth source</dt>
          <dd className="mt-1 text-slate-700">
            {authStatus?.external_account_id ? authStatus.external_account_id : "No active credential"}
          </dd>
        </div>
      </dl>

      {errorMessage && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => {
          const disabled = loading || Boolean(pendingAction) || action.disabled;

          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={disabled}
              className={actionClassName(action.variant, disabled)}
            >
              {pendingAction === action.key ? `${action.label}...` : action.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
