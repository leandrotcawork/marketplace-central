import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  IntegrationInstallation,
  IntegrationProviderDefinition,
} from "@marketplace-central/sdk-runtime";
import { FilterBar } from "./components/FilterBar";
import { InstallationCard } from "./components/InstallationCard";
import { OperationalSummary } from "./components/OperationalSummary";

export interface IntegrationsHubClient {
  listIntegrationProviders: () => Promise<{ items: IntegrationProviderDefinition[] }>;
  listIntegrationInstallations: () => Promise<{ items: IntegrationInstallation[] }>;
}

export interface IntegrationsHubPageProps {
  client: IntegrationsHubClient;
}

type LoadState = "loading" | "ready" | "error";

const NEEDS_ACTION_STATUSES = new Set([
  "draft",
  "pending_connection",
  "degraded",
  "requires_reauth",
  "disconnected",
  "suspended",
  "failed",
]);

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const structured = error as {
      error?: { message?: string; code?: string };
      message?: string;
    };

    return structured.error?.message ?? structured.message ?? "Unknown error";
  }

  return "Unknown error";
}

function isNeedsAction(installation: IntegrationInstallation): boolean {
  return NEEDS_ACTION_STATUSES.has(installation.status) || installation.health_status !== "healthy";
}

function matchesSearch(installation: IntegrationInstallation, query: string, providerName: string) {
  if (!query) {
    return true;
  }

  const searchValue = query.toLowerCase();
  const fields = [
    installation.display_name,
    installation.provider_code,
    providerName,
    installation.external_account_name,
    installation.external_account_id,
    installation.status,
    installation.health_status,
    installation.active_credential_id ?? "",
  ];

  return fields.some((field) => field.toLowerCase().includes(searchValue));
}

export function IntegrationsHubPage({ client }: IntegrationsHubPageProps) {
  const [providers, setProviders] = useState<IntegrationProviderDefinition[]>([]);
  const [installations, setInstallations] = useState<IntegrationInstallation[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("Failed to load integrations");
  const [query, setQuery] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function loadInstallations() {
      setState("loading");

      try {
        const installationResult = await client.listIntegrationInstallations();

        if (cancelled) {
          return;
        }

        setInstallations(installationResult.items);
        setState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(extractErrorMessage(error));
        setState("error");
      }
    }

    loadInstallations();

    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const providerResult = await client.listIntegrationProviders();

        if (cancelled) {
          return;
        }

        setProviders(providerResult.items);
      } catch {
        // Provider metadata is optional for the hub shell.
      }
    }

    loadProviders();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const providerByCode = useMemo(() => {
    return new Map(providers.map((provider) => [provider.provider_code, provider]));
  }, [providers]);

  const providerOptions = useMemo(
    () =>
      providers
        .map((provider) => ({
          value: provider.provider_code,
          label: provider.display_name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [providers]
  );

  const visibleInstallations = useMemo(() => {
    return installations.filter((installation) => {
      const provider = providerByCode.get(installation.provider_code);
      const providerName = provider?.display_name ?? installation.provider_code;

      return (
        matchesSearch(installation, query.trim(), providerName) &&
        (!providerCode || installation.provider_code === providerCode) &&
        (!needsActionOnly || isNeedsAction(installation))
      );
    });
  }, [installations, providerByCode, providerCode, query, needsActionOnly]);

  const selectedInstallationId = searchParams.get("installation") ?? "";
  const selectedInstallation = useMemo(
    () => installations.find((installation) => installation.installation_id === selectedInstallationId) ?? null,
    [installations, selectedInstallationId]
  );

  const connectedCount = useMemo(
    () => installations.filter((installation) => !isNeedsAction(installation)).length,
    [installations]
  );
  const needsActionCount = useMemo(
    () => installations.filter((installation) => isNeedsAction(installation)).length,
    [installations]
  );

  function syncSelection(installationId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("installation", installationId);
    setSearchParams(next, { replace: true });
  }

  function clearSelection() {
    const next = new URLSearchParams(searchParams);
    next.delete("installation");
    setSearchParams(next, { replace: true });
  }

  if (state === "loading") {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Integrations Hub</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading integrations...
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Integrations Hub</h2>
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700"
        >
          <p className="font-semibold text-red-800">Failed to load integrations</p>
          <p className="mt-1">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (installations.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Integrations Hub</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-base font-semibold text-slate-900">No integrations connected</p>
          <p className="mt-2 text-sm text-slate-500">
            Connect a provider to start managing authorization, credentials, and sync health.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Integrations Hub</h2>
          <p className="text-sm text-slate-500">
            {visibleInstallations.length} visible of {installations.length} installation
            {installations.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <OperationalSummary
        totalCount={installations.length}
        connectedCount={connectedCount}
        needsActionCount={needsActionCount}
        providerCount={providers.length}
      />

      <FilterBar
        query={query}
        providerCode={providerCode}
        needsActionOnly={needsActionOnly}
        providerOptions={providerOptions}
        totalCount={installations.length}
        visibleCount={visibleInstallations.length}
        onQueryChange={setQuery}
        onProviderCodeChange={setProviderCode}
        onNeedsActionOnlyChange={setNeedsActionOnly}
        onClearFilters={() => {
          setQuery("");
          setProviderCode("");
          setNeedsActionOnly(false);
        }}
      />

      <div
        className={[
          "transition-all duration-200",
          selectedInstallation ? "lg:pr-[432px]" : "",
        ].join(" ")}
      >
        {visibleInstallations.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No installations match the current filters.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleInstallations.map((installation) => (
              <InstallationCard
                key={installation.installation_id}
                installation={installation}
                provider={providerByCode.get(installation.provider_code)}
                selected={selectedInstallation?.installation_id === installation.installation_id}
                onSelect={syncSelection}
              />
            ))}
          </div>
        )}
      </div>

      {selectedInstallation && (
        <div
          role="dialog"
          aria-label={`${selectedInstallation.display_name} details`}
          className={[
            "mt-4 flex w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm",
            "lg:fixed lg:right-0 lg:top-0 lg:z-40 lg:mt-0 lg:h-full lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-[-4px_0_24px_rgba(15,23,42,0.08)]",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {selectedInstallation.display_name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {providerByCode.get(selectedInstallation.provider_code)?.display_name ??
                  selectedInstallation.provider_code}
              </p>
            </div>

            <button
              type="button"
              onClick={clearSelection}
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
                  <dd className="mt-1 text-slate-700">{selectedInstallation.status}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Health</dt>
                  <dd className="mt-1 text-slate-700">{selectedInstallation.health_status}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">External account</dt>
                  <dd className="mt-1 text-slate-700">{selectedInstallation.external_account_name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Credential</dt>
                  <dd className="mt-1 text-slate-700">
                    {selectedInstallation.active_credential_id ?? "Not connected"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-dashed border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Task 4 action shell
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Authorization, reauthorization, and health actions will be wired here next.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Audit details
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Installation ID</dt>
                  <dd className="mt-1 font-mono text-slate-700">{selectedInstallation.installation_id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Last verified</dt>
                  <dd className="mt-1 text-slate-700">
                    {selectedInstallation.last_verified_at ?? "Not yet verified"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
