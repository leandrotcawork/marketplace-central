package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	integrationsapp "marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

func TestAuthFlowConnectCallbackDisconnect(t *testing.T) {
	t.Parallel()

	h := newAuthFlowHarness(t, "tenant_a", "")

	start, err := h.service.StartAuthorize(context.Background(), integrationsapp.StartAuthorizeInput{
		InstallationID: "inst_1",
		RedirectURI:    "https://app.local/callback",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}

	connected, err := h.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_1",
		State: start.State,
	})
	if err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}
	if connected.Status != domain.InstallationStatusConnected {
		t.Fatalf("connected status = %s, want connected", connected.Status)
	}

	disconnected, err := h.service.Disconnect(context.Background(), integrationsapp.DisconnectInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	if disconnected.Status != domain.InstallationStatusDisconnected {
		t.Fatalf("disconnect status = %s, want disconnected", disconnected.Status)
	}

	active, found, err := h.credentials.GetActiveCredential(context.Background(), "inst_1")
	if err != nil {
		t.Fatalf("GetActiveCredential() error = %v", err)
	}
	if found || active.CredentialID != "" {
		t.Fatalf("expected no active credential after disconnect, found=%v credential=%q", found, active.CredentialID)
	}
}

func TestAuthFlowReauthAccountMismatch(t *testing.T) {
	t.Parallel()

	h := newAuthFlowHarness(t, "tenant_a", "account_expected")
	h.adapter.callbackPayload.ProviderAccountID = "account_other"

	start, err := h.service.StartAuthorize(context.Background(), integrationsapp.StartAuthorizeInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}

	_, err = h.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_1",
		State: start.State,
	})
	if !errors.Is(err, domain.ErrReauthAccountMismatch) {
		t.Fatalf("HandleCallback() err = %v, want %v", err, domain.ErrReauthAccountMismatch)
	}
}

func TestAuthFlowTenantIsolation(t *testing.T) {
	t.Parallel()

	sharedStates := newMemoryOAuthStateStore()
	hA := newAuthFlowHarnessWithStateStore(t, "tenant_a", "", sharedStates)
	hB := newAuthFlowHarnessWithStateStore(t, "tenant_b", "", sharedStates)

	start, err := hA.service.StartAuthorize(context.Background(), integrationsapp.StartAuthorizeInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}

	_, err = hB.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_1",
		State: start.State,
	})
	if !errors.Is(err, domain.ErrAuthStateInvalid) {
		t.Fatalf("HandleCallback() err = %v, want %v", err, domain.ErrAuthStateInvalid)
	}
}

func TestAuthFlowReplayRejected(t *testing.T) {
	t.Parallel()

	h := newAuthFlowHarness(t, "tenant_a", "")

	start, err := h.service.StartAuthorize(context.Background(), integrationsapp.StartAuthorizeInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}

	if _, err := h.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_1",
		State: start.State,
	}); err != nil {
		t.Fatalf("first HandleCallback() error = %v", err)
	}

	_, err = h.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_2",
		State: start.State,
	})
	if !errors.Is(err, domain.ErrAuthStateConsumed) {
		t.Fatalf("second HandleCallback() err = %v, want %v", err, domain.ErrAuthStateConsumed)
	}
}

func TestAuthFlowDisconnectIdempotent(t *testing.T) {
	t.Parallel()

	h := newAuthFlowHarness(t, "tenant_a", "")

	start, err := h.service.StartAuthorize(context.Background(), integrationsapp.StartAuthorizeInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("StartAuthorize() error = %v", err)
	}
	if _, err := h.service.HandleCallback(context.Background(), integrationsapp.HandleCallbackInput{
		Code:  "oauth_code_1",
		State: start.State,
	}); err != nil {
		t.Fatalf("HandleCallback() error = %v", err)
	}

	first, err := h.service.Disconnect(context.Background(), integrationsapp.DisconnectInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("first Disconnect() error = %v", err)
	}
	second, err := h.service.Disconnect(context.Background(), integrationsapp.DisconnectInput{
		InstallationID: "inst_1",
	})
	if err != nil {
		t.Fatalf("second Disconnect() error = %v", err)
	}
	if first.Status != domain.InstallationStatusDisconnected || second.Status != domain.InstallationStatusDisconnected {
		t.Fatalf("disconnect statuses = %s/%s, want disconnected/disconnected", first.Status, second.Status)
	}
}

type authFlowHarness struct {
	service      *integrationsapp.AuthFlowService
	adapter      *stubMarketplaceAuthAdapter
	credentials  *memoryCredentialStore
	oauthStates  *memoryOAuthStateStore
	installStore *memoryInstallationRepository
}

func newAuthFlowHarness(t *testing.T, tenantID string, externalAccountID string) authFlowHarness {
	t.Helper()
	return newAuthFlowHarnessWithStateStore(t, tenantID, externalAccountID, newMemoryOAuthStateStore())
}

func newAuthFlowHarnessWithStateStore(t *testing.T, tenantID string, externalAccountID string, oauthStateStore *memoryOAuthStateStore) authFlowHarness {
	t.Helper()

	installations := newMemoryInstallationRepository(tenantID)
	credentials := newMemoryCredentialStore(tenantID)
	sessions := newMemoryAuthSessionStore()
	adapter := &stubMarketplaceAuthAdapter{
		providerCode: "mercadolivre",
		callbackPayload: integrationsapp.CredentialPayload{
			SecretType:          "oauth2",
			AccessToken:         "access_1",
			RefreshToken:        "refresh_1",
			ProviderAccountID:   "account_1",
			ProviderAccountName: "Account 1",
			ExpiresAt:           ptrTime(time.Now().UTC().Add(time.Hour)),
		},
	}

	if err := installations.CreateInstallation(context.Background(), domain.Installation{
		InstallationID:      "inst_1",
		TenantID:            tenantID,
		ProviderCode:        "mercadolivre",
		Family:              domain.IntegrationFamilyMarketplace,
		DisplayName:         "Mercado Livre",
		Status:              domain.InstallationStatusDraft,
		HealthStatus:        domain.HealthStatusHealthy,
		ExternalAccountID:   externalAccountID,
		ExternalAccountName: "",
		CreatedAt:           time.Now().UTC(),
		UpdatedAt:           time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateInstallation() error = %v", err)
	}

	codec, err := integrationsapp.NewHMACOAuthStateCodec("integration-test-state-secret")
	if err != nil {
		t.Fatalf("NewHMACOAuthStateCodec() error = %v", err)
	}

	service, err := integrationsapp.NewAuthFlowService(integrationsapp.AuthFlowConfig{
		TenantID:        tenantID,
		Installations:   integrationsapp.NewInstallationService(installations, tenantID),
		Credentials:     integrationsapp.NewCredentialService(credentials, tenantID),
		AuthSessions:    integrationsapp.NewAuthService(sessions, tenantID),
		OAuthStates:     oauthStateStore,
		OAuthStateCodec: codec,
		Encryptor:       testEncryptor{},
		Adapters:        []integrationsapp.MarketplaceAuthAdapter{adapter},
	})
	if err != nil {
		t.Fatalf("NewAuthFlowService() error = %v", err)
	}

	return authFlowHarness{
		service:      service,
		adapter:      adapter,
		credentials:  credentials,
		oauthStates:  oauthStateStore,
		installStore: installations,
	}
}

type memoryInstallationRepository struct {
	tenantID string
	byID     map[string]domain.Installation
}

func newMemoryInstallationRepository(tenantID string) *memoryInstallationRepository {
	return &memoryInstallationRepository{
		tenantID: tenantID,
		byID:     make(map[string]domain.Installation),
	}
}

func (r *memoryInstallationRepository) CreateInstallation(_ context.Context, inst domain.Installation) error {
	r.byID[inst.InstallationID] = inst
	return nil
}

func (r *memoryInstallationRepository) GetInstallation(_ context.Context, installationID string) (domain.Installation, bool, error) {
	inst, ok := r.byID[installationID]
	return inst, ok, nil
}

func (r *memoryInstallationRepository) ListInstallations(context.Context) ([]domain.Installation, error) {
	out := make([]domain.Installation, 0, len(r.byID))
	for _, inst := range r.byID {
		out = append(out, inst)
	}
	return out, nil
}

func (r *memoryInstallationRepository) UpdateInstallationStatus(_ context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	inst, ok := r.byID[installationID]
	if !ok {
		return domain.ErrInstallationNotFound
	}
	inst.Status = status
	inst.HealthStatus = health
	inst.UpdatedAt = time.Now().UTC()
	r.byID[installationID] = inst
	return nil
}

func (r *memoryInstallationRepository) UpdateActiveCredentialID(_ context.Context, installationID string, credentialID string) error {
	inst, ok := r.byID[installationID]
	if !ok {
		return domain.ErrInstallationNotFound
	}
	inst.ActiveCredentialID = credentialID
	inst.UpdatedAt = time.Now().UTC()
	r.byID[installationID] = inst
	return nil
}

func (r *memoryInstallationRepository) SetProviderAccountID(_ context.Context, installationID, providerAccountID, providerAccountName string) error {
	inst, ok := r.byID[installationID]
	if !ok {
		return domain.ErrInstallationNotFound
	}
	inst.ExternalAccountID = providerAccountID
	inst.ExternalAccountName = providerAccountName
	inst.UpdatedAt = time.Now().UTC()
	r.byID[installationID] = inst
	return nil
}

type memoryCredentialStore struct {
	tenantID         string
	byInstallationID map[string][]domain.Credential
}

func newMemoryCredentialStore(tenantID string) *memoryCredentialStore {
	return &memoryCredentialStore{
		tenantID:         tenantID,
		byInstallationID: make(map[string][]domain.Credential),
	}
}

func (s *memoryCredentialStore) NextCredentialVersion(_ context.Context, installationID string) (int, error) {
	return len(s.byInstallationID[installationID]) + 1, nil
}

func (s *memoryCredentialStore) SaveCredentialVersion(_ context.Context, cred domain.Credential) error {
	creds := s.byInstallationID[cred.InstallationID]
	for i := range creds {
		creds[i].IsActive = false
	}
	cred.TenantID = s.tenantID
	cred.IsActive = true
	s.byInstallationID[cred.InstallationID] = append(creds, cred)
	return nil
}

func (s *memoryCredentialStore) GetActiveCredential(_ context.Context, installationID string) (domain.Credential, bool, error) {
	creds := s.byInstallationID[installationID]
	for i := len(creds) - 1; i >= 0; i-- {
		if creds[i].IsActive {
			return creds[i], true, nil
		}
	}
	return domain.Credential{}, false, nil
}

func (s *memoryCredentialStore) DeactivateCredential(_ context.Context, credentialID string) error {
	for installationID, creds := range s.byInstallationID {
		for i := range creds {
			if creds[i].CredentialID == credentialID {
				creds[i].IsActive = false
				now := time.Now().UTC()
				creds[i].RevokedAt = &now
				creds[i].UpdatedAt = now
				s.byInstallationID[installationID] = creds
				return nil
			}
		}
	}
	return nil
}

func (s *memoryCredentialStore) DeactivateAllForInstallation(_ context.Context, installationID string) error {
	creds := s.byInstallationID[installationID]
	for i := range creds {
		now := time.Now().UTC()
		creds[i].IsActive = false
		creds[i].RevokedAt = &now
		creds[i].UpdatedAt = now
	}
	s.byInstallationID[installationID] = creds
	return nil
}

type memoryAuthSessionStore struct {
	byInstallationID map[string]domain.AuthSession
}

func newMemoryAuthSessionStore() *memoryAuthSessionStore {
	return &memoryAuthSessionStore{
		byInstallationID: make(map[string]domain.AuthSession),
	}
}

func (s *memoryAuthSessionStore) UpsertAuthSession(_ context.Context, session domain.AuthSession) error {
	s.byInstallationID[session.InstallationID] = session
	return nil
}

func (s *memoryAuthSessionStore) GetAuthSession(_ context.Context, installationID string) (domain.AuthSession, bool, error) {
	session, ok := s.byInstallationID[installationID]
	return session, ok, nil
}

func (s *memoryAuthSessionStore) ListExpiringSessions(context.Context, time.Duration) ([]domain.AuthSession, error) {
	return nil, nil
}

type memoryOAuthStateStore struct {
	byNonce map[string]domain.OAuthState
}

func newMemoryOAuthStateStore() *memoryOAuthStateStore {
	return &memoryOAuthStateStore{
		byNonce: make(map[string]domain.OAuthState),
	}
}

func (s *memoryOAuthStateStore) Save(_ context.Context, state domain.OAuthState) error {
	s.byNonce[state.Nonce] = state
	return nil
}

func (s *memoryOAuthStateStore) GetByNonce(_ context.Context, nonce string) (domain.OAuthState, bool, error) {
	state, ok := s.byNonce[nonce]
	return state, ok, nil
}

func (s *memoryOAuthStateStore) ConsumeNonce(_ context.Context, id string) (bool, error) {
	for nonce, state := range s.byNonce {
		if state.ID == id {
			if state.ConsumedAt != nil {
				return false, nil
			}
			now := time.Now().UTC()
			state.ConsumedAt = &now
			s.byNonce[nonce] = state
			return true, nil
		}
	}
	return false, nil
}

func (s *memoryOAuthStateStore) DeleteExpired(context.Context, time.Time) (int64, error) {
	return 0, nil
}

type testEncryptor struct{}

func (testEncryptor) EncryptJSON(payload map[string]any) ([]byte, string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, "", err
	}
	return raw, "key_local_test", nil
}

func (testEncryptor) DecryptJSON(encoded []byte) (map[string]any, string, error) {
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		return nil, "", err
	}
	return payload, "key_local_test", nil
}

type stubMarketplaceAuthAdapter struct {
	providerCode    string
	callbackPayload integrationsapp.CredentialPayload
}

func (a *stubMarketplaceAuthAdapter) ProviderCode() string {
	return a.providerCode
}

func (a *stubMarketplaceAuthAdapter) StartAuthorize(context.Context, integrationsapp.StartAuthorizeAdapterInput) (integrationsapp.AuthorizeStart, error) {
	return integrationsapp.AuthorizeStart{
		ProviderCode: a.providerCode,
		AuthURL:      fmt.Sprintf("https://provider.local/%s/authorize", a.providerCode),
	}, nil
}

func (a *stubMarketplaceAuthAdapter) ExchangeCallback(context.Context, integrationsapp.HandleCallbackAdapterInput) (integrationsapp.CredentialPayload, error) {
	return a.callbackPayload, nil
}

func (a *stubMarketplaceAuthAdapter) VerifyAPIKey(context.Context, integrationsapp.SubmitAPIKeyAdapterInput) (integrationsapp.CredentialPayload, error) {
	return integrationsapp.CredentialPayload{}, errors.New("not implemented")
}

func (a *stubMarketplaceAuthAdapter) Refresh(context.Context, integrationsapp.RefreshCredentialAdapterInput) (integrationsapp.CredentialPayload, error) {
	return integrationsapp.CredentialPayload{}, errors.New("not implemented")
}

func ptrTime(v time.Time) *time.Time {
	value := v.UTC()
	return &value
}
