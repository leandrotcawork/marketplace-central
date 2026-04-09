package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubProviderReader struct {
	items []domain.ProviderDefinition
	err   error
}

func (s stubProviderReader) ListProviderDefinitions(context.Context) ([]domain.ProviderDefinition, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]domain.ProviderDefinition(nil), s.items...), nil
}

type stubInstallationReader struct {
	listItems []domain.Installation
	listErr   error

	createDraftInput  application.CreateInstallationInput
	createDraftResult domain.Installation
	createDraftErr    error
}

func (s *stubInstallationReader) List(context.Context) ([]domain.Installation, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return append([]domain.Installation(nil), s.listItems...), nil
}

func (s *stubInstallationReader) Get(context.Context, string) (domain.Installation, bool, error) {
	return domain.Installation{}, false, nil
}

func (s *stubInstallationReader) CreateDraft(_ context.Context, input application.CreateInstallationInput) (domain.Installation, error) {
	s.createDraftInput = input
	return s.createDraftResult, s.createDraftErr
}

func TestHandleProvidersRejectsWrongMethod(t *testing.T) {
	t.Parallel()

	h := NewHandler(stubProviderReader{}, &stubInstallationReader{})

	req := httptest.NewRequest(http.MethodPost, "/integrations/providers", nil)
	rr := httptest.NewRecorder()

	h.handleProviders(rr, req)

	if got, want := rr.Code, http.StatusMethodNotAllowed; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
	if got, want := rr.Header().Get("Allow"), "GET"; got != want {
		t.Fatalf("Allow header = %q, want %q", got, want)
	}

	var payload apiErrorResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if got, want := payload.Error.Code, "INTEGRATIONS_PROVIDER_METHOD_NOT_ALLOWED"; got != want {
		t.Fatalf("error code = %q, want %q", got, want)
	}
	if got, want := payload.Error.Message, "method not allowed"; got != want {
		t.Fatalf("error message = %q, want %q", got, want)
	}
	if payload.Error.Details == nil {
		t.Fatalf("error details should be present")
	}
}

func TestHandleInstallationsCreatesDraft(t *testing.T) {
	t.Parallel()

	reader := &stubInstallationReader{
		createDraftResult: domain.Installation{
			InstallationID:      "inst_001",
			TenantID:            "tenant_001",
			ProviderCode:        "mercado_livre",
			Family:              domain.IntegrationFamilyMarketplace,
			DisplayName:         "Mercado Livre BR",
			Status:              domain.InstallationStatusDraft,
			HealthStatus:        domain.HealthStatusHealthy,
			ExternalAccountID:   "",
			ExternalAccountName: "",
		},
	}
	h := NewHandler(stubProviderReader{}, reader)

	body := []byte(`{"installation_id":"inst_001","provider_code":"mercado_livre","family":"marketplace","display_name":"Mercado Livre BR"}`)
	req := httptest.NewRequest(http.MethodPost, "/integrations/installations", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	h.handleInstallations(rr, req)

	if got, want := rr.Code, http.StatusCreated; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}

	if got, want := reader.createDraftInput, (application.CreateInstallationInput{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		Family:         "marketplace",
		DisplayName:    "Mercado Livre BR",
	}); !reflect.DeepEqual(got, want) {
		t.Fatalf("CreateDraft input = %#v, want %#v", got, want)
	}

	var got domain.Installation
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode installation response: %v", err)
	}
	if got.InstallationID != "inst_001" {
		t.Fatalf("installation_id = %q, want %q", got.InstallationID, "inst_001")
	}
	if got.ProviderCode != "mercado_livre" {
		t.Fatalf("provider_code = %q, want %q", got.ProviderCode, "mercado_livre")
	}
	if got.DisplayName != "Mercado Livre BR" {
		t.Fatalf("display_name = %q, want %q", got.DisplayName, "Mercado Livre BR")
	}
}
