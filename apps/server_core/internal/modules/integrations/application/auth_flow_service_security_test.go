package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type securityStateCodec struct {
	payload OAuthStatePayload
	err     error
}

func (c securityStateCodec) DecodeAndVerify(state string) (OAuthStatePayload, error) {
	if c.err != nil {
		return OAuthStatePayload{}, c.err
	}
	return c.payload, nil
}

type securityOAuthStateStore struct {
	state         domain.OAuthState
	found         bool
	consumeResult bool
	getNonces     []string
	consumeIDs    []string
}

func (s *securityOAuthStateStore) GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error) {
	s.getNonces = append(s.getNonces, nonce)
	return s.state, s.found, nil
}

func (s *securityOAuthStateStore) ConsumeNonce(ctx context.Context, id string) (bool, error) {
	s.consumeIDs = append(s.consumeIDs, id)
	return s.consumeResult, nil
}

type fixedAuthFlowClock struct {
	now time.Time
}

func (c fixedAuthFlowClock) Now() time.Time {
	return c.now
}

func TestHandleCallbackRejectsInvalidStateSignature(t *testing.T) {
	t.Parallel()

	svc := newAuthFlowServiceForSecurityTest(t, securityStateCodec{err: errors.New("bad signature")}, nil, fixedAuthFlowClock{now: time.Unix(1000, 0).UTC()})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		Code:  "code-1",
		State: "tampered_state",
	})

	if !errors.Is(err, domain.ErrAuthStateInvalid) {
		t.Fatalf("expected ErrAuthStateInvalid, got %v", err)
	}
}

func TestHandleCallbackRejectsConsumedNonce(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	consumedAt := now.Add(-time.Minute)
	store := &securityOAuthStateStore{
		state: domain.OAuthState{
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			ExpiresAt:      now.Add(time.Minute),
			ConsumedAt:     &consumedAt,
		},
		found: true,
	}
	svc := newAuthFlowServiceForSecurityTest(t, validSecurityStateCodec(), store, fixedAuthFlowClock{now: now})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		Code:  "code-1",
		State: "signed_state",
	})

	if !errors.Is(err, domain.ErrAuthStateConsumed) {
		t.Fatalf("expected ErrAuthStateConsumed, got %v", err)
	}
}

func TestHandleCallbackRejectsExpiredNonce(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	store := &securityOAuthStateStore{
		state: domain.OAuthState{
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			ExpiresAt:      now.Add(-time.Minute),
		},
		found: true,
	}
	svc := newAuthFlowServiceForSecurityTest(t, validSecurityStateCodec(), store, fixedAuthFlowClock{now: now})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		Code:  "code-1",
		State: "signed_state",
	})

	if !errors.Is(err, domain.ErrAuthStateExpired) {
		t.Fatalf("expected ErrAuthStateExpired, got %v", err)
	}
}

func newAuthFlowServiceForSecurityTest(t *testing.T, codec securityStateCodec, store *securityOAuthStateStore, clock fixedAuthFlowClock) *AuthFlowService {
	t.Helper()

	return NewAuthFlowService(AuthFlowConfig{
		OAuthStateCodec: codec,
		OAuthStates:     store,
		Clock:           clock,
		Installations:   &flowInstallationStore{installations: map[string]domain.Installation{}},
		Credentials:     &flowCredentialRotator{},
		AuthSessions:    &flowAuthWriter{},
		Encryptor:       &flowEncryptor{},
		Adapters:        []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})
}

func validSecurityStateCodec() securityStateCodec {
	return securityStateCodec{
		payload: OAuthStatePayload{
			Nonce:          "nonce-1",
			InstallationID: "inst-ml",
		},
	}
}
