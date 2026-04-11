import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntegrationsHubPage, type IntegrationsHubClient } from "./IntegrationsHubPage";
import type { IntegrationInstallation, IntegrationProviderDefinition } from "@marketplace-central/sdk-runtime";

const mockListProviders = vi.fn();
const mockListInstallations = vi.fn();

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

function makeClient(overrides: Partial<IntegrationsHubClient> = {}): IntegrationsHubClient {
  return {
    listIntegrationProviders: mockListProviders,
    listIntegrationInstallations: mockListInstallations,
    ...overrides,
  };
}

function renderPage(initialEntries = ["/integrations"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <IntegrationsHubPage client={makeClient()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockListProviders.mockReset();
  mockListInstallations.mockReset();
  mockListProviders.mockResolvedValue({ items: [sampleProvider, sampleProviderNeedsAction] });
  mockListInstallations.mockResolvedValue({
    items: [sampleInstallation, sampleInstallationNeedsAction, sampleInstallationOtherProvider],
  });
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
});
