package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type securityStateCodec struct {
	payloadsByState map[string]OAuthStatePayload
	payload         OAuthStatePayload
	encodedState    string
	err             error
}

func (c securityStateCodec) EncodeAndSign(payload OAuthStatePayload) (string, error) {
	if c.err != nil {
		return "", c.err
	}
	if c.encodedState != "" {
		return c.encodedState, nil
	}
	return "signed_state", nil
}

func (c securityStateCodec) DecodeAndVerify(state string) (OAuthStatePayload, error) {
	if c.err != nil {
		return OAuthStatePayload{}, c.err
	}
	if c.payloadsByState != nil {
		payload, ok := c.payloadsByState[state]
		if !ok {
			return OAuthStatePayload{}, errors.New("state not signed")
		}
		return payload, nil
	}
	return c.payload, nil
}

type securityOAuthStateStore struct {
	state           domain.OAuthState
	statesByNonce   map[string]domain.OAuthState
	savedStates     []domain.OAuthState
	found           bool
	consumeResult   bool
	getNonces       []string
	consumeIDs      []string
	consumedByState map[string]bool
}

func (s *securityOAuthStateStore) Save(ctx context.Context, state domain.OAuthState) error {
	s.savedStates = append(s.savedStates, state)
	if s.statesByNonce == nil {
		s.statesByNonce = map[string]domain.OAuthState{}
	}
	s.statesByNonce[state.Nonce] = state
	return nil
}

func (s *securityOAuthStateStore) GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error) {
	s.getNonces = append(s.getNonces, nonce)
	if s.statesByNonce != nil {
		state, ok := s.statesByNonce[nonce]
		return state, ok, nil
	}
	return s.state, s.found, nil
}

func (s *securityOAuthStateStore) ConsumeNonce(ctx context.Context, id string) (bool, error) {
	s.consumeIDs = append(s.consumeIDs, id)
	if s.consumedByState != nil {
		if s.consumedByState[id] {
			return false, nil
		}
		s.consumedByState[id] = true
		return true, nil
	}
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
			TenantID:       "tenant_default",
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			HMACSignature:  "signed_state",
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
			TenantID:       "tenant_default",
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			HMACSignature:  "signed_state",
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

func TestStartAuthorizeHandleCallbackAcceptsPersistedSignedState(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {
			InstallationID: "inst-ml",
			ProviderCode:   "mercado_livre",
			Status:         domain.InstallationStatusDraft,
			HealthStatus:   domain.HealthStatusHealthy,
		},
	}}
	oauthStates := &securityOAuthStateStore{consumedByState: map[string]bool{}}
	codec := roundTripSecurityStateCodec{payloadsByState: map[string]OAuthStatePayload{}}
	authSessions := &flowAuthWriter{}
	adapter := &flowAdapter{
		providerCode: "mercado_livre",
		callback: CredentialPayload{
			SecretType:        "oauth2",
			AccessToken:       "access",
			RefreshToken:      "refresh",
			ProviderAccountID: "seller-1",
		},
	}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
		Installations:   installations,
		Credentials:     &flowCredentialRotator{},
		AuthSessions:    authSessions,
		OAuthStates:     oauthStates,
		OAuthStateCodec: codec,
		Encryptor:       &flowEncryptor{},
		Clock:           fixedAuthFlowClock{now: now},
		Adapters:        []MarketplaceAuthAdapter{adapter},
	})

	start, err := svc.StartAuthorize(context.Background(), StartAuthorizeInput{
		InstallationID: "inst-ml",
		RedirectURI:    "https://app.test/callback",
		Scopes:         []string{"read"},
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}
	if len(oauthStates.savedStates) != 1 {
		t.Fatalf("saved OAuth states = %d, want 1", len(oauthStates.savedStates))
	}
	saved := oauthStates.savedStates[0]
	if saved.Nonce == "" || saved.CodeVerifier == "" || saved.HMACSignature == "" {
		t.Fatalf("saved OAuth state = %#v, want nonce, code verifier, and signature", saved)
	}
	if saved.TenantID != "tenant_default" {
		t.Fatalf("saved OAuth state tenant = %q, want tenant_default", saved.TenantID)
	}
	if adapter.startInput.State != start.State {
		t.Fatalf("adapter state = %q, want returned state %q", adapter.startInput.State, start.State)
	}

	status, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		Code:        "code-1",
		State:       start.State,
		RedirectURI: "https://app.test/callback",
	})
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if status.InstallationID != "inst-ml" || status.Status != domain.InstallationStatusConnected {
		t.Fatalf("status = %#v, want connected inst-ml", status)
	}
	if len(authSessions.inputs) != 1 || authSessions.inputs[0].LastVerifiedAt == nil || !authSessions.inputs[0].LastVerifiedAt.Equal(now) {
		t.Fatalf("auth session inputs = %#v, want LastVerifiedAt from clock", authSessions.inputs)
	}
}

func TestHandleCallbackRejectsSignedStateStringThatDoesNotMatchPersistedState(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	store := &securityOAuthStateStore{
		state: domain.OAuthState{
			TenantID:       "tenant_default",
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			CodeVerifier:   "verifier-1",
			HMACSignature:  "signed_state_original",
			ExpiresAt:      now.Add(time.Minute),
		},
		found:         true,
		consumeResult: true,
	}
	svc := newAuthFlowServiceForSecurityTest(t, securityStateCodec{
		payloadsByState: map[string]OAuthStatePayload{
			"signed_state_tampered": {
				TenantID:       "tenant_default",
				Nonce:          "nonce-1",
				InstallationID: "inst-ml",
			},
		},
	}, store, fixedAuthFlowClock{now: now})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		InstallationID: "inst-ml",
		Code:           "code-1",
		State:          "signed_state_tampered",
	})

	if !errors.Is(err, domain.ErrAuthStateInvalid) {
		t.Fatalf("expected ErrAuthStateInvalid, got %v", err)
	}
	if len(store.consumeIDs) != 0 {
		t.Fatalf("consumed state IDs = %#v, want none for state string mismatch", store.consumeIDs)
	}
}

func TestHandleCallbackRejectsTenantMismatchInSignedPayload(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	store := &securityOAuthStateStore{
		state: domain.OAuthState{
			TenantID:       "tenant_default",
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			CodeVerifier:   "verifier-1",
			HMACSignature:  "signed_state",
			ExpiresAt:      now.Add(time.Minute),
		},
		found:         true,
		consumeResult: true,
	}
	svc := newAuthFlowServiceForSecurityTest(t, securityStateCodec{
		payload: OAuthStatePayload{
			TenantID:       "tenant_other",
			Nonce:          "nonce-1",
			InstallationID: "inst-ml",
		},
	}, store, fixedAuthFlowClock{now: now})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		InstallationID: "inst-ml",
		Code:           "code-1",
		State:          "signed_state",
	})

	if !errors.Is(err, domain.ErrAuthStateInvalid) {
		t.Fatalf("expected ErrAuthStateInvalid, got %v", err)
	}
	if len(store.consumeIDs) != 0 {
		t.Fatalf("consumed state IDs = %#v, want none for tenant mismatch", store.consumeIDs)
	}
}

func TestHandleCallbackRejectsReplayRaceWhenConsumeNonceReturnsFalse(t *testing.T) {
	t.Parallel()

	now := time.Unix(1000, 0).UTC()
	store := &securityOAuthStateStore{
		state: domain.OAuthState{
			TenantID:       "tenant_default",
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			CodeVerifier:   "verifier-1",
			HMACSignature:  "signed_state",
			ExpiresAt:      now.Add(time.Minute),
		},
		found:         true,
		consumeResult: false,
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

func newAuthFlowServiceForSecurityTest(t *testing.T, codec securityStateCodec, store *securityOAuthStateStore, clock fixedAuthFlowClock) *AuthFlowService {
	t.Helper()

	return mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
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
			TenantID:       "tenant_default",
			Nonce:          "nonce-1",
			InstallationID: "inst-ml",
		},
	}
}

type roundTripSecurityStateCodec struct {
	payloadsByState map[string]OAuthStatePayload
}

func (c roundTripSecurityStateCodec) EncodeAndSign(payload OAuthStatePayload) (string, error) {
	state := "signed_" + payload.Nonce
	c.payloadsByState[state] = payload
	return state, nil
}

func (c roundTripSecurityStateCodec) DecodeAndVerify(state string) (OAuthStatePayload, error) {
	payload, ok := c.payloadsByState[state]
	if !ok {
		return OAuthStatePayload{}, errors.New("state not signed")
	}
	return payload, nil
}
