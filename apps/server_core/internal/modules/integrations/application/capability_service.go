package application

import (
	"context"
	"errors"
	"strings"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

const capabilityInvalidErrorCode = "INTEGRATIONS_CAPABILITY_INVALID"

type CapabilityService struct {
	store    ports.CapabilityStateStore
	tenantID string
}

func NewCapabilityService(store ports.CapabilityStateStore, tenantID string) *CapabilityService {
	return &CapabilityService{store: store, tenantID: tenantID}
}

func (s *CapabilityService) Upsert(ctx context.Context, states []domain.CapabilityState) error {
	for i := range states {
		states[i].TenantID = s.tenantID
	}

	return s.store.UpsertCapabilityStates(ctx, states)
}

func (s *CapabilityService) Resolve(ctx context.Context, installationID string, declared ports.MarketplaceCapabilities) ([]domain.CapabilityState, error) {
	installationID = strings.TrimSpace(installationID)
	if installationID == "" {
		return nil, errors.New(capabilityInvalidErrorCode)
	}

	persisted, err := s.store.ListCapabilityStates(ctx, installationID)
	if err != nil {
		return nil, err
	}

	resolved := make([]domain.CapabilityState, 0, len(declared))
	persistedByCode := make(map[string]domain.CapabilityState, len(persisted))
	for _, state := range persisted {
		code := strings.TrimSpace(state.CapabilityCode)
		if code == "" {
			continue
		}
		persistedByCode[code] = state
	}

	seen := make(map[string]struct{}, len(declared))
	for _, code := range declared {
		code = strings.TrimSpace(code)
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}

		state := domain.CapabilityState{
			TenantID:        s.tenantID,
			InstallationID:  installationID,
			CapabilityCode:  code,
			Status:          domain.CapabilityStatusDisabled,
			ReasonCode:      "",
			LastEvaluatedAt: nil,
		}

		if persistedState, ok := persistedByCode[code]; ok {
			state.CapabilityStateID = persistedState.CapabilityStateID
			state.Status = persistedState.Status
			state.ReasonCode = persistedState.ReasonCode
			state.LastEvaluatedAt = persistedState.LastEvaluatedAt
			state.CreatedAt = persistedState.CreatedAt
			state.UpdatedAt = persistedState.UpdatedAt
		}

		resolved = append(resolved, state)
	}

	return resolved, nil
}
