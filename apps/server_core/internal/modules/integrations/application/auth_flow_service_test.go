package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type flowInstallationStore struct {
	installations map[string]domain.Installation
	statuses      []domain.InstallationStatus
	healths       []domain.HealthStatus
}

func (s *flowInstallationStore) Get(ctx context.Context, installationID string) (domain.Installation, bool, error) {
	inst, ok := s.installations[installationID]
	return inst, ok, nil
}

func (s *flowInstallationStore) List(ctx context.Context) ([]domain.Installation, error) {
	items := make([]domain.Installation, 0, len(s.installations))
	for _, inst := range s.installations {
		items = append(items, inst)
	}
	return items, nil
}

func (s *flowInstallationStore) UpdateStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	inst := s.installations[installationID]
	inst.Status = status
	inst.HealthStatus = health
	s.installations[installationID] = inst
	s.statuses = append(s.statuses, status)
	s.healths = append(s.healths, health)
	return nil
}

type flowCredentialRotator struct {
	inputs []RotateCredentialInput
}

func (s *flowCredentialRotator) Rotate(ctx context.Context, input RotateCredentialInput) (domain.Credential, error) {
	s.inputs = append(s.inputs, input)
	return domain.Credential{
		CredentialID:     input.CredentialID,
		InstallationID:   input.InstallationID,
		SecretType:       input.SecretType,
		EncryptedPayload: append([]byte(nil), input.EncryptedPayload...),
		EncryptionKeyID:  input.EncryptionKeyID,
		IsActive:         true,
	}, nil
}

type flowAuthWriter struct {
	inputs []UpsertAuthSessionInput
}

func (s *flowAuthWriter) Upsert(ctx context.Context, input UpsertAuthSessionInput) (domain.AuthSession, error) {
	s.inputs = append(s.inputs, input)
	return domain.AuthSession{
		AuthSessionID:        input.AuthSessionID,
		InstallationID:       input.InstallationID,
		ProviderAccountID:    input.ProviderAccountID,
		State:                input.State,
		AccessTokenExpiresAt: input.AccessTokenExpiresAt,
		LastVerifiedAt:       input.LastVerifiedAt,
		RefreshFailureCode:   input.RefreshFailureCode,
		ConsecutiveFailures:  input.ConsecutiveFailures,
	}, nil
}

type flowEncryptor struct {
	payloads []map[string]any
}

func (s *flowEncryptor) EncryptJSON(payload map[string]any) ([]byte, string, error) {
	s.payloads = append(s.payloads, payload)
	return []byte("ciphertext"), "key-1", nil
}

type flowAdapter struct {
	providerCode string
	startInput   StartAuthorizeAdapterInput
	callback     CredentialPayload
	apiKey       CredentialPayload
	refresh      CredentialPayload
}

func (s *flowAdapter) ProviderCode() string { return s.providerCode }

func (s *flowAdapter) StartAuthorize(ctx context.Context, input StartAuthorizeAdapterInput) (AuthorizeStart, error) {
	s.startInput = input
	return AuthorizeStart{AuthURL: "https://provider.test/authorize?state=" + input.State}, nil
}

func (s *flowAdapter) ExchangeCallback(ctx context.Context, input HandleCallbackAdapterInput) (CredentialPayload, error) {
	return s.callback, nil
}

func (s *flowAdapter) VerifyAPIKey(ctx context.Context, input SubmitAPIKeyAdapterInput) (CredentialPayload, error) {
	return s.apiKey, nil
}

func (s *flowAdapter) Refresh(ctx context.Context, input RefreshCredentialAdapterInput) (CredentialPayload, error) {
	return s.refresh, nil
}

func TestAuthFlowStartAuthorizeMarksInstallationPending(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {InstallationID: "inst-ml", ProviderCode: "mercado_livre", Status: domain.InstallationStatusDraft, HealthStatus: domain.HealthStatusHealthy},
	}}
	adapter := &flowAdapter{providerCode: "mercado_livre"}
	oauthStates := &securityOAuthStateStore{}
	codec := roundTripSecurityStateCodec{payloadsByState: map[string]OAuthStatePayload{}}
	svc := NewAuthFlowService(AuthFlowConfig{
		Installations:   installations,
		Credentials:     &flowCredentialRotator{},
		AuthSessions:    &flowAuthWriter{},
		OAuthStates:     oauthStates,
		OAuthStateCodec: codec,
		Encryptor:       &flowEncryptor{},
		Clock:           fixedAuthFlowClock{now: time.Unix(1000, 0).UTC()},
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
	if start.InstallationID != "inst-ml" || start.ProviderCode != "mercado_livre" || start.State == "" {
		t.Fatalf("start = %#v, want installation, provider, and generated state", start)
	}
	if adapter.startInput.State != start.State {
		t.Fatalf("adapter state = %q, want %q", adapter.startInput.State, start.State)
	}
	if len(oauthStates.savedStates) != 1 {
		t.Fatalf("saved OAuth states = %d, want 1", len(oauthStates.savedStates))
	}
	if got, want := installations.statuses, []domain.InstallationStatus{domain.InstallationStatusPendingConnection}; !reflect.DeepEqual(got, want) {
		t.Fatalf("statuses = %#v, want %#v", got, want)
	}
}

func TestAuthFlowHandleCallbackRotatesCredentialAndMarksConnected(t *testing.T) {
	t.Parallel()

	now := time.Unix(1500, 0).UTC()
	expiresAt := time.Unix(2000, 0).UTC()
	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {InstallationID: "inst-ml", ProviderCode: "mercado_livre", Status: domain.InstallationStatusPendingConnection, HealthStatus: domain.HealthStatusHealthy},
	}}
	credentials := &flowCredentialRotator{}
	authSessions := &flowAuthWriter{}
	encryptor := &flowEncryptor{}
	adapter := &flowAdapter{
		providerCode: "mercado_livre",
		callback: CredentialPayload{
			SecretType:          "oauth2",
			AccessToken:         "access",
			RefreshToken:        "refresh",
			ProviderAccountID:   "seller-1",
			ProviderAccountName: "Seller One",
			ExpiresAt:           &expiresAt,
		},
	}
	oauthStates := &securityOAuthStateStore{
		state: domain.OAuthState{
			ID:             "oauth-state-1",
			InstallationID: "inst-ml",
			Nonce:          "nonce-1",
			ExpiresAt:      now.Add(time.Minute),
		},
		found:         true,
		consumeResult: true,
	}
	svc := NewAuthFlowService(AuthFlowConfig{
		Installations:   installations,
		Credentials:     credentials,
		AuthSessions:    authSessions,
		OAuthStates:     oauthStates,
		OAuthStateCodec: validSecurityStateCodec(),
		Encryptor:       encryptor,
		Clock:           fixedAuthFlowClock{now: now},
		Adapters:        []MarketplaceAuthAdapter{adapter},
	})

	result, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		InstallationID: "inst-ml",
		State:          "signed_state",
		Code:           "code-1",
		RedirectURI:    "https://app.test/callback",
	})
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if result.Status != domain.InstallationStatusConnected {
		t.Fatalf("status = %q, want connected", result.Status)
	}
	if len(credentials.inputs) != 1 || credentials.inputs[0].EncryptedPayload == nil || credentials.inputs[0].SecretType != "oauth2" {
		t.Fatalf("credential rotation inputs = %#v, want encrypted oauth2 credential", credentials.inputs)
	}
	if len(authSessions.inputs) != 1 || authSessions.inputs[0].ProviderAccountID != "seller-1" || authSessions.inputs[0].State != domain.AuthStateValid {
		t.Fatalf("auth session inputs = %#v, want valid seller session", authSessions.inputs)
	}
	if len(oauthStates.consumeIDs) != 1 || oauthStates.consumeIDs[0] != "oauth-state-1" {
		t.Fatalf("consumed oauth state IDs = %#v, want oauth-state-1", oauthStates.consumeIDs)
	}
	if len(encryptor.payloads) != 1 || encryptor.payloads[0]["access_token"] != "access" || encryptor.payloads[0]["refresh_token"] != "refresh" {
		t.Fatalf("encrypted payloads = %#v, want token payload", encryptor.payloads)
	}
}

func TestAuthFlowSubmitAPIKeyConnectsManualInstallation(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-shopee": {InstallationID: "inst-shopee", ProviderCode: "shopee", Status: domain.InstallationStatusDraft, HealthStatus: domain.HealthStatusHealthy},
	}}
	credentials := &flowCredentialRotator{}
	adapter := &flowAdapter{
		providerCode: "shopee",
		apiKey: CredentialPayload{
			SecretType:          "api_key",
			APIKey:              "api-key",
			ProviderAccountID:   "shop-1",
			ProviderAccountName: "Shopee Loja",
		},
	}
	svc := NewAuthFlowService(AuthFlowConfig{
		Installations: installations,
		Credentials:   credentials,
		AuthSessions:  &flowAuthWriter{},
		Encryptor:     &flowEncryptor{},
		Adapters:      []MarketplaceAuthAdapter{adapter},
	})

	result, err := svc.SubmitAPIKey(context.Background(), SubmitAPIKeyInput{
		InstallationID: "inst-shopee",
		APIKey:         "api-key",
		Metadata:       map[string]string{"shop_id": "shop-1"},
	})
	if err != nil {
		t.Fatalf("SubmitAPIKey() error = %v", err)
	}
	if result.Status != domain.InstallationStatusConnected {
		t.Fatalf("status = %q, want connected", result.Status)
	}
	if len(credentials.inputs) != 1 || credentials.inputs[0].SecretType != "api_key" {
		t.Fatalf("credential inputs = %#v, want api_key credential", credentials.inputs)
	}
}

func TestAuthFlowDisconnectMarksInstallationDisconnected(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {InstallationID: "inst-ml", ProviderCode: "mercado_livre", Status: domain.InstallationStatusConnected, HealthStatus: domain.HealthStatusHealthy},
	}}
	svc := NewAuthFlowService(AuthFlowConfig{
		Installations: installations,
		Credentials:   &flowCredentialRotator{},
		AuthSessions:  &flowAuthWriter{},
		Encryptor:     &flowEncryptor{},
		Adapters:      []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})

	status, err := svc.Disconnect(context.Background(), DisconnectInput{InstallationID: "inst-ml"})
	if err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	if status.Status != domain.InstallationStatusDisconnected || status.HealthStatus != domain.HealthStatusWarning {
		t.Fatalf("status = %#v, want disconnected warning", status)
	}
}
