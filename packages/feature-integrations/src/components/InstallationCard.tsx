import type {
  IntegrationInstallation,
  IntegrationProviderDefinition,
} from "@marketplace-central/sdk-runtime";

interface InstallationCardProps {
  installation: IntegrationInstallation;
  provider: IntegrationProviderDefinition | undefined;
  selected: boolean;
  onSelect: (installationId: string) => void;
}

function isNeedsAction(installation: IntegrationInstallation): boolean {
  return installation.status !== "connected" || installation.health_status !== "healthy";
}

export function InstallationCard({
  installation,
  provider,
  selected,
  onSelect,
}: InstallationCardProps) {
  const needsAction = isNeedsAction(installation);

  return (
    <button
      type="button"
      onClick={() => onSelect(installation.installation_id)}
      aria-pressed={selected}
      className="text-left"
    >
      <article
        className={[
          "h-full rounded-2xl border bg-white p-5 shadow-sm transition-all duration-150",
          selected
            ? "border-blue-500 ring-2 ring-blue-100"
            : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{installation.display_name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {provider?.display_name ?? installation.provider_code}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">{installation.status}</p>
            <p>{installation.health_status}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
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

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Last verified {installation.last_verified_at ?? "unknown"}
          </p>
          {needsAction ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Needs action
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
              Ready
            </span>
          )}
        </div>
      </article>
    </button>
  );
}
