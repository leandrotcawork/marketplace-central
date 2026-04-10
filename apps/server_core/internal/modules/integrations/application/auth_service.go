package application

import (
	"context"
	"errors"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type UpsertAuthSessionInput struct {
	AuthSessionID       string
	InstallationID      string
	ProviderAccountID   string
	State               domain.AuthState
	AccessTokenExpiresAt *time.Time
	LastVerifiedAt      *time.Time
	RefreshFailureCode  string
	ConsecutiveFailures int
	NextRetryAt         *time.Time
}

type AuthService struct {
	store    ports.AuthSessionStore
	tenantID string
}

func NewAuthService(store ports.AuthSessionStore, tenantID string) *AuthService {
	return &AuthService{store: store, tenantID: tenantID}
}

func (s *AuthService) Upsert(ctx context.Context, input UpsertAuthSessionInput) (domain.AuthSession, error) {
	if input.AuthSessionID == "" || input.InstallationID == "" || input.ProviderAccountID == "" {
		return domain.AuthSession{}, errors.New("INTEGRATIONS_AUTH_INVALID")
	}
	if input.ConsecutiveFailures < 0 {
		return domain.AuthSession{}, errors.New("INTEGRATIONS_AUTH_INVALID")
	}

	state := input.State
	if state == "" {
		state = domain.AuthStateValid
	}
	if !isValidAuthState(state) {
		return domain.AuthSession{}, errors.New("INTEGRATIONS_AUTH_INVALID")
	}

	now := time.Now().UTC()
	session := domain.AuthSession{
		AuthSessionID:       input.AuthSessionID,
		TenantID:            s.tenantID,
		InstallationID:      input.InstallationID,
		State:               state,
		ProviderAccountID:   input.ProviderAccountID,
		AccessTokenExpiresAt: cloneTimePtr(input.AccessTokenExpiresAt),
		LastVerifiedAt:      cloneTimePtr(input.LastVerifiedAt),
		RefreshFailureCode:  input.RefreshFailureCode,
		ConsecutiveFailures: input.ConsecutiveFailures,
		NextRetryAt:         cloneTimePtr(input.NextRetryAt),
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	if session.RefreshFailureCode == "" {
		session.RefreshFailureCode = ""
	}

	return session, s.store.UpsertAuthSession(ctx, session)
}

func isValidAuthState(state domain.AuthState) bool {
	switch state {
	case domain.AuthStateValid,
		domain.AuthStateExpiring,
		domain.AuthStateInvalid,
		domain.AuthStateRefreshFailed:
		return true
	default:
		return false
	}
}

func cloneTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}

	cloned := value.UTC()
	return &cloned
}
