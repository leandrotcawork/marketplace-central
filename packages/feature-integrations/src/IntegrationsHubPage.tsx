import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  OperationalSummary,
  type OperationalQuickFilter,
} from "./components/OperationalSummary";
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

type IntegrationErrorContext = {
  code: string | null;
  message: string;
};

type CallbackNotice =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const NEEDS_ACTION_STATUSES = new Set([
  "draft",
  "pending_connection",
  "degraded",
  "requires_reauth",
  "disconnected",
  "suspended",
  "failed",
]);

function extractErrorContext(error: unknown): IntegrationErrorContext {
  if (typeof error === "string") {
    return { code: null, message: error };
  }

  if (error && typeof error === "object") {
    const structured = error as {
      error?: { message?: string; code?: string };
      message?: string;
    };

    return {
      code: structured.error?.code ?? null,
      message: structured.error?.message ?? structured.message ?? "Unknown error",
    };
  }

  return { code: null, message: "Unknown error" };
}

function formatErrorForUI(error: unknown): string {
  const context = extractErrorContext(error);
  if (!context.code) {
    return context.message;
  }
  return `${context.message} (${context.code})`;
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

function buildAuthActions(params: {
  provider: IntegrationProviderDefinition | undefined;
  resolvedStatus: IntegrationAuthStatusResponse["status"] | IntegrationInstallation["status"];
  pendingAction: string | null;
  onAuthorize: () => void;
  onReauthorize: () => void;
  onDisconnect: () => void;
  onFeeSync: () => void;
}): AuthStatusAction[] {
  const {
    provider,
    resolvedStatus,
    pendingAction,
    onAuthorize,
    onReauthorize,
    onDisconnect,
    onFeeSync,
  } = params;

  const actions: AuthStatusAction[] = [];
  const supportsOAuthAuthorization =
    provider?.auth_strategy === "oauth2" && provider.install_mode !== "manual";

  if (
    supportsOAuthAuthorization &&
    (resolvedStatus === "draft" ||
      resolvedStatus === "pending_connection" ||
      resolvedStatus === "disconnected")
  ) {
    actions.push({ key: "authorize", label: "Authorize", variant: "primary", onClick: onAuthorize });
  }

  if (supportsOAuthAuthorization && resolvedStatus === "requires_reauth") {
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
  const [statusFilter, setStatusFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [quickFilter, setQuickFilter] = useState<OperationalQuickFilter | null>(null);
  const [syncFailures24hCount, setSyncFailures24hCount] = useState(0);
  const [syncFailureInstallationIDs, setSyncFailureInstallationIDs] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedInstallationId = searchParams.get("installation") ?? "";
  const [callbackNotice, setCallbackNotice] = useState<CallbackNotice | null>(null);
  const installationsRef = useRef<IntegrationInstallation[]>([]);
  const selectedInstallationIdRef = useRef("");
  const syncFailureRefreshSequenceRef = useRef(0);
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

  const fetchInstallations = useCallback(() => client.listIntegrationInstallations(), [client]);

  const refreshSyncFailureMetrics = useCallback(
    async (installationsToScan: IntegrationInstallation[] = installationsRef.current) => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const refreshSequence = syncFailureRefreshSequenceRef.current + 1;
      syncFailureRefreshSequenceRef.current = refreshSequence;

      if (installationsToScan.length === 0) {
        if (syncFailureRefreshSequenceRef.current !== refreshSequence) {
          return;
        }
        setSyncFailureInstallationIDs(new Set());
        setSyncFailures24hCount(0);
        return;
      }

      const results = await Promise.allSettled(
        installationsToScan.map(async (installation) => {
          const result = await client.listIntegrationOperationRuns(installation.installation_id);
          return { installationID: installation.installation_id, runs: result.items };
        })
      );

      if (syncFailureRefreshSequenceRef.current !== refreshSequence) {
        return;
      }

      const failedInstallations = new Set<string>();
      let failureCount = 0;

      for (const result of results) {
        if (result.status !== "fulfilled") {
          continue;
        }

        for (const run of result.value.runs) {
          const createdAt = Date.parse(run.created_at);
          if (
            run.operation_type === "fee_sync" &&
            run.status === "failed" &&
            Number.isFinite(createdAt) &&
            createdAt >= cutoff
          ) {
            failureCount += 1;
            failedInstallations.add(result.value.installationID);
          }
        }
      }

      setSyncFailureInstallationIDs(failedInstallations);
      setSyncFailures24hCount(failureCount);
    },
    [client]
  );

  const setDrawerStateIfCurrent = useCallback(
    (
      installationId: string,
      update: DrawerSnapshot | ((current: DrawerSnapshot) => DrawerSnapshot),
    ) => {
      setDrawerState((current) => {
        if (selectedInstallationIdRef.current !== installationId) {
          return current;
        }

        return typeof update === "function"
          ? (update as (current: DrawerSnapshot) => DrawerSnapshot)(current)
          : update;
      });
    },
    []
  );

  const applyAuthStatusSnapshot = useCallback((authStatus: IntegrationAuthStatusResponse) => {
    setInstallations((current) =>
      current.map((installation) => {
        if (installation.installation_id !== authStatus.installation_id) {
          return installation;
        }
        const nextExternalAccountID = authStatus.external_account_id ?? installation.external_account_id;
        if (
          installation.status === authStatus.status &&
          installation.health_status === authStatus.health_status &&
          installation.external_account_id === nextExternalAccountID
        ) {
          return installation;
        }
        return {
          ...installation,
          status: authStatus.status,
          health_status: authStatus.health_status,
          external_account_id: nextExternalAccountID,
        };
      })
    );
  }, []);

  useEffect(() => {
    installationsRef.current = installations;
  }, [installations]);

  useEffect(() => {
    selectedInstallationIdRef.current = selectedInstallationId;
  }, [selectedInstallationId]);

  useEffect(() => {
    const authParam = searchParams.get("auth");
    if (!authParam) {
      return;
    }

    if (authParam === "connected") {
      setCallbackNotice({
        kind: "success",
        message: "Integration authorized successfully.",
      });
    } else if (authParam === "failed") {
      setCallbackNotice({
        kind: "error",
        message: "Integration authorization failed. Please try again.",
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("auth");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!callbackNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCallbackNotice(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [callbackNotice]);

  useEffect(() => {
    let cancelled = false;

    setState("loading");

    fetchInstallations()
      .then((installationResult) => {
        if (cancelled) {
          return;
        }

        installationsRef.current = installationResult.items;
        setInstallations(installationResult.items);
        setState("ready");
        void refreshSyncFailureMetrics(installationResult.items);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setErrorMessage(formatErrorForUI(error));
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [fetchInstallations, refreshSyncFailureMetrics]);

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
      const matchesQuickFilter =
        !quickFilter ||
        (quickFilter === "connected" && installation.status === "connected") ||
        (quickFilter === "requires_reauth" && installation.status === "requires_reauth") ||
        (quickFilter === "warning" && installation.health_status === "warning") ||
        (quickFilter === "critical" && installation.health_status === "critical") ||
        (quickFilter === "sync_failures" &&
          syncFailureInstallationIDs.has(installation.installation_id));

      return (
        matchesSearch(installation, query.trim(), providerName) &&
        (!providerCode || installation.provider_code === providerCode) &&
        (!statusFilter || installation.status === statusFilter) &&
        (!healthFilter || installation.health_status === healthFilter) &&
        matchesQuickFilter &&
        (!needsActionOnly || isNeedsAction(installation))
      );
    });
  }, [
    healthFilter,
    installations,
    needsActionOnly,
    providerByCode,
    providerCode,
    query,
    quickFilter,
    statusFilter,
    syncFailureInstallationIDs,
  ]);

  const selectedInstallation = useMemo(
    () => installations.find((installation) => installation.installation_id === selectedInstallationId) ?? null,
    [installations, selectedInstallationId]
  );

  const connectedCount = useMemo(
    () => installations.filter((installation) => installation.status === "connected").length,
    [installations]
  );
  const requiresReauthCount = useMemo(
    () => installations.filter((installation) => installation.status === "requires_reauth").length,
    [installations]
  );
  const warningCount = useMemo(
    () => installations.filter((installation) => installation.health_status === "warning").length,
    [installations]
  );
  const criticalCount = useMemo(
    () => installations.filter((installation) => installation.health_status === "critical").length,
    [installations]
  );

  useEffect(() => {
    if (!selectedInstallationId || !selectedInstallation) {
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

      if (authStatusResult.status === "fulfilled") {
        applyAuthStatusSnapshot(authStatusResult.value);
      }

      setDrawerState((current) => ({
        ...current,
        authStatus: authStatusResult.status === "fulfilled" ? authStatusResult.value : null,
        authStatusLoading: false,
        authStatusError:
          authStatusResult.status === "rejected" ? formatErrorForUI(authStatusResult.reason) : null,
        operationRuns:
          operationRunsResult.status === "fulfilled" ? operationRunsResult.value.items : current.operationRuns,
        operationRunsLoading: false,
        operationRunsError:
          operationRunsResult.status === "rejected" ? formatErrorForUI(operationRunsResult.reason) : null,
        actionError: null,
        pendingAction: null,
      }));
    }

    loadDrawerSnapshot(selectedInstallationId).catch((error) => {
      if (cancelled) {
        return;
      }

      setDrawerState((current) => ({
        ...current,
        authStatusLoading: false,
        operationRunsLoading: false,
        authStatusError: formatErrorForUI(error),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [applyAuthStatusSnapshot, client, selectedInstallation, selectedInstallationId]);

  async function reloadOperationRuns(installationId: string) {
    try {
      setDrawerStateIfCurrent(installationId, (current) => ({
        ...current,
        operationRunsLoading: true,
        operationRunsError: null,
      }));
      const result = await client.listIntegrationOperationRuns(installationId);
      setDrawerStateIfCurrent(installationId, (current) => ({
        ...current,
        operationRuns: result.items,
        operationRunsLoading: false,
      }));
      await refreshSyncFailureMetrics();
    } catch (error) {
      setDrawerStateIfCurrent(installationId, (current) => ({
        ...current,
        operationRunsLoading: false,
        operationRunsError: formatErrorForUI(error),
      }));
    }
  }

  async function reloadDrawerSnapshot(installationId: string) {
    setDrawerStateIfCurrent(installationId, (current) => ({
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

    if (authStatusResult.status === "fulfilled") {
      applyAuthStatusSnapshot(authStatusResult.value);
    }

    setDrawerStateIfCurrent(installationId, (current) => ({
      ...current,
      authStatus: authStatusResult.status === "fulfilled" ? authStatusResult.value : current.authStatus,
      authStatusLoading: false,
      authStatusError:
        authStatusResult.status === "rejected" ? formatErrorForUI(authStatusResult.reason) : null,
      operationRuns:
        operationRunsResult.status === "fulfilled" ? operationRunsResult.value.items : current.operationRuns,
      operationRunsLoading: false,
      operationRunsError:
        operationRunsResult.status === "rejected" ? formatErrorForUI(operationRunsResult.reason) : null,
    }));
    await refreshSyncFailureMetrics();
  }

  async function runAction(actionKey: string, installationId: string, handler: () => Promise<void>) {
    if (!installationId) {
      return;
    }

    setDrawerStateIfCurrent(installationId, (current) => ({
      ...current,
      actionError: null,
      pendingAction: actionKey,
    }));

    try {
      await handler();
    } catch (error) {
      setDrawerStateIfCurrent(installationId, (current) => ({
        ...current,
        actionError: formatErrorForUI(error),
        pendingAction: null,
      }));
      return;
    }

    setDrawerStateIfCurrent(installationId, (current) => ({
      ...current,
      pendingAction: null,
    }));
  }

  async function handleAuthorize() {
    if (!selectedInstallation) {
      return;
    }

    const installationId = selectedInstallation.installation_id;

    await runAction("authorize", installationId, async () => {
      const result = await client.startIntegrationAuthorization(installationId);
      const redirect = onAuthRedirect ?? ((authUrl: string) => window.location.assign(authUrl));
      redirect(result.auth_url);
    });
  }

  async function handleReauthorize() {
    if (!selectedInstallation) {
      return;
    }

    const installationId = selectedInstallation.installation_id;

    await runAction("reauthorize", installationId, async () => {
      const result = await client.startIntegrationReauthorization(installationId);
      const redirect = onAuthRedirect ?? ((authUrl: string) => window.location.assign(authUrl));
      redirect(result.auth_url);
    });
  }

  async function handleDisconnect() {
    if (!selectedInstallation) {
      return;
    }

    const installationId = selectedInstallation.installation_id;
    const displayName = selectedInstallation.display_name;

    await runAction("disconnect", installationId, async () => {
      const confirmed = window.confirm(
        `Disconnect ${displayName}? This stops the installation from syncing until it is reconnected.`,
      );

      if (!confirmed) {
        return;
      }

      await client.disconnectIntegrationInstallation(installationId);
      const installationResult = await fetchInstallations();
      installationsRef.current = installationResult.items;
      setInstallations(installationResult.items);
      setState("ready");
      await reloadDrawerSnapshot(installationId);
    });
  }

  async function handleFeeSync() {
    if (!selectedInstallation) {
      return;
    }

    const installationId = selectedInstallation.installation_id;

    await runAction("fee_sync", installationId, async () => {
      await client.startIntegrationFeeSync(installationId);
      await reloadOperationRuns(installationId);
    });
  }

  async function handleSubmitCredentials(apiKey: string) {
    if (!selectedInstallation) {
      return;
    }

    const installationId = selectedInstallation.installation_id;

    await runAction("credentials", installationId, async () => {
      await client.submitIntegrationCredentials(installationId, { api_key: apiKey });
      const installationResult = await fetchInstallations();
      installationsRef.current = installationResult.items;
      setInstallations(installationResult.items);
      setState("ready");
      await reloadDrawerSnapshot(installationId);
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
        {callbackNotice ? (
          <div className="pointer-events-none fixed right-4 top-4 z-[120]">
            <div
              role="alert"
              className={
                callbackNotice.kind === "success"
                  ? "pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg"
                  : "pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg"
              }
            >
              {callbackNotice.message}
            </div>
          </div>
        ) : null}
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
  const selectedProvider = selectedInstallation
    ? providerByCode.get(selectedInstallation.provider_code)
    : null;
  const showCredentialsForm = Boolean(
    selectedProvider?.auth_strategy === "api_key" &&
      selectedInstallation &&
      (resolvedStatus === "draft" ||
        resolvedStatus === "pending_connection" ||
        resolvedStatus === "degraded" ||
        resolvedStatus === "requires_reauth")
  );

  const drawerActions = selectedInstallation
    ? buildAuthActions({
        provider: selectedProvider,
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
      {callbackNotice ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[120]">
          <div
            role="alert"
            className={
              callbackNotice.kind === "success"
                ? "pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg"
                : "pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg"
            }
          >
            {callbackNotice.message}
          </div>
        </div>
      ) : null}
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
        connectedCount={connectedCount}
        requiresReauthCount={requiresReauthCount}
        warningCount={warningCount}
        criticalCount={criticalCount}
        syncFailures24hCount={syncFailures24hCount}
        activeQuickFilter={quickFilter}
        onQuickFilter={setQuickFilter}
      />

      <FilterBar
        query={query}
        providerCode={providerCode}
        statusFilter={statusFilter}
        healthFilter={healthFilter}
        needsActionOnly={needsActionOnly}
        providerOptions={providerOptions}
        totalCount={installations.length}
        visibleCount={visibleInstallations.length}
        onQueryChange={setQuery}
        onProviderCodeChange={setProviderCode}
        onStatusFilterChange={setStatusFilter}
        onHealthFilterChange={setHealthFilter}
        onNeedsActionOnlyChange={setNeedsActionOnly}
        onClearFilters={() => {
          setQuery("");
          setProviderCode("");
          setStatusFilter("");
          setHealthFilter("");
          setNeedsActionOnly(false);
          setQuickFilter(null);
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
          showCredentialsForm={showCredentialsForm}
          onSubmitCredentials={handleSubmitCredentials}
          onClose={clearSelection}
        />
      )}
    </div>
  );
}
