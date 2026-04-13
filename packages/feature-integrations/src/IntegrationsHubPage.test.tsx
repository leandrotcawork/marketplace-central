import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntegrationsHubPage, type IntegrationsHubClient } from "./IntegrationsHubPage";
import type {
  IntegrationAuthStatusResponse,
  IntegrationInstallation,
  IntegrationOperationRun,
  IntegrationProviderDefinition,
} from "@marketplace-central/sdk-runtime";

function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

const mockListProviders = vi.fn();
const mockListInstallations = vi.fn();
const mockListOperationRuns = vi.fn();
const mockGetIntegrationAuthStatus = vi.fn();
const mockStartIntegrationAuthorization = vi.fn();
const mockStartIntegrationReauthorization = vi.fn();
const mockSubmitIntegrationCredentials = vi.fn();
const mockDisconnectIntegrationInstallation = vi.fn();
const mockStartIntegrationFeeSync = vi.fn();

const sampleProvider: IntegrationProviderDefinition = {
  provider_code: "vtex",
  tenant_id: "tenant-1",
  family: "marketplace",
  display_name: "VTEX",
  auth_strategy: "oauth2",
  install_mode: "interactive",
  metadata: {},
  declared_capabilities: ["catalog", "pricing"],
  is_active: true,
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:00:00Z",
};

const sampleProviderNeedsAction: IntegrationProviderDefinition = {
  provider_code: "bling",
  tenant_id: "tenant-1",
  family: "marketplace",
  display_name: "Bling",
  auth_strategy: "token",
  install_mode: "manual",
  metadata: {},
  declared_capabilities: ["orders"],
  is_active: true,
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:00:00Z",
};

const sampleProviderAPIKey: IntegrationProviderDefinition = {
  provider_code: "shopee",
  tenant_id: "tenant-1",
  family: "marketplace",
  display_name: "Shopee",
  auth_strategy: "api_key",
  install_mode: "manual",
  metadata: {},
  declared_capabilities: ["orders"],
  is_active: true,
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:00:00Z",
};

const sampleInstallation: IntegrationInstallation = {
  installation_id: "inst-1",
  tenant_id: "tenant-1",
  provider_code: "vtex",
  family: "marketplace",
  display_name: "VTEX Main Store",
  status: "connected",
  health_status: "healthy",
  external_account_id: "acc-1",
  external_account_name: "Main Store",
  active_credential_id: "cred-1",
  last_verified_at: "2026-04-11T12:30:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleInstallationDisconnected: IntegrationInstallation = {
  ...sampleInstallation,
  status: "disconnected",
  health_status: "critical",
  active_credential_id: undefined,
  updated_at: "2026-04-11T12:45:00Z",
};

const sampleInstallationNeedsAction: IntegrationInstallation = {
  installation_id: "inst-2",
  tenant_id: "tenant-1",
  provider_code: "bling",
  family: "marketplace",
  display_name: "Bling Store",
  status: "requires_reauth",
  health_status: "warning",
  external_account_id: "acc-2",
  external_account_name: "Bling Account",
  active_credential_id: "cred-2",
  last_verified_at: "2026-04-11T12:10:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleInstallationDraft: IntegrationInstallation = {
  installation_id: "inst-5",
  tenant_id: "tenant-1",
  provider_code: "bling",
  family: "marketplace",
  display_name: "Bling Draft",
  status: "draft",
  health_status: "warning",
  external_account_id: "acc-5",
  external_account_name: "Bling Draft Account",
  active_credential_id: undefined,
  last_verified_at: "2026-04-11T12:05:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};
const sampleInstallationPendingConnection: IntegrationInstallation = {
  installation_id: "inst-4",
  tenant_id: "tenant-1",
  provider_code: "bling",
  family: "marketplace",
  display_name: "Bling Pending",
  status: "pending_connection",
  health_status: "warning",
  external_account_id: "acc-4",
  external_account_name: "Bling Pending Account",
  active_credential_id: undefined,
  last_verified_at: "2026-04-11T12:05:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleInstallationPendingAPIKey: IntegrationInstallation = {
  installation_id: "inst-6",
  tenant_id: "tenant-1",
  provider_code: "shopee",
  family: "marketplace",
  display_name: "Shopee Pending",
  status: "pending_connection",
  health_status: "warning",
  external_account_id: "acc-6",
  external_account_name: "Shopee Pending Account",
  active_credential_id: undefined,
  last_verified_at: "2026-04-11T12:05:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleInstallationDisconnectedActionable: IntegrationInstallation = {
  installation_id: "inst-7",
  tenant_id: "tenant-1",
  provider_code: "bling",
  family: "marketplace",
  display_name: "Bling Disconnected",
  status: "disconnected",
  health_status: "warning",
  external_account_id: "acc-7",
  external_account_name: "Bling Disconnected Account",
  active_credential_id: undefined,
  last_verified_at: "2026-04-11T12:05:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleInstallationOtherProvider: IntegrationInstallation = {
  installation_id: "inst-3",
  tenant_id: "tenant-1",
  provider_code: "shopee",
  family: "marketplace",
  display_name: "Shopee Store",
  status: "connected",
  health_status: "healthy",
  external_account_id: "acc-3",
  external_account_name: "Shopee Account",
  active_credential_id: "cred-3",
  last_verified_at: "2026-04-11T12:15:00Z",
  created_at: "2026-04-11T12:00:00Z",
  updated_at: "2026-04-11T12:30:00Z",
};

const sampleAuthStatus: IntegrationAuthStatusResponse = {
  installation_id: "inst-2",
  status: "requires_reauth",
  health_status: "warning",
  provider_code: "bling",
  external_account_id: "acc-2",
};

const sampleOperationRuns: IntegrationOperationRun[] = [
  {
    operation_run_id: "run-1",
    installation_id: "inst-2",
    operation_type: "fee_sync",
    status: "queued",
    result_code: "",
    failure_code: "",
    attempt_count: 0,
    actor_type: "user",
    actor_id: "user-1",
    created_at: "2026-04-11T12:20:00Z",
    updated_at: "2026-04-11T12:20:00Z",
  },
];

const sampleFailedFeeSyncRun: IntegrationOperationRun = {
  operation_run_id: "run-failed-1",
  installation_id: "inst-2",
  operation_type: "fee_sync",
  status: "failed",
  result_code: "",
  failure_code: "PROVIDER_TIMEOUT",
  attempt_count: 1,
  actor_type: "system",
  actor_id: "fee-sync",
  created_at: isoHoursAgo(2),
  updated_at: isoHoursAgo(2),
};

const refreshedOperationRuns: IntegrationOperationRun[] = [
  {
    operation_run_id: "run-2",
    installation_id: "inst-2",
    operation_type: "fee_sync",
    status: "succeeded",
    result_code: "SYNCED",
    failure_code: "",
    attempt_count: 1,
    actor_type: "system",
    actor_id: "fee-sync",
    started_at: "2026-04-11T12:21:00Z",
    completed_at: "2026-04-11T12:22:00Z",
    created_at: "2026-04-11T12:21:00Z",
    updated_at: "2026-04-11T12:22:00Z",
  },
];

function makeClient(overrides: Partial<IntegrationsHubClient> = {}): IntegrationsHubClient {
  return {
    listIntegrationProviders: mockListProviders,
    listIntegrationInstallations: mockListInstallations,
    listIntegrationOperationRuns: mockListOperationRuns,
    getIntegrationAuthStatus: mockGetIntegrationAuthStatus,
    startIntegrationAuthorization: mockStartIntegrationAuthorization,
    startIntegrationReauthorization: mockStartIntegrationReauthorization,
    submitIntegrationCredentials: mockSubmitIntegrationCredentials,
    disconnectIntegrationInstallation: mockDisconnectIntegrationInstallation,
    startIntegrationFeeSync: mockStartIntegrationFeeSync,
    ...overrides,
  };
}

function renderPage(
  initialEntries = ["/integrations"],
  clientOverrides: Partial<IntegrationsHubClient> = {},
  onAuthRedirect?: (authUrl: string) => void,
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <IntegrationsHubPage client={makeClient(clientOverrides)} onAuthRedirect={onAuthRedirect} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockListProviders.mockReset();
  mockListInstallations.mockReset();
  mockListOperationRuns.mockReset();
  mockGetIntegrationAuthStatus.mockReset();
  mockStartIntegrationAuthorization.mockReset();
  mockStartIntegrationReauthorization.mockReset();
  mockSubmitIntegrationCredentials.mockReset();
  mockDisconnectIntegrationInstallation.mockReset();
  mockStartIntegrationFeeSync.mockReset();
  mockListProviders.mockResolvedValue({ items: [sampleProvider, sampleProviderNeedsAction] });
  mockListInstallations.mockResolvedValue({
    items: [sampleInstallation, sampleInstallationNeedsAction, sampleInstallationOtherProvider],
  });
  mockListOperationRuns.mockResolvedValue({ items: sampleOperationRuns });
  mockGetIntegrationAuthStatus.mockResolvedValue(sampleAuthStatus);
});

describe("IntegrationsHubPage", () => {
  it("shows empty state when listIntegrationInstallations returns empty", async () => {
    mockListInstallations.mockResolvedValue({ items: [] });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no integrations connected/i)).toBeInTheDocument()
    );
  });

  it("shows error state when listIntegrationInstallations rejects with structured error", async () => {
    mockListInstallations.mockRejectedValue({
      status: 502,
      error: {
        code: "INTEGRATIONS_LIST_FAILED",
        message: "Integration registry unavailable",
      },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/integration registry unavailable/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/failed to load integrations/i)).toBeInTheDocument();
  });

  it("renders a connected installation with provider details", async () => {
    mockListInstallations.mockResolvedValue({ items: [sampleInstallation] });

    renderPage();

    const card = await screen.findByText("VTEX Main Store");
    expect(card).toBeInTheDocument();

    const cardButton = card.closest("button");
    expect(cardButton).not.toBeNull();
    if (!cardButton) {
      return;
    }

    expect(within(cardButton).getByText("VTEX")).toBeInTheDocument();
    expect(within(cardButton).getByText(/healthy/i)).toBeInTheDocument();
  });

  it("still renders installations when provider metadata fails to load", async () => {
    mockListProviders.mockRejectedValue({
      status: 503,
      error: {
        code: "INTEGRATIONS_PROVIDER_LIST_FAILED",
        message: "Provider registry unavailable",
      },
    });
    mockListInstallations.mockResolvedValue({ items: [sampleInstallation] });

    renderPage();

    expect(await screen.findByText("VTEX Main Store")).toBeInTheDocument();
    expect(screen.getByText("vtex")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("filters installations by provider and needs action", async () => {
    renderPage();

    expect(await screen.findByText("VTEX Main Store")).toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.getByText("Shopee Store")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "bling" } });

    expect(screen.queryByText("VTEX Main Store")).not.toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.queryByText("Shopee Store")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^needs action$/i }));

    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.queryByText("VTEX Main Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Shopee Store")).not.toBeInTheDocument();
  });

  it("filters installations by status and health", async () => {
    renderPage();

    expect(await screen.findByText("VTEX Main Store")).toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.getByText("Shopee Store")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "requires_reauth" } });
    fireEvent.change(screen.getByLabelText(/health/i), { target: { value: "warning" } });

    expect(screen.queryByText("VTEX Main Store")).not.toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.queryByText("Shopee Store")).not.toBeInTheDocument();
  });

  it("filters installations by search text", async () => {
    renderPage();

    expect(await screen.findByText("VTEX Main Store")).toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.getByText("Shopee Store")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "shopee" } });

    expect(screen.queryByText("VTEX Main Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Bling Store")).not.toBeInTheDocument();
    expect(screen.getByText("Shopee Store")).toBeInTheDocument();
  });

  it("opens the installation drawer when the installation query is present", async () => {
    renderPage(["/integrations?installation=inst-2"]);

    const dialog = await screen.findByRole("dialog", { name: /bling store details/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Bling Store")).toBeInTheDocument();
    expect(within(dialog).getByText("Bling Account")).toBeInTheDocument();
    expect(within(dialog).getByText("Bling")).toBeInTheDocument();
  });

  it("shows success callback notice when redirected after authorization", async () => {
    mockListInstallations.mockResolvedValue({ items: [sampleInstallation] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-1",
      status: "connected",
      health_status: "healthy",
      provider_code: "vtex",
      external_account_id: "acc-1",
    });

    renderPage(["/integrations?installation=inst-1&auth=connected"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/integration authorized successfully/i);
  });

  it("synchronizes installation card status from auth status snapshot", async () => {
    mockListProviders.mockResolvedValue({ items: [sampleProviderNeedsAction] });
    mockListInstallations.mockResolvedValue({ items: [sampleInstallationNeedsAction] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-2",
      status: "connected",
      health_status: "healthy",
      provider_code: "bling",
      external_account_id: "acc-2",
    });

    renderPage(["/integrations?installation=inst-2"]);

    await screen.findByRole("dialog", { name: /bling store details/i });
    await waitFor(() => {
      const installationCardLabel = screen.getAllByText("Bling Store").find((node) => node.closest("button") !== null);
      const installationCard = installationCardLabel?.closest("button");
      expect(installationCard).not.toBeNull();
      if (!installationCard) {
        return;
      }
      expect(within(installationCard).getByText("connected")).toBeInTheDocument();
      expect(within(installationCard).getByText("healthy")).toBeInTheDocument();
      expect(within(installationCard).getByText("Ready")).toBeInTheDocument();
    });
  });

  it("applies sync failures quick filter from KPI row", async () => {
    mockListOperationRuns.mockImplementation(async (installationId: string) => {
      if (installationId === "inst-2") {
        return { items: [sampleFailedFeeSyncRun] };
      }
      return { items: [] };
    });

    renderPage();

    expect(await screen.findByText("VTEX Main Store")).toBeInTheDocument();
    expect(screen.getByText("Bling Store")).toBeInTheDocument();
    expect(screen.getByText("Shopee Store")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sync failures \(24h\)/i }));

    await waitFor(() => expect(screen.getByText("Bling Store")).toBeInTheDocument());
    expect(screen.queryByText("VTEX Main Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Shopee Store")).not.toBeInTheDocument();
  });

  it("authorizes a draft installation and redirects to the returned auth url", async () => {
    const authUrl = "https://auth.example.com/draft";
    const redirectToAuthUrl = vi.fn();

    mockListInstallations.mockResolvedValue({ items: [sampleInstallationDraft] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-5",
      status: "draft",
      health_status: "warning",
      provider_code: "bling",
    });
    mockStartIntegrationAuthorization.mockResolvedValue({
      installation_id: "inst-5",
      provider_code: "bling",
      state: "draft-state",
      auth_url: authUrl,
      expires_in: 300,
    });

    renderPage(["/integrations?installation=inst-5"], {}, redirectToAuthUrl);

    const dialog = await screen.findByRole("dialog", { name: /bling draft details/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /authorize/i }));

    await waitFor(() => expect(mockStartIntegrationAuthorization).toHaveBeenCalledWith("inst-5"));
    expect(redirectToAuthUrl).toHaveBeenCalledWith(authUrl);
  });

  it("authorizes a pending installation and redirects to the returned auth url", async () => {
    const authUrl = "https://auth.example.com/start";
    const redirectToAuthUrl = vi.fn();

    mockListInstallations.mockResolvedValue({ items: [sampleInstallationPendingConnection] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-4",
      status: "pending_connection",
      health_status: "warning",
      provider_code: "bling",
    });
    mockStartIntegrationAuthorization.mockResolvedValue({
      installation_id: "inst-4",
      provider_code: "bling",
      state: "opaque-state",
      auth_url: authUrl,
      expires_in: 300,
    });

    renderPage(["/integrations?installation=inst-4"], {}, redirectToAuthUrl);

    const dialog = await screen.findByRole("dialog", { name: /bling pending details/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /authorize/i }));

    await waitFor(() => expect(mockStartIntegrationAuthorization).toHaveBeenCalledWith("inst-4"));
    expect(redirectToAuthUrl).toHaveBeenCalledWith(authUrl);
  });

  it("shows authorize action for disconnected installations", async () => {
    const authUrl = "https://auth.example.com/reconnect";
    const redirectToAuthUrl = vi.fn();

    mockListInstallations.mockResolvedValue({ items: [sampleInstallationDisconnectedActionable] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-7",
      status: "disconnected",
      health_status: "warning",
      provider_code: "bling",
    });
    mockStartIntegrationAuthorization.mockResolvedValue({
      installation_id: "inst-7",
      provider_code: "bling",
      state: "reconnect-state",
      auth_url: authUrl,
      expires_in: 300,
    });

    renderPage(["/integrations?installation=inst-7"], {}, redirectToAuthUrl);

    const dialog = await screen.findByRole("dialog", { name: /bling disconnected details/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /authorize/i }));

    await waitFor(() => expect(mockStartIntegrationAuthorization).toHaveBeenCalledWith("inst-7"));
    expect(redirectToAuthUrl).toHaveBeenCalledWith(authUrl);
  });

  it("refreshes hub state after disconnecting an installation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    mockListInstallations
      .mockResolvedValueOnce({ items: [sampleInstallation] })
      .mockResolvedValueOnce({ items: [sampleInstallationDisconnected] });
    mockGetIntegrationAuthStatus
      .mockResolvedValueOnce({
        installation_id: "inst-1",
        status: "connected",
        health_status: "healthy",
        provider_code: "vtex",
      })
      .mockResolvedValueOnce({
        installation_id: "inst-1",
        status: "disconnected",
        health_status: "critical",
        provider_code: "vtex",
      });
    mockDisconnectIntegrationInstallation.mockResolvedValue({
      installation_id: "inst-1",
      status: "disconnected",
      health_status: "critical",
      provider_code: "vtex",
      external_account_id: "acc-1",
    });

    renderPage(["/integrations?installation=inst-1"]);

    const dialog = await screen.findByRole("dialog", { name: /vtex main store details/i });
    const connectedMetric = screen.getByText("Healthy and ready for sync").closest("button");
    expect(connectedMetric).not.toBeNull();
    if (!connectedMetric) {
      return;
    }

    const installationCardLabel = screen.getAllByText("VTEX Main Store")
      .find((node) => node.closest("button") !== null);
    const installationCard = installationCardLabel?.closest("button") ?? null;
    expect(installationCard).not.toBeNull();
    if (!installationCard) {
      return;
    }

    expect(within(connectedMetric).getByText("1")).toBeInTheDocument();
    expect(within(installationCard).getByText("connected")).toBeInTheDocument();

    const disconnectButton = within(dialog).getByRole("button", { name: /disconnect/i });

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(disconnectButton);
    await waitFor(() => expect(mockDisconnectIntegrationInstallation).not.toHaveBeenCalled());

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(disconnectButton);
    await waitFor(() => expect(mockDisconnectIntegrationInstallation).toHaveBeenCalledWith("inst-1"));

    await waitFor(() => expect(mockListInstallations).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const refreshedCardLabel = screen.getAllByText("VTEX Main Store")
        .find((node) => node.closest("button") !== null);
      const refreshedCard = refreshedCardLabel?.closest("button");
      expect(refreshedCard).not.toBeNull();
      expect(within(refreshedCard as HTMLElement).getByText("disconnected")).toBeInTheDocument();
    });
    expect(within(connectedMetric).getByText("0")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("queues fee sync and refreshes the operation timeline", async () => {
    mockListInstallations.mockResolvedValue({ items: [sampleInstallationNeedsAction] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-2",
      status: "connected",
      health_status: "healthy",
      provider_code: "bling",
    });
    let syncTriggered = false;
    mockListOperationRuns.mockImplementation(async (installationID: string) => {
      if (installationID !== "inst-2") {
        return { items: [] };
      }
      return { items: syncTriggered ? refreshedOperationRuns : sampleOperationRuns };
    });
    mockStartIntegrationFeeSync.mockImplementation(async () => {
      syncTriggered = true;
      return {
        installation_id: "inst-2",
        operation_run_id: "run-2",
        status: "queued",
      };
    });

    renderPage(["/integrations?installation=inst-2"]);

    const dialog = await screen.findByRole("dialog", { name: /bling store details/i });
    expect(await within(dialog).findByText("run-1")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /sync fees/i }));

    await waitFor(() => expect(mockStartIntegrationFeeSync).toHaveBeenCalledWith("inst-2"));
    await waitFor(() => expect(mockListOperationRuns).toHaveBeenCalledWith("inst-2"));
    expect(within(dialog).getByText("run-2")).toBeInTheDocument();
  });

  it("shows backend error code in load failure state", async () => {
    mockListInstallations.mockRejectedValue({
      status: 503,
      error: {
        code: "INTEGRATIONS_BACKEND_UNAVAILABLE",
        message: "Backend unavailable",
      },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/INTEGRATIONS_BACKEND_UNAVAILABLE/)).toBeInTheDocument();
  });

  it("submits API key credentials for api_key providers", async () => {
    mockListProviders.mockResolvedValue({ items: [sampleProviderAPIKey] });
    mockListInstallations.mockResolvedValue({ items: [sampleInstallationPendingAPIKey] });
    mockGetIntegrationAuthStatus.mockResolvedValue({
      installation_id: "inst-6",
      status: "pending_connection",
      health_status: "warning",
      provider_code: "shopee",
    });
    mockSubmitIntegrationCredentials.mockResolvedValue({
      installation_id: "inst-6",
      status: "connected",
      health_status: "healthy",
      provider_code: "shopee",
      external_account_id: "acc-6",
    });

    renderPage(["/integrations?installation=inst-6"]);

    const dialog = await screen.findByRole("dialog", { name: /shopee pending details/i });
    const apiKeyInput = within(dialog).getByLabelText(/api key/i);
    fireEvent.change(apiKeyInput, { target: { value: "sk_test_123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /submit credentials/i }));

    await waitFor(() =>
      expect(mockSubmitIntegrationCredentials).toHaveBeenCalledWith("inst-6", {
        api_key: "sk_test_123",
      })
    );
  });
});
