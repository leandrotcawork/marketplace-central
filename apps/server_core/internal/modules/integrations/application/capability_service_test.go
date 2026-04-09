package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type stubCapabilityStateStore struct {
	states []domain.CapabilityState
}

func (s *stubCapabilityStateStore) UpsertCapabilityStates(_ context.Context, states []domain.CapabilityState) error {
	s.states = append([]domain.CapabilityState(nil), states...)
	return nil
}

func (s *stubCapabilityStateStore) ListCapabilityStates(_ context.Context, installationID string) ([]domain.CapabilityState, error) {
	return append([]domain.CapabilityState(nil), s.states...), nil
}

var _ ports.CapabilityStateStore = (*stubCapabilityStateStore)(nil)

func TestResolveCapabilitiesMergesDeclaredAndEffectiveState(t *testing.T) {
	t.Parallel()

	now := time.Unix(200, 0).UTC()
	store := &stubCapabilityStateStore{
		states: []domain.CapabilityState{
			{
				CapabilityStateID: "cap_orders",
				TenantID:          "tenant-default",
				InstallationID:    "inst_001",
				CapabilityCode:    "orders",
				Status:            domain.CapabilityStatusEnabled,
				ReasonCode:        "CONNECTED",
				LastEvaluatedAt:   &now,
				CreatedAt:         now,
				UpdatedAt:         now,
			},
			{
				CapabilityStateID: "cap_unrelated",
				TenantID:          "tenant-default",
				InstallationID:    "inst_001",
				CapabilityCode:    "beta_feature",
				Status:            domain.CapabilityStatusEnabled,
				ReasonCode:        "LEGACY",
				LastEvaluatedAt:   &now,
				CreatedAt:         now,
				UpdatedAt:         now,
			},
		},
	}

	svc := NewCapabilityService(store, "tenant-default")

	resolved, err := svc.Resolve(context.Background(), "inst_001", ports.MarketplaceCapabilities{"publish", "orders"})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	want := []domain.CapabilityState{
		{
			TenantID:         "tenant-default",
			InstallationID:   "inst_001",
			CapabilityCode:   "publish",
			Status:           domain.CapabilityStatusDisabled,
			ReasonCode:       "",
			LastEvaluatedAt:  nil,
			CreatedAt:        time.Time{},
			UpdatedAt:        time.Time{},
		},
		{
			CapabilityStateID: "cap_orders",
			TenantID:          "tenant-default",
			InstallationID:    "inst_001",
			CapabilityCode:    "orders",
			Status:            domain.CapabilityStatusEnabled,
			ReasonCode:        "CONNECTED",
			LastEvaluatedAt:   &now,
			CreatedAt:         now,
			UpdatedAt:         now,
		},
	}

	if got, want := resolved, want; !reflect.DeepEqual(got, want) {
		t.Fatalf("Resolve() = %#v, want %#v", got, want)
	}
}

func TestResolveCapabilitiesRejectsEmptyInstallationID(t *testing.T) {
	t.Parallel()

	svc := NewCapabilityService(&stubCapabilityStateStore{}, "tenant-default")

	_, err := svc.Resolve(context.Background(), " ", ports.MarketplaceCapabilities{"publish"})
	if err == nil {
		t.Fatal("Resolve() error = nil, want invalid input error")
	}
	if got, want := err.Error(), capabilityInvalidErrorCode; got != want {
		t.Fatalf("Resolve() error = %q, want %q", got, want)
	}
}
