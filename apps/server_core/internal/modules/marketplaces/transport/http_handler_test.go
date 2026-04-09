package transport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/transport"
)

// stubFeeScheduleRepo is a minimal in-memory implementation of ports.FeeScheduleRepository.
type stubFeeScheduleRepo struct {
	defs []domain.MarketplaceDefinition
}

func (s *stubFeeScheduleRepo) UpsertSchedules(_ context.Context, _ []domain.FeeSchedule) error {
	return nil
}

func (s *stubFeeScheduleRepo) LookupFee(_ context.Context, _, _, _ string) (domain.FeeSchedule, bool, error) {
	return domain.FeeSchedule{}, false, nil
}

func (s *stubFeeScheduleRepo) ListByMarketplace(_ context.Context, _ string) ([]domain.FeeSchedule, error) {
	return nil, nil
}

func (s *stubFeeScheduleRepo) UpsertDefinitions(_ context.Context, _ []domain.MarketplaceDefinition) error {
	return nil
}

func (s *stubFeeScheduleRepo) ListDefinitions(_ context.Context) ([]domain.MarketplaceDefinition, error) {
	return s.defs, nil
}

func (s *stubFeeScheduleRepo) HasSchedules(_ context.Context, _ string) (bool, error) {
	return false, nil
}

// compile-time interface check
var _ ports.FeeScheduleRepository = (*stubFeeScheduleRepo)(nil)

// stubFeeSyncSvc satisfies the transport.FeeSeedTrigger interface.
type stubFeeSyncSvc struct{}

func (s *stubFeeSyncSvc) SeedMarketplace(_ context.Context, _ string, _ bool) (int, error) {
	return 0, nil
}

// newTestHandler wires together a Handler backed by stub implementations.
// application.Service is zero-value since the definitions endpoint only uses feeSvc.
func newTestHandler(defs []domain.MarketplaceDefinition) transport.Handler {
	repo := &stubFeeScheduleRepo{defs: defs}
	feeSvc := application.NewFeeScheduleService(repo)
	// application.Service is a concrete struct; zero-value is safe for endpoints
	// that only touch feeSvc (like /marketplaces/definitions).
	return transport.NewHandler(application.Service{}, feeSvc, &stubFeeSyncSvc{})
}

func TestDefinitionsHandler_MethodNotAllowed(t *testing.T) {
	h := newTestHandler(nil)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/marketplaces/definitions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /marketplaces/definitions: got status %d, want 405", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != "GET" {
		t.Errorf("Allow header = %q, want %q", allow, "GET")
	}
}

func TestDefinitionsHandler_GetReturnsItems(t *testing.T) {
	defs := []domain.MarketplaceDefinition{
		{
			MarketplaceCode: "test_market",
			DisplayName:     "Test Market",
			AuthStrategy:    "api_key",
			FeeSource:       "seed",
			CapabilityProfile: domain.CapabilityProfile{
				Publish:   domain.CapabilitySupported,
				PriceSync: domain.CapabilityPlanned,
			},
			Metadata: domain.PluginMetadata{
				RolloutStage:  "v1",
				ExecutionMode: "live",
			},
			Active: true,
		},
	}

	h := newTestHandler(defs)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/marketplaces/definitions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /marketplaces/definitions: got status %d, want 200", rec.Code)
	}

	var body struct {
		Items []struct {
			Code              string                   `json:"code"`
			DisplayName       string                   `json:"display_name"`
			AuthStrategy      string                   `json:"auth_strategy"`
			IsActive          bool                     `json:"is_active"`
			CapabilityProfile domain.CapabilityProfile `json:"capability_profile"`
			Metadata          domain.PluginMetadata    `json:"metadata"`
		} `json:"items"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(body.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(body.Items))
	}
	item := body.Items[0]

	if item.Code != "test_market" {
		t.Errorf("code = %q, want %q", item.Code, "test_market")
	}

	// is_active must reflect the canonical value
	if !item.IsActive {
		t.Errorf("is_active = false, want true")
	}

	// fee_source and credential_schema must be hidden from the public response
	var rawBody struct {
		Items []map[string]any `json:"items"`
	}
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/marketplaces/definitions", nil)
	mux.ServeHTTP(rec2, req2)
	if err := json.NewDecoder(rec2.Body).Decode(&rawBody); err != nil {
		t.Fatalf("failed to decode raw response: %v", err)
	}
	if len(rawBody.Items) > 0 {
		rawItem := rawBody.Items[0]
		if _, ok := rawItem["fee_source"]; ok {
			t.Errorf("response contains fee_source — must be hidden")
		}
		if _, ok := rawItem["credential_schema"]; ok {
			t.Errorf("response contains credential_schema — must be hidden")
		}
	}

	// capability_profile must be present
	if item.CapabilityProfile.Publish != domain.CapabilitySupported {
		t.Errorf("capability_profile.publish = %q, want %q", item.CapabilityProfile.Publish, domain.CapabilitySupported)
	}

	// metadata must be present
	if item.Metadata.RolloutStage != "v1" {
		t.Errorf("metadata.rollout_stage = %q, want %q", item.Metadata.RolloutStage, "v1")
	}
	if item.Metadata.ExecutionMode != "live" {
		t.Errorf("metadata.execution_mode = %q, want %q", item.Metadata.ExecutionMode, "live")
	}
}
