import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IntegrationsHubPage } from "./IntegrationsHubPage";
import type {
  IntegrationInstallation,
  IntegrationProviderDefinition,
} from "@marketplace-central/sdk-runtime";

type IntegrationsHubClient = {
  listIntegrationProviders: () => Promise<{ items: IntegrationProviderDefinition[] }>;
  listIntegrationInstallations: () => Promise<{ items: IntegrationInstallation[] }>;
};

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

function makeClient(overrides: Partial<IntegrationsHubClient> = {}): IntegrationsHubClient {
  return {
    listIntegrationProviders: mockListProviders,
    listIntegrationInstallations: mockListInstallations,
    ...overrides,
  };
}

beforeEach(() => {
  mockListProviders.mockReset();
  mockListInstallations.mockReset();
  mockListProviders.mockResolvedValue({ items: [sampleProvider] });
});

describe("IntegrationsHubPage", () => {
  it("shows empty state when listIntegrationInstallations returns empty", async () => {
    mockListInstallations.mockResolvedValue({ items: [] });

    render(<IntegrationsHubPage client={makeClient()} />);

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

    render(<IntegrationsHubPage client={makeClient()} />);

    await waitFor(() =>
      expect(screen.getByText(/integration registry unavailable/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/failed to load integrations/i)).toBeInTheDocument();
  });
});
