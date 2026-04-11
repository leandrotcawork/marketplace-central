import { useEffect, useMemo, useState } from "react";
import type {
  IntegrationInstallation,
  IntegrationProviderDefinition,
} from "@marketplace-central/sdk-runtime";

export interface IntegrationsHubClient {
  listIntegrationProviders: () => Promise<{ items: IntegrationProviderDefinition[] }>;
  listIntegrationInstallations: () => Promise<{ items: IntegrationInstallation[] }>;
}

export interface IntegrationsHubPageProps {
  client: IntegrationsHubClient;
}

type LoadState = "loading" | "ready" | "error";

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

export function IntegrationsHubPage({ client }: IntegrationsHubPageProps) {
  const [providers, setProviders] = useState<IntegrationProviderDefinition[]>([]);
  const [installations, setInstallations] = useState<IntegrationInstallation[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("Failed to load integrations");

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
            {installations.length} installation{installations.length === 1 ? "" : "s"} loaded
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {installations.map((installation) => {
          const provider = providerByCode.get(installation.provider_code);

          return (
            <article
              key={installation.installation_id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {installation.display_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {provider?.display_name ?? installation.provider_code}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
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
            </article>
          );
        })}
      </div>
    </div>
  );
}
