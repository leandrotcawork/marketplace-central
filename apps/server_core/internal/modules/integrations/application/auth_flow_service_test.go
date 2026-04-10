package application

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type flowInstallationStore struct {
	installations       map[string]domain.Installation
	statuses            []domain.InstallationStatus
	healths             []domain.HealthStatus
	activeCredentialIDs []string
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

func (s *flowInstallationStore) UpdateActiveCredentialID(ctx context.Context, installationID string, credentialID string) error {
	inst := s.installations[installationID]
	inst.ActiveCredentialID = credentialID
	s.installations[installationID] = inst
	s.activeCredentialIDs = append(s.activeCredentialIDs, credentialID)
	return nil
}

type flowCredentialRotator struct {
	activeCredential         domain.Credential
	activeFound              bool
	inputs                   []RotateCredentialInput
	deactivatedInstallations []string
}

func (s *flowCredentialRotator) GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error) {
	if !s.activeFound || s.activeCredential.InstallationID != installationID {
		return domain.Credential{}, false, nil
	}
	return s.activeCredential, true, nil
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

func (s *flowCredentialRotator) DeactivateAllForInstallation(ctx context.Context, installationID string) error {
	s.deactivatedInstallations = append(s.deactivatedInstallations, installationID)
	if s.activeCredential.InstallationID == installationID {
		s.activeFound = false
		s.activeCredential.IsActive = false
	}
	return nil
}

type flowAuthWriter struct {
	session      domain.AuthSession
	sessionFound bool
	inputs       []UpsertAuthSessionInput
	sessions     []domain.AuthSession
}

func (s *flowAuthWriter) GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error) {
	if !s.sessionFound || s.session.InstallationID != installationID {
		return domain.AuthSession{}, false, nil
	}
	return s.session, true, nil
}

func (s *flowAuthWriter) Upsert(ctx context.Context, input UpsertAuthSessionInput) (domain.AuthSession, error) {
	s.inputs = append(s.inputs, input)
	session := domain.AuthSession{
		AuthSessionID:        input.AuthSessionID,
		InstallationID:       input.InstallationID,
		ProviderAccountID:    input.ProviderAccountID,
		State:                input.State,
		AccessTokenExpiresAt: input.AccessTokenExpiresAt,
		LastVerifiedAt:       input.LastVerifiedAt,
		RefreshFailureCode:   input.RefreshFailureCode,
		ConsecutiveFailures:  input.ConsecutiveFailures,
		NextRetryAt:          input.NextRetryAt,
	}
	s.sessions = append(s.sessions, session)
	return session, nil
}

type flowEncryptor struct {
	payloads         []map[string]any
	decryptedPayload map[string]any
	decryptKeyID     string
}

func (s *flowEncryptor) EncryptJSON(payload map[string]any) ([]byte, string, error) {
	s.payloads = append(s.payloads, payload)
	return []byte("ciphertext"), "key-1", nil
}

func (s *flowEncryptor) DecryptJSON(encoded []byte) (map[string]any, string, error) {
	if string(encoded) != "active-ciphertext" {
		return nil, "", domain.ErrCredentialDecryptionFailed
	}
	return s.decryptedPayload, s.decryptKeyID, nil
}

type flowAdapter struct {
	providerCode  string
	startInput    StartAuthorizeAdapterInput
	callbackInput HandleCallbackAdapterInput
	refreshInput  RefreshCredentialAdapterInput
	callback      CredentialPayload
	apiKey        CredentialPayload
	refresh       CredentialPayload
	refreshCalls  int
}

func (s *flowAdapter) ProviderCode() string { return s.providerCode }

func (s *flowAdapter) StartAuthorize(ctx context.Context, input StartAuthorizeAdapterInput) (AuthorizeStart, error) {
	s.startInput = input
	return AuthorizeStart{AuthURL: "https://provider.test/authorize?state=" + input.State}, nil
}

func (s *flowAdapter) ExchangeCallback(ctx context.Context, input HandleCallbackAdapterInput) (CredentialPayload, error) {
	s.callbackInput = input
	return s.callback, nil
}

func (s *flowAdapter) VerifyAPIKey(ctx context.Context, input SubmitAPIKeyAdapterInput) (CredentialPayload, error) {
	return s.apiKey, nil
}

func (s *flowAdapter) Refresh(ctx context.Context, input RefreshCredentialAdapterInput) (CredentialPayload, error) {
	s.refreshInput = input
	s.refreshCalls++
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
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
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
	savedState := oauthStates.savedStates[0]
	if savedState.TenantID != "tenant_default" {
		t.Fatalf("saved OAuth state tenant = %q, want tenant_default", savedState.TenantID)
	}
	if savedState.CodeVerifier == "" {
		t.Fatal("saved OAuth state code verifier is empty")
	}
	if adapter.startInput.CodeChallenge == "" {
		t.Fatal("adapter code challenge is empty")
	}
	if adapter.startInput.CodeChallenge != pkceChallenge(savedState.CodeVerifier) {
		t.Fatalf("adapter code challenge = %q, want challenge for persisted verifier", adapter.startInput.CodeChallenge)
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
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
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
	if adapter.callbackInput.CodeVerifier != "verifier-1" {
		t.Fatalf("adapter callback code verifier = %q, want verifier-1", adapter.callbackInput.CodeVerifier)
	}
	if len(encryptor.payloads) != 1 || encryptor.payloads[0]["access_token"] != "access" || encryptor.payloads[0]["refresh_token"] != "refresh" {
		t.Fatalf("encrypted payloads = %#v, want token payload", encryptor.payloads)
	}
}

func TestStartReauthRejectsDifferentProviderAccount(t *testing.T) {
	t.Parallel()

	now := time.Unix(1550, 0).UTC()
	expiresAt := time.Unix(2500, 0).UTC()
	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {
			InstallationID:    "inst-ml",
			ProviderCode:      "mercado_livre",
			Status:            domain.InstallationStatusRequiresReauth,
			HealthStatus:      domain.HealthStatusWarning,
			ExternalAccountID: "seller-original",
		},
	}}
	credentials := &flowCredentialRotator{}
	authSessions := &flowAuthWriter{}
	encryptor := &flowEncryptor{}
	adapter := &flowAdapter{
		providerCode: "mercado_livre",
		callback: CredentialPayload{
			SecretType:        "oauth2",
			AccessToken:       "access",
			RefreshToken:      "refresh",
			ProviderAccountID: "seller-other",
			ExpiresAt:         &expiresAt,
		},
	}
	oauthStates := &securityOAuthStateStore{
		state: domain.OAuthState{
			TenantID:       "tenant_default",
			ID:             "oauth-state-reauth",
			InstallationID: "inst-ml",
			Nonce:          "nonce-reauth",
			CodeVerifier:   "verifier-reauth",
			HMACSignature:  "signed_state",
			ExpiresAt:      now.Add(time.Minute),
		},
		found:         true,
		consumeResult: true,
	}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: installations,
		Credentials:   credentials,
		AuthSessions:  authSessions,
		OAuthStates:   oauthStates,
		OAuthStateCodec: securityStateCodec{payload: OAuthStatePayload{
			TenantID:       "tenant_default",
			Nonce:          "nonce-reauth",
			InstallationID: "inst-ml",
		}},
		Encryptor: encryptor,
		Clock:     fixedAuthFlowClock{now: now},
		Adapters:  []MarketplaceAuthAdapter{adapter},
	})

	_, err := svc.HandleCallback(context.Background(), HandleCallbackInput{
		InstallationID: "inst-ml",
		State:          "signed_state",
		Code:           "code-1",
		RedirectURI:    "https://app.test/callback",
	})

	if !errors.Is(err, domain.ErrReauthAccountMismatch) {
		t.Fatalf("HandleCallback() error = %v, want %v", err, domain.ErrReauthAccountMismatch)
	}
	if len(credentials.inputs) != 0 {
		t.Fatalf("credential rotations = %#v, want none on account mismatch", credentials.inputs)
	}
	if len(authSessions.inputs) != 0 {
		t.Fatalf("auth session inputs = %#v, want none on account mismatch", authSessions.inputs)
	}
	if len(encryptor.payloads) != 0 {
		t.Fatalf("encrypted payloads = %#v, want none on account mismatch", encryptor.payloads)
	}
	if len(installations.statuses) != 0 {
		t.Fatalf("installation status updates = %#v, want none on account mismatch", installations.statuses)
	}
}

func TestNewAuthFlowServiceFailsWhenOAuthStateDependenciesAreMissing(t *testing.T) {
	t.Parallel()

	svc, err := NewAuthFlowService(AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: &flowInstallationStore{installations: map[string]domain.Installation{}},
		Credentials:   &flowCredentialRotator{},
		AuthSessions:  &flowAuthWriter{},
		Encryptor:     &flowEncryptor{},
		Adapters:      []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})

	if err == nil {
		t.Fatal("NewAuthFlowService() error = nil, want missing OAuth state dependency error")
	}
	if svc != nil {
		t.Fatalf("NewAuthFlowService() service = %#v, want nil on invalid config", svc)
	}
}

func TestAuthFlowStartAuthorizeReturnsErrorWhenEntropyUnavailable(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {InstallationID: "inst-ml", ProviderCode: "mercado_livre", Status: domain.InstallationStatusDraft, HealthStatus: domain.HealthStatusHealthy},
	}}
	oauthStates := &securityOAuthStateStore{}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
		Installations:   installations,
		Credentials:     &flowCredentialRotator{},
		AuthSessions:    &flowAuthWriter{},
		OAuthStates:     oauthStates,
		OAuthStateCodec: roundTripSecurityStateCodec{payloadsByState: map[string]OAuthStatePayload{}},
		Encryptor:       &flowEncryptor{},
		Clock:           fixedAuthFlowClock{now: time.Unix(1000, 0).UTC()},
		RandomReader:    failingRandomReader{},
		Adapters:        []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})

	_, err := svc.StartAuthorize(context.Background(), StartAuthorizeInput{
		InstallationID: "inst-ml",
		RedirectURI:    "https://app.test/callback",
	})

	if err == nil {
		t.Fatal("StartAuthorize() error = nil, want entropy error")
	}
	if len(oauthStates.savedStates) != 0 {
		t.Fatalf("saved OAuth states = %d, want 0 when entropy fails", len(oauthStates.savedStates))
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
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: installations,
		Credentials:   credentials,
		AuthSessions:  &flowAuthWriter{},
		OAuthStates:   &securityOAuthStateStore{},
		OAuthStateCodec: roundTripSecurityStateCodec{
			payloadsByState: map[string]OAuthStatePayload{},
		},
		Encryptor: &flowEncryptor{},
		Adapters:  []MarketplaceAuthAdapter{adapter},
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

func TestRefreshCredentialRotatesAndResetsFailures(t *testing.T) {
	t.Parallel()

	now := time.Unix(1700, 0).UTC()
	expiresAt := time.Unix(2600, 0).UTC()
	retryAt := now.Add(5 * time.Minute)
	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {
			InstallationID:     "inst-ml",
			ProviderCode:       "mercado_livre",
			Status:             domain.InstallationStatusDegraded,
			HealthStatus:       domain.HealthStatusWarning,
			ExternalAccountID:  "seller-1",
			ActiveCredentialID: "cred-active",
		},
	}}
	credentials := &flowCredentialRotator{
		activeFound: true,
		activeCredential: domain.Credential{
			CredentialID:     "cred-active",
			InstallationID:   "inst-ml",
			SecretType:       "oauth2",
			EncryptedPayload: []byte("active-ciphertext"),
			EncryptionKeyID:  "key-1",
			IsActive:         true,
		},
	}
	authSessions := &flowAuthWriter{
		sessionFound: true,
		session: domain.AuthSession{
			AuthSessionID:        "auth_inst-ml",
			InstallationID:       "inst-ml",
			ProviderAccountID:    "seller-1",
			State:                domain.AuthStateRefreshFailed,
			RefreshFailureCode:   domain.ErrRefreshProviderError.Error(),
			ConsecutiveFailures:  3,
			NextRetryAt:          &retryAt,
			AccessTokenExpiresAt: ptrTime(now.Add(time.Minute)),
		},
	}
	encryptor := &flowEncryptor{
		decryptedPayload: map[string]any{
			"type":                "oauth2",
			"access_token":        "old-access",
			"refresh_token":       "old-refresh",
			"provider_account_id": "seller-1",
		},
		decryptKeyID: "key-1",
	}
	adapter := &flowAdapter{
		providerCode: "mercado_livre",
		refresh: CredentialPayload{
			SecretType:        "oauth2",
			AccessToken:       "new-access",
			RefreshToken:      "new-refresh",
			ProviderAccountID: "seller-1",
			ExpiresAt:         &expiresAt,
		},
	}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:        "tenant_default",
		Installations:   installations,
		Credentials:     credentials,
		AuthSessions:    authSessions,
		OAuthStates:     &securityOAuthStateStore{},
		OAuthStateCodec: roundTripSecurityStateCodec{payloadsByState: map[string]OAuthStatePayload{}},
		Encryptor:       encryptor,
		Clock:           fixedAuthFlowClock{now: now},
		Adapters:        []MarketplaceAuthAdapter{adapter},
	})

	status, err := svc.RefreshCredential(context.Background(), RefreshCredentialInput{InstallationID: "inst-ml"})
	if err != nil {
		t.Fatalf("RefreshCredential() error = %v", err)
	}

	if status.Status != domain.InstallationStatusConnected || status.HealthStatus != domain.HealthStatusHealthy {
		t.Fatalf("status = %#v, want connected healthy", status)
	}
	if adapter.refreshCalls != 1 || adapter.refreshInput.RefreshToken != "old-refresh" {
		t.Fatalf("refresh calls = %d input = %#v, want old refresh token", adapter.refreshCalls, adapter.refreshInput)
	}
	if len(credentials.inputs) != 1 {
		t.Fatalf("rotated credentials = %d, want 1", len(credentials.inputs))
	}
	rotatedCredential := credentials.inputs[0]
	if rotatedCredential.InstallationID != "inst-ml" || rotatedCredential.SecretType != "oauth2" || string(rotatedCredential.EncryptedPayload) != "ciphertext" {
		t.Fatalf("rotated credential = %#v, want persisted encrypted oauth2 credential", rotatedCredential)
	}
	if len(encryptor.payloads) != 1 || encryptor.payloads[0]["access_token"] != "new-access" || encryptor.payloads[0]["refresh_token"] != "new-refresh" {
		t.Fatalf("encrypted payloads = %#v, want refreshed tokens", encryptor.payloads)
	}
	if len(authSessions.sessions) != 1 {
		t.Fatalf("auth sessions = %d, want 1 reset session", len(authSessions.sessions))
	}
	resetSession := authSessions.sessions[0]
	if resetSession.ConsecutiveFailures != 0 || resetSession.RefreshFailureCode != "" || resetSession.NextRetryAt != nil {
		t.Fatalf("reset session = %#v, want failures cleared and next retry nil", resetSession)
	}
	if resetSession.State != domain.AuthStateValid || resetSession.AccessTokenExpiresAt == nil || !resetSession.AccessTokenExpiresAt.Equal(expiresAt) {
		t.Fatalf("reset session = %#v, want valid session with refreshed expiry", resetSession)
	}
	if got := installations.installations["inst-ml"]; got.Status != domain.InstallationStatusConnected || got.HealthStatus != domain.HealthStatusHealthy {
		t.Fatalf("installation = %#v, want connected healthy", got)
	}
}

func TestAuthFlowCredentialPayloadExtraCannotOverrideReservedSecretKeys(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-shopee": {InstallationID: "inst-shopee", ProviderCode: "shopee", Status: domain.InstallationStatusDraft, HealthStatus: domain.HealthStatusHealthy},
	}}
	encryptor := &flowEncryptor{}
	adapter := &flowAdapter{
		providerCode: "shopee",
		apiKey: CredentialPayload{
			SecretType:        "api_key",
			APIKey:            "safe-api-key",
			ProviderAccountID: "shop-1",
			Extra: map[string]any{
				"api_key":             "attacker-api-key",
				"provider_account_id": "attacker-shop",
				"seller_id":           "seller-1",
			},
		},
	}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: installations,
		Credentials:   &flowCredentialRotator{},
		AuthSessions:  &flowAuthWriter{},
		OAuthStates:   &securityOAuthStateStore{},
		OAuthStateCodec: roundTripSecurityStateCodec{
			payloadsByState: map[string]OAuthStatePayload{},
		},
		Encryptor: encryptor,
		Adapters:  []MarketplaceAuthAdapter{adapter},
	})

	_, err := svc.SubmitAPIKey(context.Background(), SubmitAPIKeyInput{
		InstallationID: "inst-shopee",
		APIKey:         "safe-api-key",
		Metadata:       map[string]string{"shop_id": "shop-1"},
	})
	if err != nil {
		t.Fatalf("SubmitAPIKey() error = %v", err)
	}

	if len(encryptor.payloads) != 1 {
		t.Fatalf("encrypted payloads = %d, want 1", len(encryptor.payloads))
	}
	payload := encryptor.payloads[0]
	if payload["api_key"] != "safe-api-key" {
		t.Fatalf("api_key = %v, want safe-api-key", payload["api_key"])
	}
	if payload["provider_account_id"] != "shop-1" {
		t.Fatalf("provider_account_id = %v, want shop-1", payload["provider_account_id"])
	}
	if payload["seller_id"] != "seller-1" {
		t.Fatalf("seller_id = %v, want seller-1", payload["seller_id"])
	}
}

func TestAuthFlowDisconnectMarksInstallationDisconnected(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {InstallationID: "inst-ml", ProviderCode: "mercado_livre", Status: domain.InstallationStatusConnected, HealthStatus: domain.HealthStatusHealthy},
	}}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: installations,
		Credentials:   &flowCredentialRotator{},
		AuthSessions:  &flowAuthWriter{},
		OAuthStates:   &securityOAuthStateStore{},
		OAuthStateCodec: roundTripSecurityStateCodec{
			payloadsByState: map[string]OAuthStatePayload{},
		},
		Encryptor: &flowEncryptor{},
		Adapters:  []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})

	status, err := svc.Disconnect(context.Background(), DisconnectInput{InstallationID: "inst-ml"})
	if err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	if status.Status != domain.InstallationStatusDisconnected || status.HealthStatus != domain.HealthStatusWarning {
		t.Fatalf("status = %#v, want disconnected warning", status)
	}
}

func TestAuthFlowDisconnectIdempotentDeactivatesCredentialsAndClearsActivePointer(t *testing.T) {
	t.Parallel()

	installations := &flowInstallationStore{installations: map[string]domain.Installation{
		"inst-ml": {
			InstallationID:     "inst-ml",
			ProviderCode:       "mercado_livre",
			Status:             domain.InstallationStatusConnected,
			HealthStatus:       domain.HealthStatusHealthy,
			ExternalAccountID:  "seller-1",
			ActiveCredentialID: "cred-active",
		},
	}}
	credentials := &flowCredentialRotator{
		activeFound: true,
		activeCredential: domain.Credential{
			CredentialID:   "cred-active",
			InstallationID: "inst-ml",
			IsActive:       true,
		},
	}
	svc := mustNewAuthFlowService(t, AuthFlowConfig{
		TenantID:      "tenant_default",
		Installations: installations,
		Credentials:   credentials,
		AuthSessions:  &flowAuthWriter{},
		OAuthStates:   &securityOAuthStateStore{},
		OAuthStateCodec: roundTripSecurityStateCodec{
			payloadsByState: map[string]OAuthStatePayload{},
		},
		Encryptor: &flowEncryptor{},
		Adapters:  []MarketplaceAuthAdapter{&flowAdapter{providerCode: "mercado_livre"}},
	})

	firstStatus, err := svc.Disconnect(context.Background(), DisconnectInput{InstallationID: "inst-ml"})
	if err != nil {
		t.Fatalf("first Disconnect() error = %v", err)
	}
	secondStatus, err := svc.Disconnect(context.Background(), DisconnectInput{InstallationID: "inst-ml"})
	if err != nil {
		t.Fatalf("second Disconnect() error = %v, want idempotent success", err)
	}

	if firstStatus.Status != domain.InstallationStatusDisconnected || secondStatus.Status != domain.InstallationStatusDisconnected {
		t.Fatalf("disconnect statuses = %#v then %#v, want disconnected both times", firstStatus, secondStatus)
	}
	if got := credentials.deactivatedInstallations; !reflect.DeepEqual(got, []string{"inst-ml"}) {
		t.Fatalf("deactivated installations = %#v, want only first disconnect deactivating credentials", got)
	}
	if got := installations.activeCredentialIDs; !reflect.DeepEqual(got, []string{""}) {
		t.Fatalf("active credential updates = %#v, want active pointer cleared once", got)
	}
	if got := installations.installations["inst-ml"]; got.ActiveCredentialID != "" {
		t.Fatalf("installation active credential = %q, want cleared", got.ActiveCredentialID)
	}
	if got := installations.statuses; !reflect.DeepEqual(got, []domain.InstallationStatus{domain.InstallationStatusDisconnected}) {
		t.Fatalf("status updates = %#v, want first disconnect status update only", got)
	}
}

type failingRandomReader struct{}

func (failingRandomReader) Read([]byte) (int, error) {
	return 0, errors.New("entropy unavailable")
}

func mustNewAuthFlowService(t *testing.T, cfg AuthFlowConfig) *AuthFlowService {
	t.Helper()

	svc, err := NewAuthFlowService(cfg)
	if err != nil {
		t.Fatalf("NewAuthFlowService() error = %v", err)
	}
	return svc
}
