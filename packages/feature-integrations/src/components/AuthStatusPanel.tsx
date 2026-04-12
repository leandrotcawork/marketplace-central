import { useState, type FormEvent } from "react";
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
  showCredentialsForm: boolean;
  loading: boolean;
  errorMessage: string | null;
  pendingAction: string | null;
  actions: AuthStatusAction[];
  onSubmitCredentials: (apiKey: string) => Promise<void>;
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
  showCredentialsForm,
  loading,
  errorMessage,
  pendingAction,
  actions,
  onSubmitCredentials,
}: AuthStatusPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const status = authStatus?.status ?? installationStatus;
  const resolvedHealth = authStatus?.health_status ?? healthStatus;

  async function handleCredentialSubmit(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) {
      return;
    }
    await onSubmitCredentials(apiKey.trim());
    setApiKey("");
  }

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

      {showCredentialsForm && (
        <form onSubmit={handleCredentialSubmit} className="mt-4 space-y-2">
          <label htmlFor="integration-api-key" className="block text-xs font-medium text-slate-700">
            API key
          </label>
          <div className="flex gap-2">
            <input
              id="integration-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Enter provider API key"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="submit"
              disabled={loading || pendingAction === "credentials" || !apiKey.trim()}
              className={actionClassName("primary", loading || pendingAction === "credentials" || !apiKey.trim())}
            >
              {pendingAction === "credentials" ? "Submitting..." : "Submit credentials"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
