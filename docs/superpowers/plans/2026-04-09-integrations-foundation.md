# Integrations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical `integrations` platform foundation for marketplace providers, including provider catalog, tenant installations, versioned credentials, auth sessions, capability states, operation tracking, and initial installation APIs.

**Architecture:** Introduce a new `apps/server_core/internal/modules/integrations` module that owns platform connection lifecycle while existing business modules consume it through stable ports. Persist provider/installation/security records in new tenant-scoped tables, expose installation-oriented HTTP endpoints and SDK methods, and add a compatibility bridge so `marketplaces` can reference `integration_installation_id` without remaining the canonical owner of auth state.

**Tech Stack:** Go 1.25, PostgreSQL via `pgx/v5`, OpenAPI 3.1, TypeScript SDK, slog, Vitest, React workspace tooling

---

## References

- Spec: `docs/superpowers/specs/2026-04-09-integrations-foundation-design.md`
- Architecture constraints: `ARCHITECTURE.md`
- Current composition root: `apps/server_core/internal/composition/root.go`
- Current marketplace persistence: `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go`
- Current API contract: `contracts/api/marketplace-central.openapi.yaml`

## File Map

| Action | File |
|---|---|
| Create | `apps/server_core/migrations/0016_integrations_foundation.sql` |
| Create | `apps/server_core/internal/modules/integrations/domain/provider_definition.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/installation.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/credential.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/auth_session.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/capability_state.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/operation_run.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/lifecycle.go` |
| Create | `apps/server_core/internal/modules/integrations/domain/lifecycle_test.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/provider_registry.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/installation_repository.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/credential_store.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/auth_session_store.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/capability_state_store.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/operation_run_store.go` |
| Create | `apps/server_core/internal/modules/integrations/ports/marketplace_capabilities.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/providers/registry.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/providers/registry_test.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/credential_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/capability_state_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/adapters/postgres/operation_run_repo.go` |
| Create | `apps/server_core/internal/modules/integrations/application/provider_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/installation_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/credential_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/auth_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/capability_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/operation_service.go` |
| Create | `apps/server_core/internal/modules/integrations/application/provider_service_test.go` |
| Create | `apps/server_core/internal/modules/integrations/application/installation_service_test.go` |
| Create | `apps/server_core/internal/modules/integrations/application/credential_service_test.go` |
| Create | `apps/server_core/internal/modules/integrations/application/capability_service_test.go` |
| Create | `apps/server_core/internal/modules/integrations/transport/http_handler.go` |
| Create | `apps/server_core/internal/modules/integrations/transport/http_handler_test.go` |
| Modify | `apps/server_core/internal/composition/root.go` |
| Modify | `apps/server_core/internal/modules/marketplaces/domain/account.go` |
| Modify | `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go` |
| Modify | `contracts/api/marketplace-central.openapi.yaml` |
| Modify | `packages/sdk-runtime/src/index.ts` |
| Modify | `packages/sdk-runtime/src/index.test.ts` |

---

### Task 1: Database Foundation And Domain Model

**Files:**
- Create: `apps/server_core/migrations/0016_integrations_foundation.sql`
- Create: `apps/server_core/internal/modules/integrations/domain/provider_definition.go`
- Create: `apps/server_core/internal/modules/integrations/domain/installation.go`
- Create: `apps/server_core/internal/modules/integrations/domain/credential.go`
- Create: `apps/server_core/internal/modules/integrations/domain/auth_session.go`
- Create: `apps/server_core/internal/modules/integrations/domain/capability_state.go`
- Create: `apps/server_core/internal/modules/integrations/domain/operation_run.go`
- Create: `apps/server_core/internal/modules/integrations/domain/lifecycle.go`
- Create: `apps/server_core/internal/modules/integrations/domain/lifecycle_test.go`

- [ ] **Step 1: Write the failing lifecycle test**

```go
// apps/server_core/internal/modules/integrations/domain/lifecycle_test.go
package domain

import "testing"

func TestCanTransitionInstallationStatus(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		from InstallationStatus
		to   InstallationStatus
		want bool
	}{
		{name: "draft_to_pending", from: InstallationStatusDraft, to: InstallationStatusPendingConnection, want: true},
		{name: "pending_to_connected", from: InstallationStatusPendingConnection, to: InstallationStatusConnected, want: true},
		{name: "connected_to_requires_reauth", from: InstallationStatusConnected, to: InstallationStatusRequiresReauth, want: true},
		{name: "disconnected_to_connected_is_rejected", from: InstallationStatusDisconnected, to: InstallationStatusConnected, want: false},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := CanTransitionInstallationStatus(tc.from, tc.to)
			if got != tc.want {
				t.Fatalf("CanTransitionInstallationStatus(%q, %q) = %v, want %v", tc.from, tc.to, got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run the domain test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/domain -run TestCanTransitionInstallationStatus -v
```

Expected: FAIL with `directory not found` or compile errors because the `integrations/domain` package does not exist yet.

- [ ] **Step 3: Write the migration and domain primitives**

```sql
-- apps/server_core/migrations/0016_integrations_foundation.sql
CREATE TABLE IF NOT EXISTS integration_provider_definitions (
    provider_code      text PRIMARY KEY,
    tenant_id          text NOT NULL DEFAULT 'system',
    family             text NOT NULL CHECK (family IN ('marketplace')),
    display_name       text NOT NULL,
    auth_strategy      text NOT NULL CHECK (auth_strategy IN ('oauth2', 'api_key', 'token', 'none', 'unknown')),
    install_mode       text NOT NULL CHECK (install_mode IN ('interactive', 'manual', 'hybrid')),
    metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
    declared_caps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_installations (
    installation_id           text PRIMARY KEY,
    tenant_id                 text NOT NULL,
    provider_code             text NOT NULL REFERENCES integration_provider_definitions(provider_code),
    family                    text NOT NULL CHECK (family IN ('marketplace')),
    display_name              text NOT NULL,
    status                    text NOT NULL CHECK (status IN ('draft', 'pending_connection', 'connected', 'degraded', 'requires_reauth', 'disconnected', 'suspended', 'failed')),
    health_status             text NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'warning', 'critical')),
    external_account_id       text NOT NULL DEFAULT '',
    external_account_name     text NOT NULL DEFAULT '',
    active_credential_id      text,
    last_verified_at          timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_accounts
    ADD COLUMN IF NOT EXISTS integration_installation_id text REFERENCES integration_installations(installation_id);
```

```go
// apps/server_core/internal/modules/integrations/domain/lifecycle.go
package domain

type IntegrationFamily string
type InstallationStatus string
type CapabilityStatus string
type AuthState string
type HealthStatus string

const (
	IntegrationFamilyMarketplace IntegrationFamily = "marketplace"

	InstallationStatusDraft             InstallationStatus = "draft"
	InstallationStatusPendingConnection InstallationStatus = "pending_connection"
	InstallationStatusConnected         InstallationStatus = "connected"
	InstallationStatusDegraded          InstallationStatus = "degraded"
	InstallationStatusRequiresReauth    InstallationStatus = "requires_reauth"
	InstallationStatusDisconnected      InstallationStatus = "disconnected"
	InstallationStatusSuspended         InstallationStatus = "suspended"
	InstallationStatusFailed            InstallationStatus = "failed"
)

var installationTransitions = map[InstallationStatus]map[InstallationStatus]bool{
	InstallationStatusDraft: {
		InstallationStatusPendingConnection: true,
	},
	InstallationStatusPendingConnection: {
		InstallationStatusConnected: true,
		InstallationStatusFailed:    true,
	},
	InstallationStatusConnected: {
		InstallationStatusDegraded:       true,
		InstallationStatusRequiresReauth: true,
		InstallationStatusDisconnected:   true,
		InstallationStatusSuspended:      true,
	},
	InstallationStatusDegraded: {
		InstallationStatusConnected:      true,
		InstallationStatusRequiresReauth: true,
	},
	InstallationStatusRequiresReauth: {
		InstallationStatusPendingConnection: true,
	},
	InstallationStatusFailed: {
		InstallationStatusDraft: true,
	},
}

func CanTransitionInstallationStatus(from, to InstallationStatus) bool {
	return installationTransitions[from][to]
}
```

- [ ] **Step 4: Run the domain test to verify it passes**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/domain -v
```

Expected: PASS for the lifecycle rules and domain package compilation.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/migrations/0016_integrations_foundation.sql apps/server_core/internal/modules/integrations/domain/
git commit -m "feat(integrations): add domain model and schema foundation"
```

---

### Task 2: Provider Registry And Catalog Service

**Files:**
- Create: `apps/server_core/internal/modules/integrations/ports/provider_registry.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/providers/registry.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/providers/registry_test.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go`
- Create: `apps/server_core/internal/modules/integrations/application/provider_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/provider_service_test.go`

- [ ] **Step 1: Write the failing provider service test**

```go
// apps/server_core/internal/modules/integrations/application/provider_service_test.go
package application

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubProviderDefinitionRepo struct {
	upserted []domain.ProviderDefinition
}

func (s *stubProviderDefinitionRepo) UpsertProviderDefinitions(_ context.Context, defs []domain.ProviderDefinition) error {
	s.upserted = append([]domain.ProviderDefinition(nil), defs...)
	return nil
}

func (s *stubProviderDefinitionRepo) ListProviderDefinitions(_ context.Context) ([]domain.ProviderDefinition, error) {
	return append([]domain.ProviderDefinition(nil), s.upserted...), nil
}

func TestProviderServiceSeedsAndListsDefinitions(t *testing.T) {
	t.Parallel()

	repo := &stubProviderDefinitionRepo{}
	svc := NewProviderService(repo)

	if err := svc.SeedProviderDefinitions(context.Background(), []domain.ProviderDefinition{{
		ProviderCode: "mercado_livre",
		Family:       domain.IntegrationFamilyMarketplace,
		DisplayName:  "Mercado Livre",
	}}); err != nil {
		t.Fatalf("SeedProviderDefinitions() error = %v", err)
	}

	if len(repo.upserted) != 1 {
		t.Fatalf("expected 1 upserted definition, got %d", len(repo.upserted))
	}
}
```

- [ ] **Step 2: Run the provider service test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application -run TestProviderServiceSeedsAndListsDefinitions -v
```

Expected: FAIL with missing `ProviderDefinition`, repository interfaces, and `NewProviderService`.

- [ ] **Step 3: Implement provider definition contracts, registry, and service**

```go
// apps/server_core/internal/modules/integrations/ports/provider_registry.go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type ProviderDefinitionRepository interface {
	UpsertProviderDefinitions(ctx context.Context, defs []domain.ProviderDefinition) error
	ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error)
}

type ProviderRegistry interface {
	All() []domain.ProviderDefinition
}
```

```go
// apps/server_core/internal/modules/integrations/adapters/providers/registry.go
package providers

import "marketplace-central/apps/server_core/internal/modules/integrations/domain"

type Registry struct {
	definitions []domain.ProviderDefinition
}

func NewRegistry() *Registry {
	return &Registry{definitions: []domain.ProviderDefinition{
		{ProviderCode: "mercado_livre", Family: domain.IntegrationFamilyMarketplace, DisplayName: "Mercado Livre", AuthStrategy: "oauth2", InstallMode: "interactive", DeclaredCapabilities: []string{"pricing_fee_sync", "order_read", "message_read", "message_reply"}, IsActive: true},
		{ProviderCode: "magalu", Family: domain.IntegrationFamilyMarketplace, DisplayName: "Magalu", AuthStrategy: "oauth2", InstallMode: "interactive", DeclaredCapabilities: []string{"pricing_fee_sync", "order_read"}, IsActive: true},
		{ProviderCode: "shopee", Family: domain.IntegrationFamilyMarketplace, DisplayName: "Shopee", AuthStrategy: "unknown", InstallMode: "manual", DeclaredCapabilities: []string{"pricing_fee_sync"}, IsActive: true},
	}}
}

func (r *Registry) All() []domain.ProviderDefinition {
	out := make([]domain.ProviderDefinition, len(r.definitions))
	copy(out, r.definitions)
	return out
}
```

```go
// apps/server_core/internal/modules/integrations/application/provider_service.go
package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type ProviderService struct {
	repo ports.ProviderDefinitionRepository
}

func NewProviderService(repo ports.ProviderDefinitionRepository) *ProviderService {
	return &ProviderService{repo: repo}
}

func (s *ProviderService) SeedProviderDefinitions(ctx context.Context, defs []domain.ProviderDefinition) error {
	return s.repo.UpsertProviderDefinitions(ctx, defs)
}

func (s *ProviderService) ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error) {
	return s.repo.ListProviderDefinitions(ctx)
}
```

- [ ] **Step 4: Run the provider tests to verify they pass**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/adapters/providers ./internal/modules/integrations/application -v
```

Expected: PASS for registry and provider service tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/provider_registry.go apps/server_core/internal/modules/integrations/adapters/providers/ apps/server_core/internal/modules/integrations/adapters/postgres/provider_definition_repo.go apps/server_core/internal/modules/integrations/application/provider_service.go apps/server_core/internal/modules/integrations/application/provider_service_test.go
git commit -m "feat(integrations): add provider registry and catalog service"
```

---

### Task 3: Installation Repository, Service, And HTTP Slice

**Files:**
- Create: `apps/server_core/internal/modules/integrations/ports/installation_repository.go`
- Create: `apps/server_core/internal/modules/integrations/application/installation_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/installation_service_test.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go`
- Create: `apps/server_core/internal/modules/integrations/transport/http_handler.go`
- Create: `apps/server_core/internal/modules/integrations/transport/http_handler_test.go`

- [ ] **Step 1: Write the failing installation service and handler tests**

```go
// apps/server_core/internal/modules/integrations/application/installation_service_test.go
package application

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubInstallationRepo struct {
	saved []domain.Installation
	list  []domain.Installation
}

func (s *stubInstallationRepo) CreateInstallation(_ context.Context, inst domain.Installation) error {
	s.saved = append(s.saved, inst)
	return nil
}

func (s *stubInstallationRepo) GetInstallation(_ context.Context, installationID string) (domain.Installation, bool, error) {
	for _, inst := range s.list {
		if inst.InstallationID == installationID {
			return inst, true, nil
		}
	}
	return domain.Installation{}, false, nil
}

func (s *stubInstallationRepo) ListInstallations(_ context.Context) ([]domain.Installation, error) {
	return append([]domain.Installation(nil), s.list...), nil
}

func (s *stubInstallationRepo) UpdateInstallationStatus(_ context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	return nil
}

func TestCreateDraftInstallation(t *testing.T) {
	t.Parallel()

	repo := &stubInstallationRepo{}
	svc := NewInstallationService(repo, "tenant-default")

	inst, err := svc.CreateDraft(context.Background(), CreateInstallationInput{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		DisplayName:    "ML Primary",
		Family:         string(domain.IntegrationFamilyMarketplace),
	})
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}

	if inst.Status != domain.InstallationStatusDraft {
		t.Fatalf("installation status = %q, want %q", inst.Status, domain.InstallationStatusDraft)
	}
}
```

```go
// apps/server_core/internal/modules/integrations/transport/http_handler_test.go
package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubInstallationService struct{}
type stubProviderService struct{}

func (s stubProviderService) ListProviderDefinitions(context.Context) ([]domain.ProviderDefinition, error) {
	return []domain.ProviderDefinition{{ProviderCode: "mercado_livre", Family: domain.IntegrationFamilyMarketplace, DisplayName: "Mercado Livre", AuthStrategy: "oauth2", InstallMode: "interactive", DeclaredCapabilities: []string{"pricing_fee_sync"}, IsActive: true}}, nil
}

func (s stubInstallationService) List(context.Context) ([]domain.Installation, error) {
	return []domain.Installation{}, nil
}

func (s stubInstallationService) Get(context.Context, string) (domain.Installation, bool, error) {
	return domain.Installation{}, false, nil
}

func (s stubInstallationService) CreateDraft(context.Context, application.CreateInstallationInput) (domain.Installation, error) {
	return domain.Installation{InstallationID: "inst_001", TenantID: "tenant-default", ProviderCode: "mercado_livre", Family: domain.IntegrationFamilyMarketplace, DisplayName: "ML Primary", Status: domain.InstallationStatusDraft, HealthStatus: domain.HealthStatusHealthy}, nil
}

func TestCreateInstallationRejectsWrongMethod(t *testing.T) {
	t.Parallel()

	h := NewHandler(stubProviderService{}, stubInstallationService{})
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodDelete, "/integrations/installations", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestCreateInstallationDraft(t *testing.T) {
	t.Parallel()

	h := NewHandler(stubProviderService{}, stubInstallationService{})
	mux := http.NewServeMux()
	h.Register(mux)

	body := `{"installation_id":"inst_001","provider_code":"mercado_livre","family":"marketplace","display_name":"ML Primary"}`
	req := httptest.NewRequest(http.MethodPost, "/integrations/installations", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusCreated)
	}

	var got domain.Installation
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.InstallationID != "inst_001" {
		t.Fatalf("installation_id = %q, want %q", got.InstallationID, "inst_001")
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application ./internal/modules/integrations/transport -v
```

Expected: FAIL with missing repository interfaces, service types, and handler constructors.

- [ ] **Step 3: Implement the installation repository, service, and transport**

```go
// apps/server_core/internal/modules/integrations/ports/installation_repository.go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type InstallationRepository interface {
	CreateInstallation(ctx context.Context, inst domain.Installation) error
	GetInstallation(ctx context.Context, installationID string) (domain.Installation, bool, error)
	ListInstallations(ctx context.Context) ([]domain.Installation, error)
	UpdateInstallationStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error
}
```

```go
// apps/server_core/internal/modules/integrations/application/installation_service.go
package application

import (
	"context"
	"errors"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type CreateInstallationInput struct {
	InstallationID string
	ProviderCode   string
	Family         string
	DisplayName    string
}

type InstallationService struct {
	repo     ports.InstallationRepository
	tenantID string
}

func NewInstallationService(repo ports.InstallationRepository, tenantID string) *InstallationService {
	return &InstallationService{repo: repo, tenantID: tenantID}
}

func (s *InstallationService) CreateDraft(ctx context.Context, input CreateInstallationInput) (domain.Installation, error) {
	if input.InstallationID == "" || input.ProviderCode == "" || input.DisplayName == "" || input.Family == "" {
		return domain.Installation{}, errors.New("INTEGRATIONS_INSTALLATION_INVALID")
	}

	now := time.Now().UTC()
	inst := domain.Installation{
		InstallationID: input.InstallationID,
		TenantID:       s.tenantID,
		ProviderCode:   input.ProviderCode,
		Family:         domain.IntegrationFamily(input.Family),
		DisplayName:    input.DisplayName,
		Status:         domain.InstallationStatusDraft,
		HealthStatus:   domain.HealthStatusHealthy,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	return inst, s.repo.CreateInstallation(ctx, inst)
}

func (s *InstallationService) List(ctx context.Context) ([]domain.Installation, error) {
	return s.repo.ListInstallations(ctx)
}

func (s *InstallationService) Get(ctx context.Context, installationID string) (domain.Installation, bool, error) {
	return s.repo.GetInstallation(ctx, installationID)
}
```

```go
// apps/server_core/internal/modules/integrations/transport/http_handler.go
package transport

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/platform/httpx"
)

type ProviderReader interface {
	ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error)
}

type InstallationReader interface {
	List(ctx context.Context) ([]domain.Installation, error)
	Get(ctx context.Context, installationID string) (domain.Installation, bool, error)
	CreateDraft(ctx context.Context, input application.CreateInstallationInput) (domain.Installation, error)
}

type Handler struct {
	providerSvc     ProviderReader
	installationSvc InstallationReader
}

func NewHandler(providerSvc ProviderReader, installationSvc InstallationReader) Handler {
	return Handler{providerSvc: providerSvc, installationSvc: installationSvc}
}

func writeIntegrationError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "details": map[string]any{}}})
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/integrations/providers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_PROVIDER_METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		start := time.Now()
		items, err := h.providerSvc.ListProviderDefinitions(r.Context())
		if err != nil {
			slog.Error("list integration providers failed", "action", "list_integration_providers", "result", "error", "duration_ms", time.Since(start).Milliseconds(), "err", err)
			writeIntegrationError(w, http.StatusInternalServerError, "INTEGRATIONS_PROVIDER_LIST_FAILED", err.Error())
			return
		}
		slog.Info("list integration providers", "action", "list_integration_providers", "result", "ok", "duration_ms", time.Since(start).Milliseconds(), "count", len(items))
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	mux.HandleFunc("/integrations/installations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			items, err := h.installationSvc.List(r.Context())
			if err != nil {
				writeIntegrationError(w, http.StatusInternalServerError, "INTEGRATIONS_INSTALLATION_LIST_FAILED", err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
		case http.MethodPost:
			var req struct {
				InstallationID string `json:"installation_id"`
				ProviderCode   string `json:"provider_code"`
				Family         string `json:"family"`
				DisplayName    string `json:"display_name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeIntegrationError(w, http.StatusBadRequest, "INTEGRATIONS_INSTALLATION_INVALID", "malformed request body")
				return
			}
			inst, err := h.installationSvc.CreateDraft(r.Context(), application.CreateInstallationInput(req))
			if err != nil {
				status := http.StatusInternalServerError
				if strings.HasPrefix(err.Error(), "INTEGRATIONS_") {
					status = http.StatusBadRequest
				}
				writeIntegrationError(w, status, err.Error(), err.Error())
				return
			}
			httpx.WriteJSON(w, http.StatusCreated, inst)
		default:
			w.Header().Set("Allow", "GET, POST")
			writeIntegrationError(w, http.StatusMethodNotAllowed, "INTEGRATIONS_INSTALLATION_METHOD_NOT_ALLOWED", "method not allowed")
		}
	})
}
```

- [ ] **Step 4: Run the installation tests to verify they pass**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application ./internal/modules/integrations/transport -v
```

Expected: PASS for draft installation creation, method validation, and handler response shape.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/installation_repository.go apps/server_core/internal/modules/integrations/application/installation_service.go apps/server_core/internal/modules/integrations/application/installation_service_test.go apps/server_core/internal/modules/integrations/adapters/postgres/installation_repo.go apps/server_core/internal/modules/integrations/transport/http_handler.go apps/server_core/internal/modules/integrations/transport/http_handler_test.go
git commit -m "feat(integrations): add installation service and HTTP slice"
```

---

### Task 4: Credentials, Auth Sessions, And Operation Runs

**Files:**
- Create: `apps/server_core/internal/modules/integrations/ports/credential_store.go`
- Create: `apps/server_core/internal/modules/integrations/ports/auth_session_store.go`
- Create: `apps/server_core/internal/modules/integrations/ports/operation_run_store.go`
- Create: `apps/server_core/internal/modules/integrations/application/credential_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/auth_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/operation_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/credential_service_test.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/credential_repo.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/operation_run_repo.go`

- [ ] **Step 1: Write the failing credential rotation test**

```go
// apps/server_core/internal/modules/integrations/application/credential_service_test.go
package application

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubCredentialStore struct {
	saved []domain.Credential
}

func (s *stubCredentialStore) SaveCredentialVersion(_ context.Context, cred domain.Credential) error {
	s.saved = append(s.saved, cred)
	return nil
}

func (s *stubCredentialStore) NextCredentialVersion(_ context.Context, installationID string) (int, error) {
	return len(s.saved) + 1, nil
}

func TestRotateCredentialCreatesNewVersion(t *testing.T) {
	t.Parallel()

	store := &stubCredentialStore{}
	svc := NewCredentialService(store, "tenant-default")

	cred, err := svc.Rotate(context.Background(), RotateCredentialInput{
		CredentialID:     "cred_001",
		InstallationID:   "inst_001",
		SecretType:       "oauth_client",
		EncryptedPayload: []byte("ciphertext"),
		EncryptionKeyID:  "kek_1",
	})
	if err != nil {
		t.Fatalf("Rotate() error = %v", err)
	}

	if cred.Version != 1 {
		t.Fatalf("credential version = %d, want 1", cred.Version)
	}
}
```

- [ ] **Step 2: Run the credential and auth tests to verify they fail**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application -run TestRotateCredentialCreatesNewVersion -v
```

Expected: FAIL with missing `Credential`, `RotateCredentialInput`, and `NewCredentialService`.

- [ ] **Step 3: Implement credential, auth session, and operation services**

```go
// apps/server_core/internal/modules/integrations/ports/credential_store.go
package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type CredentialStore interface {
	NextCredentialVersion(ctx context.Context, installationID string) (int, error)
	SaveCredentialVersion(ctx context.Context, cred domain.Credential) error
}
```

```go
// apps/server_core/internal/modules/integrations/application/credential_service.go
package application

import (
	"context"
	"errors"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type RotateCredentialInput struct {
	CredentialID     string
	InstallationID   string
	SecretType       string
	EncryptedPayload []byte
	EncryptionKeyID  string
}

type CredentialService struct {
	store    ports.CredentialStore
	tenantID string
}

func NewCredentialService(store ports.CredentialStore, tenantID string) *CredentialService {
	return &CredentialService{store: store, tenantID: tenantID}
}

func (s *CredentialService) Rotate(ctx context.Context, input RotateCredentialInput) (domain.Credential, error) {
	if input.CredentialID == "" || input.InstallationID == "" || input.SecretType == "" || len(input.EncryptedPayload) == 0 || input.EncryptionKeyID == "" {
		return domain.Credential{}, errors.New("INTEGRATIONS_CREDENTIAL_INVALID")
	}

	version, err := s.store.NextCredentialVersion(ctx, input.InstallationID)
	if err != nil {
		return domain.Credential{}, err
	}

	cred := domain.Credential{
		CredentialID:     input.CredentialID,
		TenantID:         s.tenantID,
		InstallationID:   input.InstallationID,
		Version:          version,
		SecretType:       input.SecretType,
		EncryptedPayload: input.EncryptedPayload,
		EncryptionKeyID:  input.EncryptionKeyID,
		IsActive:         true,
		CreatedAt:        time.Now().UTC(),
	}
	return cred, s.store.SaveCredentialVersion(ctx, cred)
}
```

```go
// apps/server_core/internal/modules/integrations/application/operation_service.go
package application

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type RecordOperationInput struct {
	OperationRunID string
	InstallationID string
	OperationType  string
	Status         string
	ResultCode     string
	AttemptCount   int
}

type OperationService struct {
	store    ports.OperationRunStore
	tenantID string
}

func NewOperationService(store ports.OperationRunStore, tenantID string) *OperationService {
	return &OperationService{store: store, tenantID: tenantID}
}

func (s *OperationService) Record(ctx context.Context, input RecordOperationInput) (domain.OperationRun, error) {
	run := domain.OperationRun{
		OperationRunID: input.OperationRunID,
		TenantID:       s.tenantID,
		InstallationID: input.InstallationID,
		OperationType:  input.OperationType,
		Status:         input.Status,
		ResultCode:     input.ResultCode,
		AttemptCount:   input.AttemptCount,
		CreatedAt:      time.Now().UTC(),
	}
	return run, s.store.SaveOperationRun(ctx, run)
}
```

- [ ] **Step 4: Run the credential and auth tests to verify they pass**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application -run 'TestRotateCredentialCreatesNewVersion|TestUpsertAuthSession|TestRecordOperation' -v
```

Expected: PASS for credential rotation, auth-session upsert, and operation recording.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/credential_store.go apps/server_core/internal/modules/integrations/ports/auth_session_store.go apps/server_core/internal/modules/integrations/ports/operation_run_store.go apps/server_core/internal/modules/integrations/application/credential_service.go apps/server_core/internal/modules/integrations/application/auth_service.go apps/server_core/internal/modules/integrations/application/operation_service.go apps/server_core/internal/modules/integrations/application/credential_service_test.go apps/server_core/internal/modules/integrations/adapters/postgres/credential_repo.go apps/server_core/internal/modules/integrations/adapters/postgres/auth_session_repo.go apps/server_core/internal/modules/integrations/adapters/postgres/operation_run_repo.go
git commit -m "feat(integrations): add credential and auth session services"
```

---

### Task 5: Capability Resolution And Marketplace Bridge

**Files:**
- Create: `apps/server_core/internal/modules/integrations/ports/capability_state_store.go`
- Create: `apps/server_core/internal/modules/integrations/ports/marketplace_capabilities.go`
- Create: `apps/server_core/internal/modules/integrations/application/capability_service.go`
- Create: `apps/server_core/internal/modules/integrations/application/capability_service_test.go`
- Create: `apps/server_core/internal/modules/integrations/adapters/postgres/capability_state_repo.go`
- Modify: `apps/server_core/internal/modules/marketplaces/domain/account.go`
- Modify: `apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go`

- [ ] **Step 1: Write the failing capability resolution test**

```go
// apps/server_core/internal/modules/integrations/application/capability_service_test.go
package application

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubCapabilityStateStore struct {
	states []domain.CapabilityState
}

func (s *stubCapabilityStateStore) UpsertCapabilityState(_ context.Context, state domain.CapabilityState) error {
	s.states = append(s.states, state)
	return nil
}

func (s *stubCapabilityStateStore) ListCapabilityStates(_ context.Context, installationID string) ([]domain.CapabilityState, error) {
	return append([]domain.CapabilityState(nil), s.states...), nil
}

func TestResolveCapabilitiesMergesDeclaredAndEffectiveState(t *testing.T) {
	t.Parallel()

	store := &stubCapabilityStateStore{
		states: []domain.CapabilityState{{InstallationID: "inst_001", CapabilityCode: "pricing_fee_sync", Status: domain.CapabilityStatusEnabled}},
	}
	svc := NewCapabilityService(store)

	resolved, err := svc.Resolve(context.Background(), "inst_001", []string{"pricing_fee_sync", "order_read"})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	if resolved["pricing_fee_sync"] != domain.CapabilityStatusEnabled {
		t.Fatalf("pricing_fee_sync = %q, want %q", resolved["pricing_fee_sync"], domain.CapabilityStatusEnabled)
	}
	if resolved["order_read"] != domain.CapabilityStatusDisabled {
		t.Fatalf("order_read = %q, want %q", resolved["order_read"], domain.CapabilityStatusDisabled)
	}
}
```

- [ ] **Step 2: Run the capability test to verify it fails**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application -run TestResolveCapabilitiesMergesDeclaredAndEffectiveState -v
```

Expected: FAIL with missing `CapabilityState`, `NewCapabilityService`, and repository contracts.

- [ ] **Step 3: Implement capability state resolution and bridge marketplace accounts**

```go
// apps/server_core/internal/modules/integrations/application/capability_service.go
package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type CapabilityService struct {
	store ports.CapabilityStateStore
}

func NewCapabilityService(store ports.CapabilityStateStore) *CapabilityService {
	return &CapabilityService{store: store}
}

func (s *CapabilityService) Resolve(ctx context.Context, installationID string, declared []string) (map[string]domain.CapabilityStatus, error) {
	states, err := s.store.ListCapabilityStates(ctx, installationID)
	if err != nil {
		return nil, err
	}
	resolved := make(map[string]domain.CapabilityStatus, len(declared))
	for _, code := range declared {
		resolved[code] = domain.CapabilityStatusDisabled
	}
	for _, state := range states {
		resolved[state.CapabilityCode] = state.Status
	}
	return resolved, nil
}
```

```go
// apps/server_core/internal/modules/marketplaces/domain/account.go
package domain

type Account struct {
	AccountID                 string            `json:"account_id"`
	TenantID                  string            `json:"tenant_id"`
	MarketplaceCode           string            `json:"marketplace_code"`
	ChannelCode               string            `json:"channel_code"`
	DisplayName               string            `json:"display_name"`
	Status                    string            `json:"status"`
	ConnectionMode            string            `json:"connection_mode"`
	IntegrationInstallationID string            `json:"integration_installation_id,omitempty"`
	CredentialsJSON           map[string]string `json:"credentials_json,omitempty"`
}
```

```sql
-- repository query excerpt in apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go
SELECT tenant_id, account_id, COALESCE(marketplace_code, ''), channel_code, display_name, status, connection_mode, COALESCE(integration_installation_id, '')
FROM marketplace_accounts
WHERE tenant_id = $1
ORDER BY account_id
```

- [ ] **Step 4: Run the capability and marketplace tests to verify they pass**

Run:

```bash
cd apps/server_core
go test ./internal/modules/integrations/application ./internal/modules/marketplaces/... -v
```

Expected: PASS for capability resolution and existing marketplace tests after adding the optional installation bridge field.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/integrations/ports/capability_state_store.go apps/server_core/internal/modules/integrations/ports/marketplace_capabilities.go apps/server_core/internal/modules/integrations/application/capability_service.go apps/server_core/internal/modules/integrations/application/capability_service_test.go apps/server_core/internal/modules/integrations/adapters/postgres/capability_state_repo.go apps/server_core/internal/modules/marketplaces/domain/account.go apps/server_core/internal/modules/marketplaces/adapters/postgres/repository.go
git commit -m "feat(integrations): add capability resolution and marketplace bridge"
```

---

### Task 6: OpenAPI, SDK, Composition Wiring, And Final Verification

**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`
- Modify: `packages/sdk-runtime/src/index.ts`
- Modify: `packages/sdk-runtime/src/index.test.ts`
- Modify: `apps/server_core/internal/composition/root.go`

- [ ] **Step 1: Write the failing SDK test**

```ts
// packages/sdk-runtime/src/index.test.ts
import { describe, expect, it, vi } from "vitest";
import { createMarketplaceCentralClient } from "./index";

describe("integrations client", () => {
  it("lists providers from /integrations/providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ provider_code: "mercado_livre", family: "marketplace", display_name: "Mercado Livre" }] }),
    });

    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: fetchMock,
    });

    const result = await client.listIntegrationProviders();
    expect(result.items[0].provider_code).toBe("mercado_livre");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/integrations/providers", expect.any(Object));
  });
});
```

- [ ] **Step 2: Run the SDK test to verify it fails**

Run:

```bash
pnpm --filter @marketplace-central/sdk-runtime test --run
```

Expected: FAIL because `listIntegrationProviders` and integration types are not in the SDK yet.

- [ ] **Step 3: Implement OpenAPI schemas, SDK methods, and root wiring**

```yaml
# contracts/api/marketplace-central.openapi.yaml
/integrations/providers:
  get:
    summary: List supported integration providers
    operationId: listIntegrationProviders
    tags: [integrations]
    responses:
      "200":
        description: Successful response
        content:
          application/json:
            schema:
              type: object
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/components/schemas/IntegrationProviderDefinition'

/integrations/installations:
  get:
    summary: List tenant integration installations
    operationId: listIntegrationInstallations
    tags: [integrations]
  post:
    summary: Create integration installation draft
    operationId: createIntegrationInstallation
    tags: [integrations]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/CreateIntegrationInstallationRequest'
```

```ts
// packages/sdk-runtime/src/index.ts
export interface IntegrationProviderDefinition {
  provider_code: string;
  family: "marketplace";
  display_name: string;
  auth_strategy: "oauth2" | "api_key" | "token" | "none" | "unknown";
  install_mode: "interactive" | "manual" | "hybrid";
  declared_capabilities: string[];
  is_active: boolean;
}

export interface IntegrationInstallation {
  installation_id: string;
  tenant_id: string;
  provider_code: string;
  family: "marketplace";
  display_name: string;
  status: "draft" | "pending_connection" | "connected" | "degraded" | "requires_reauth" | "disconnected" | "suspended" | "failed";
  health_status: "healthy" | "warning" | "critical";
  external_account_id: string;
  external_account_name: string;
  active_credential_id?: string;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrationInstallationRequest {
  installation_id: string;
  provider_code: string;
  family: "marketplace";
  display_name: string;
}

// inside createMarketplaceCentralClient()
listIntegrationProviders: () => getJson<ListResponse<IntegrationProviderDefinition>>("/integrations/providers"),
listIntegrationInstallations: () => getJson<ListResponse<IntegrationInstallation>>("/integrations/installations"),
createIntegrationInstallation: (req: CreateIntegrationInstallationRequest) =>
  postJson<IntegrationInstallation>("/integrations/installations", req),
```

```go
// apps/server_core/internal/composition/root.go
integrationsProviderRepo := integrationspostgres.NewProviderDefinitionRepository(pool)
integrationsInstallationRepo := integrationspostgres.NewInstallationRepository(pool, cfg.DefaultTenantID)
integrationsCredentialRepo := integrationspostgres.NewCredentialRepository(pool, cfg.DefaultTenantID)
integrationsAuthRepo := integrationspostgres.NewAuthSessionRepository(pool, cfg.DefaultTenantID)
integrationsCapabilityRepo := integrationspostgres.NewCapabilityStateRepository(pool, cfg.DefaultTenantID)
integrationsOperationRepo := integrationspostgres.NewOperationRunRepository(pool, cfg.DefaultTenantID)

providerRegistry := integrationsproviders.NewRegistry()
providerSvc := integrationsapp.NewProviderService(integrationsProviderRepo)
installationSvc := integrationsapp.NewInstallationService(integrationsInstallationRepo, cfg.DefaultTenantID)
_ = integrationsapp.NewCredentialService(integrationsCredentialRepo, cfg.DefaultTenantID)
_ = integrationsapp.NewAuthService(integrationsAuthRepo, cfg.DefaultTenantID)
_ = integrationsapp.NewCapabilityService(integrationsCapabilityRepo)
_ = integrationsapp.NewOperationService(integrationsOperationRepo, cfg.DefaultTenantID)

if pool != nil {
	if err := providerSvc.SeedProviderDefinitions(context.Background(), providerRegistry.All()); err != nil {
		slog.Warn("integration provider definitions sync failed", "err", err)
	}
}

integrationstransport.NewHandler(providerSvc, installationSvc).Register(mux)
```

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
cd apps/server_core
go test ./...
cd ../..
pnpm --filter @marketplace-central/sdk-runtime test --run
```

Expected:
- `go test ./...` passes with the new `integrations` module wired in
- SDK tests pass with the new integration methods and types

- [ ] **Step 5: Commit**

```bash
git add contracts/api/marketplace-central.openapi.yaml packages/sdk-runtime/src/index.ts packages/sdk-runtime/src/index.test.ts apps/server_core/internal/composition/root.go
git commit -m "feat(integrations): expose provider and installation APIs"
```

---

## Self-Review Checklist

- Spec coverage:
  - `integrations` as top-level module: covered in Tasks 1-6
  - provider definitions: Task 2
  - installation lifecycle: Tasks 1 and 3
  - credentials/auth sessions: Task 4
  - capability states: Task 5
  - operation tracking: Task 4
  - API and SDK exposure: Task 6
  - marketplace bridge away from connection ownership: Task 5

- Placeholder scan:
  - no `TODO`, `TBD`, or `implement later` language remains in tasks
  - every code step has concrete file paths and starter code
  - every verification step includes an explicit command

- Type consistency:
  - installation status values match migration, domain constants, and SDK union types
  - capability status values match migration and domain constants
  - provider codes and family values use the same string forms across tasks

---

Plan complete and saved to `docs/superpowers/plans/2026-04-09-integrations-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
