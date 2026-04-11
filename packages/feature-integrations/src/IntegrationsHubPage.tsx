import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  IntegrationAuthStatusResponse,
  IntegrationInstallation,
  IntegrationOperationRun,
  IntegrationProviderDefinition,
  SubmitIntegrationCredentialsRequest,
} from "@marketplace-central/sdk-runtime";
import { FilterBar } from "./components/FilterBar";
import { InstallationCard } from "./components/InstallationCard";
import { InstallationDrawer } from "./components/InstallationDrawer";
import { OperationalSummary } from "./components/OperationalSummary";
import type { AuthStatusAction } from "./components/AuthStatusPanel";

export interface IntegrationsHubClient {
  listIntegrationProviders: () => Promise<{ items: IntegrationProviderDefinition[] }>;
  listIntegrationInstallations: () => Promise<{ items: IntegrationInstallation[] }>;
  listIntegrationOperationRuns: (installationId: string) => Promise<{ items: IntegrationOperationRun[] }>;
  startIntegrationAuthorization: (installationId: string) => Promise<{ auth_url: string }>;
  startIntegrationReauthorization: (installationId: string) => Promise<{ auth_url: string }>;
  getIntegrationAuthStatus: (installationId: string) => Promise<IntegrationAuthStatusResponse>;
  submitIntegrationCredentials: (
    installationId: string,
    request: SubmitIntegrationCredentialsRequest,
  ) => Promise<IntegrationAuthStatusResponse>;
  disconnectIntegrationInstallation: (installationId: string) => Promise<IntegrationAuthStatusResponse>;
  startIntegrationFeeSync: (installationId: string) => Promise<{ installation_id: string; operation_run_id: string; status: "queued" }>;
}

export interface IntegrationsHubPageProps {
  client: IntegrationsHubClient;
  onAuthRedirect?: (authUrl: string) => void;
}

type LoadState = "loading" | "ready" | "error";

type DrawerSnapshot = {
  authStatus: IntegrationAuthStatusResponse | null;
  authStatusLoading: boolean;
  authStatusError: string | null;
  operationRuns: IntegrationOperationRun[];
  operationRunsLoading: boolean;
  operationRunsError: string | null;
  actionError: string | null;
  pendingAction: string | null;
};

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

function getResolvedStatus(
  installation: IntegrationInstallation,
  authStatus: IntegrationAuthStatusResponse | null,
) {
  return authStatus?.status ?? installation.status;
}

function getResolvedHealth(
  installation: IntegrationInstallation,
  authStatus: IntegrationAuthStatusResponse | null,
) {
  return authStatus?.health_status ?? installation.health_status;
}

function buildAuthActions(params: {
  installation: IntegrationInstallation;
  resolvedStatus: IntegrationAuthStatusResponse["status"] | IntegrationInstallation["status"];
  pendingAction: string | null;
  onAuthorize: () => void;
  onReauthorize: () => void;
  onDisconnect: () => void;
  onFeeSync: () => void;
}): AuthStatusAction[] {
  const { resolvedStatus, pendingAction, onAuthorize, onReauthorize, onDisconnect, onFeeSync } = params;

  const actions: AuthStatusAction[] = [];

  if (resolvedStatus === "draft" || resolvedStatus === "pending_connection") {
    actions.push({ key: "authorize", label: "Authorize", variant: "primary", onClick: onAuthorize });
  }

  if (resolvedStatus === "requires_reauth") {
    actions.push({ key: "reauthorize", label: "Reauthorize", variant: "primary", onClick: onReauthorize });
  }

  if (resolvedStatus === "connected" || resolvedStatus === "requires_reauth") {
    actions.push({ key: "disconnect", label: "Disconnect", variant: "danger", onClick: onDisconnect });
  }

  if (resolvedStatus === "connected" || resolvedStatus === "degraded" || resolvedStatus === "requires_reauth") {
    actions.push({ key: "fee_sync", label: "Sync fees", variant: "secondary", onClick: onFeeSync });
  }

  return actions.map((action) => ({
    ...action,
    disabled: Boolean(pendingAction) && pendingAction !== action.key,
  }));
}

export function IntegrationsHubPage({ client, onAuthRedirect }: IntegrationsHubPageProps) {
  const [providers, setProviders] = useState<IntegrationProviderDefinition[]>([]);
  const [installations, setInstallations] = useState<IntegrationInstallation[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("Failed to load integrations");
  const [query, setQuery] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawerState, setDrawerState] = useState<DrawerSnapshot>({
    authStatus: null,
    authStatusLoading: false,
    authStatusError: null,
    operationRuns: [],
    operationRunsLoading: false,
    operationRunsError: null,
    actionError: null,
    pendingAction: null,
  });

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

  useEffect(() => {
    if (!selectedInstallation) {
      setDrawerState({
        authStatus: null,
        authStatusLoading: false,
        authStatusError: null,
        operationRuns: [],
        operationRunsLoading: false,
        operationRunsError: null,
        actionError: null,
        pendingAction: null,
      });
      return;
    }

    let cancelled = false;

    setDrawerState({
      authStatus: null,
      authStatusLoading: true,
      authStatusError: null,
      operationRuns: [],
      operationRunsLoading: true,
      operationRunsError: null,
      actionError: null,
      pendingAction: null,
    });

    async function loadDrawerSnapshot(installationId: string) {
      const [authStatusResult, operationRunsResult] = await Promise.allSettled([
        client.getIntegrationAuthStatus(installationId),
        client.listIntegrationOperationRuns(installationId),
      ]);

      if (cancelled) {
        return;
      }

      setDrawerState((current) => ({
        ...current,
        authStatus: authStatusResult.status === "fulfilled" ? authStatusResult.value : null,
        authStatusLoading: false,
        authStatusError:
          authStatusResult.status === "rejected" ? extractErrorMessage(authStatusResult.reason) : null,
        operationRuns:
          operationRunsResult.status === "fulfilled" ? operationRunsResult.value.items : current.operationRuns,
        operationRunsLoading: false,
        operationRunsError:
          operationRunsResult.status === "rejected" ? extractErrorMessage(operationRunsResult.reason) : null,
        actionError: null,
        pendingAction: null,
      }));
    }

    loadDrawerSnapshot(selectedInstallation.installation_id).catch((error) => {
      if (cancelled) {
        return;
      }

      setDrawerState((current) => ({
        ...current,
        authStatusLoading: false,
        operationRunsLoading: false,
        authStatusError: extractErrorMessage(error),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [client, selectedInstallation]);

  async function reloadOperationRuns(installationId: string) {
    try {
      setDrawerState((current) => ({
        ...current,
        operationRunsLoading: true,
        operationRunsError: null,
      }));
      const result = await client.listIntegrationOperationRuns(installationId);
      setDrawerState((current) => ({
        ...current,
        operationRuns: result.items,
        operationRunsLoading: false,
      }));
    } catch (error) {
      setDrawerState((current) => ({
        ...current,
        operationRunsLoading: false,
        operationRunsError: extractErrorMessage(error),
      }));
    }
  }

  async function reloadDrawerSnapshot(installationId: string) {
    setDrawerState((current) => ({
      ...current,
      authStatusLoading: true,
      operationRunsLoading: true,
      authStatusError: null,
      operationRunsError: null,
    }));

    const [authStatusResult, operationRunsResult] = await Promise.allSettled([
      client.getIntegrationAuthStatus(installationId),
      client.listIntegrationOperationRuns(installationId),
    ]);

    setDrawerState((current) => ({
      ...current,
      authStatus: authStatusResult.status === "fulfilled" ? authStatusResult.value : current.authStatus,
      authStatusLoading: false,
      authStatusError:
        authStatusResult.status === "rejected" ? extractErrorMessage(authStatusResult.reason) : null,
      operationRuns:
        operationRunsResult.status === "fulfilled" ? operationRunsResult.value.items : current.operationRuns,
      operationRunsLoading: false,
      operationRunsError:
        operationRunsResult.status === "rejected" ? extractErrorMessage(operationRunsResult.reason) : null,
    }));
  }

  async function runAction(actionKey: string, handler: () => Promise<void>) {
    if (!selectedInstallation) {
      return;
    }

    setDrawerState((current) => ({
      ...current,
      actionError: null,
      pendingAction: actionKey,
    }));

    try {
      await handler();
    } catch (error) {
      setDrawerState((current) => ({
        ...current,
        actionError: extractErrorMessage(error),
        pendingAction: null,
      }));
      return;
    }

    setDrawerState((current) => ({
      ...current,
      pendingAction: null,
    }));
  }

  async function handleAuthorize() {
    if (!selectedInstallation) {
      return;
    }

    await runAction("authorize", async () => {
      const result = await client.startIntegrationAuthorization(selectedInstallation.installation_id);
      const redirect = onAuthRedirect ?? ((authUrl: string) => window.location.assign(authUrl));
      redirect(result.auth_url);
    });
  }

  async function handleReauthorize() {
    if (!selectedInstallation) {
      return;
    }

    await runAction("reauthorize", async () => {
      const result = await client.startIntegrationReauthorization(selectedInstallation.installation_id);
      const redirect = onAuthRedirect ?? ((authUrl: string) => window.location.assign(authUrl));
      redirect(result.auth_url);
    });
  }

  async function handleDisconnect() {
    if (!selectedInstallation) {
      return;
    }

    await runAction("disconnect", async () => {
      const confirmed = window.confirm(
        `Disconnect ${selectedInstallation.display_name}? This stops the installation from syncing until it is reconnected.`,
      );

      if (!confirmed) {
        return;
      }

      await client.disconnectIntegrationInstallation(selectedInstallation.installation_id);
      await reloadDrawerSnapshot(selectedInstallation.installation_id);
    });
  }

  async function handleFeeSync() {
    if (!selectedInstallation) {
      return;
    }

    await runAction("fee_sync", async () => {
      await client.startIntegrationFeeSync(selectedInstallation.installation_id);
      await reloadOperationRuns(selectedInstallation.installation_id);
    });
  }

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

  const resolvedStatus = selectedInstallation
    ? getResolvedStatus(selectedInstallation, drawerState.authStatus)
    : null;
  const resolvedHealth = selectedInstallation
    ? getResolvedHealth(selectedInstallation, drawerState.authStatus)
    : null;

  const drawerActions = selectedInstallation
    ? buildAuthActions({
        installation: selectedInstallation,
        resolvedStatus: resolvedStatus ?? selectedInstallation.status,
        pendingAction: drawerState.pendingAction,
        onAuthorize: handleAuthorize,
        onReauthorize: handleReauthorize,
        onDisconnect: handleDisconnect,
        onFeeSync: handleFeeSync,
      })
    : [];

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
        <InstallationDrawer
          installation={selectedInstallation}
          providerName={providerByCode.get(selectedInstallation.provider_code)?.display_name ?? selectedInstallation.provider_code}
          authStatus={drawerState.authStatus}
          authStatusLoading={drawerState.authStatusLoading}
          authStatusError={drawerState.actionError ?? drawerState.authStatusError}
          operationRuns={drawerState.operationRuns}
          operationRunsLoading={drawerState.operationRunsLoading}
          operationRunsError={drawerState.operationRunsError}
          pendingAction={drawerState.pendingAction}
          actions={drawerActions}
          onClose={clearSelection}
        />
      )}
    </div>
  );
}
