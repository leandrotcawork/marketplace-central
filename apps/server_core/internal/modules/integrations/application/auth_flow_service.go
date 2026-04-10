package application

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type StartAuthorizeInput struct {
	InstallationID string
	RedirectURI    string
	Scopes         []string
}

type StartReauthInput struct {
	InstallationID string
	RedirectURI    string
	Scopes         []string
}

type HandleCallbackInput struct {
	InstallationID string
	State          string
	Code           string
	RedirectURI    string
}

type SubmitAPIKeyInput struct {
	InstallationID string
	APIKey         string
	Metadata       map[string]string
}

type RefreshCredentialInput struct {
	InstallationID string
}

type DisconnectInput struct {
	InstallationID string
}

type GetAuthStatusInput struct {
	InstallationID string
}

type AuthorizeStart struct {
	InstallationID string `json:"installation_id"`
	ProviderCode   string `json:"provider_code"`
	State          string `json:"state"`
	AuthURL        string `json:"auth_url"`
	ExpiresIn      int    `json:"expires_in"`
}

type AuthStatus struct {
	InstallationID  string                    `json:"installation_id"`
	Status          domain.InstallationStatus `json:"status"`
	HealthStatus    domain.HealthStatus       `json:"health_status"`
	ProviderCode    string                    `json:"provider_code,omitempty"`
	ExternalAccount string                    `json:"external_account_id,omitempty"`
}

type StartAuthorizeAdapterInput struct {
	InstallationID string
	State          string
	RedirectURI    string
	Scopes         []string
}

type HandleCallbackAdapterInput struct {
	InstallationID string
	Code           string
	RedirectURI    string
}

type OAuthStatePayload struct {
	Nonce          string
	InstallationID string
}

type SubmitAPIKeyAdapterInput struct {
	InstallationID string
	APIKey         string
	Metadata       map[string]string
}

type RefreshCredentialAdapterInput struct {
	InstallationID string
	RefreshToken   string
}

type CredentialPayload struct {
	SecretType          string
	AccessToken         string
	RefreshToken        string
	APIKey              string
	ProviderAccountID   string
	ProviderAccountName string
	ExpiresAt           *time.Time
	Extra               map[string]any
}

type MarketplaceAuthAdapter interface {
	ProviderCode() string
	StartAuthorize(ctx context.Context, input StartAuthorizeAdapterInput) (AuthorizeStart, error)
	ExchangeCallback(ctx context.Context, input HandleCallbackAdapterInput) (CredentialPayload, error)
	VerifyAPIKey(ctx context.Context, input SubmitAPIKeyAdapterInput) (CredentialPayload, error)
	Refresh(ctx context.Context, input RefreshCredentialAdapterInput) (CredentialPayload, error)
}

type authFlowInstallationStore interface {
	Get(ctx context.Context, installationID string) (domain.Installation, bool, error)
	List(ctx context.Context) ([]domain.Installation, error)
	UpdateStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error
}

type authFlowCredentialRotator interface {
	Rotate(ctx context.Context, input RotateCredentialInput) (domain.Credential, error)
}

type authFlowSessionWriter interface {
	Upsert(ctx context.Context, input UpsertAuthSessionInput) (domain.AuthSession, error)
}

type authFlowOAuthStateStore interface {
	GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error)
	ConsumeNonce(ctx context.Context, id string) (bool, error)
}

type authFlowOAuthStateCodec interface {
	DecodeAndVerify(state string) (OAuthStatePayload, error)
}

type authFlowEncryptor interface {
	EncryptJSON(payload map[string]any) ([]byte, string, error)
}

type authFlowClock interface {
	Now() time.Time
}

type systemAuthFlowClock struct{}

func (systemAuthFlowClock) Now() time.Time {
	return time.Now().UTC()
}

type AuthFlowConfig struct {
	Installations   authFlowInstallationStore
	Credentials     authFlowCredentialRotator
	AuthSessions    authFlowSessionWriter
	OAuthStates     authFlowOAuthStateStore
	OAuthStateCodec authFlowOAuthStateCodec
	Encryptor       authFlowEncryptor
	Clock           authFlowClock
	Adapters        []MarketplaceAuthAdapter
}

type AuthFlowService struct {
	installations   authFlowInstallationStore
	credentials     authFlowCredentialRotator
	authSessions    authFlowSessionWriter
	oauthStates     authFlowOAuthStateStore
	oauthStateCodec authFlowOAuthStateCodec
	encryptor       authFlowEncryptor
	clock           authFlowClock
	adapters        map[string]MarketplaceAuthAdapter
}

func NewAuthFlowService(cfg AuthFlowConfig) *AuthFlowService {
	byProvider := make(map[string]MarketplaceAuthAdapter, len(cfg.Adapters))
	for _, adapter := range cfg.Adapters {
		byProvider[adapter.ProviderCode()] = adapter
	}
	clock := cfg.Clock
	if clock == nil {
		clock = systemAuthFlowClock{}
	}

	return &AuthFlowService{
		installations:   cfg.Installations,
		credentials:     cfg.Credentials,
		authSessions:    cfg.AuthSessions,
		oauthStates:     cfg.OAuthStates,
		oauthStateCodec: cfg.OAuthStateCodec,
		encryptor:       cfg.Encryptor,
		clock:           clock,
		adapters:        byProvider,
	}
}

func (s *AuthFlowService) StartAuthorize(ctx context.Context, input StartAuthorizeInput) (AuthorizeStart, error) {
	inst, adapter, err := s.loadOAuthInstallation(ctx, input.InstallationID)
	if err != nil {
		return AuthorizeStart{}, err
	}

	state := randomState()
	start, err := adapter.StartAuthorize(ctx, StartAuthorizeAdapterInput{
		InstallationID: input.InstallationID,
		State:          state,
		RedirectURI:    input.RedirectURI,
		Scopes:         input.Scopes,
	})
	if err != nil {
		return AuthorizeStart{}, err
	}

	if err := s.installations.UpdateStatus(ctx, inst.InstallationID, domain.InstallationStatusPendingConnection, inst.HealthStatus); err != nil {
		return AuthorizeStart{}, err
	}

	return AuthorizeStart{
		InstallationID: inst.InstallationID,
		ProviderCode:   inst.ProviderCode,
		State:          state,
		AuthURL:        start.AuthURL,
		ExpiresIn:      600,
	}, nil
}

func (s *AuthFlowService) HandleCallback(ctx context.Context, input HandleCallbackInput) (AuthStatus, error) {
	statePayload, err := s.verifyAndConsumeCallbackState(ctx, input.State, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	inst, adapter, err := s.loadInstallationWithAdapter(ctx, statePayload.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	payload, err := adapter.ExchangeCallback(ctx, HandleCallbackAdapterInput{
		InstallationID: statePayload.InstallationID,
		Code:           input.Code,
		RedirectURI:    input.RedirectURI,
	})
	if err != nil {
		return AuthStatus{}, err
	}

	if err := s.saveCredential(ctx, statePayload.InstallationID, payload); err != nil {
		return AuthStatus{}, err
	}

	if _, err := s.authSessions.Upsert(ctx, UpsertAuthSessionInput{
		AuthSessionID:        fmt.Sprintf("auth_%s", statePayload.InstallationID),
		InstallationID:       statePayload.InstallationID,
		ProviderAccountID:    payload.ProviderAccountID,
		State:                domain.AuthStateValid,
		AccessTokenExpiresAt: payload.ExpiresAt,
		LastVerifiedAt:       ptrTime(time.Now().UTC()),
	}); err != nil {
		return AuthStatus{}, err
	}

	if err := s.installations.UpdateStatus(ctx, inst.InstallationID, domain.InstallationStatusConnected, domain.HealthStatusHealthy); err != nil {
		return AuthStatus{}, err
	}

	return AuthStatus{
		InstallationID:  statePayload.InstallationID,
		Status:          domain.InstallationStatusConnected,
		HealthStatus:    domain.HealthStatusHealthy,
		ProviderCode:    inst.ProviderCode,
		ExternalAccount: payload.ProviderAccountID,
	}, nil
}

func (s *AuthFlowService) SubmitAPIKey(ctx context.Context, input SubmitAPIKeyInput) (AuthStatus, error) {
	inst, adapter, err := s.loadInstallationWithAdapter(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	payload, err := adapter.VerifyAPIKey(ctx, SubmitAPIKeyAdapterInput{
		InstallationID: input.InstallationID,
		APIKey:         input.APIKey,
		Metadata:       input.Metadata,
	})
	if err != nil {
		return AuthStatus{}, err
	}

	if err := s.saveCredential(ctx, input.InstallationID, payload); err != nil {
		return AuthStatus{}, err
	}

	if err := s.installations.UpdateStatus(ctx, inst.InstallationID, domain.InstallationStatusConnected, domain.HealthStatusHealthy); err != nil {
		return AuthStatus{}, err
	}

	return AuthStatus{
		InstallationID:  input.InstallationID,
		Status:          domain.InstallationStatusConnected,
		HealthStatus:    domain.HealthStatusHealthy,
		ProviderCode:    inst.ProviderCode,
		ExternalAccount: payload.ProviderAccountID,
	}, nil
}

func (s *AuthFlowService) RefreshCredential(ctx context.Context, input RefreshCredentialInput) (AuthStatus, error) {
	inst, _, err := s.loadInstallationWithAdapter(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	return AuthStatus{
		InstallationID: input.InstallationID,
		Status:         inst.Status,
		HealthStatus:   inst.HealthStatus,
		ProviderCode:   inst.ProviderCode,
	}, nil
}

func (s *AuthFlowService) Disconnect(ctx context.Context, input DisconnectInput) (AuthStatus, error) {
	inst, _, err := s.loadInstallationWithAdapter(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	if err := s.installations.UpdateStatus(ctx, input.InstallationID, domain.InstallationStatusDisconnected, domain.HealthStatusWarning); err != nil {
		return AuthStatus{}, err
	}

	return AuthStatus{
		InstallationID: input.InstallationID,
		Status:         domain.InstallationStatusDisconnected,
		HealthStatus:   domain.HealthStatusWarning,
		ProviderCode:   inst.ProviderCode,
	}, nil
}

func (s *AuthFlowService) StartReauth(ctx context.Context, input StartReauthInput) (AuthorizeStart, error) {
	return s.StartAuthorize(ctx, StartAuthorizeInput{
		InstallationID: input.InstallationID,
		RedirectURI:    input.RedirectURI,
		Scopes:         input.Scopes,
	})
}

func (s *AuthFlowService) GetAuthStatus(ctx context.Context, input GetAuthStatusInput) (AuthStatus, error) {
	inst, found, err := s.installations.Get(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}
	if !found {
		return AuthStatus{}, domain.ErrInstallationNotFound
	}

	return AuthStatus{
		InstallationID:  input.InstallationID,
		Status:          inst.Status,
		HealthStatus:    inst.HealthStatus,
		ProviderCode:    inst.ProviderCode,
		ExternalAccount: inst.ExternalAccountID,
	}, nil
}

func (s *AuthFlowService) loadOAuthInstallation(ctx context.Context, installationID string) (domain.Installation, MarketplaceAuthAdapter, error) {
	inst, adapter, err := s.loadInstallationWithAdapter(ctx, installationID)
	if err != nil {
		return domain.Installation{}, nil, err
	}
	if inst.Status == domain.InstallationStatusDisconnected {
		return domain.Installation{}, nil, domain.ErrInstallationWrongStatus
	}
	return inst, adapter, nil
}

func (s *AuthFlowService) loadInstallationWithAdapter(ctx context.Context, installationID string) (domain.Installation, MarketplaceAuthAdapter, error) {
	inst, found, err := s.installations.Get(ctx, installationID)
	if err != nil {
		return domain.Installation{}, nil, err
	}
	if !found {
		return domain.Installation{}, nil, domain.ErrInstallationNotFound
	}

	adapter, ok := s.adapters[inst.ProviderCode]
	if !ok {
		return domain.Installation{}, nil, domain.ErrAuthProviderNotOAuth
	}
	return inst, adapter, nil
}

func (s *AuthFlowService) verifyAndConsumeCallbackState(ctx context.Context, state string, expectedInstallationID string) (OAuthStatePayload, error) {
	if s.oauthStateCodec == nil || s.oauthStates == nil {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}

	payload, err := s.oauthStateCodec.DecodeAndVerify(state)
	if err != nil {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	if payload.Nonce == "" || payload.InstallationID == "" {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	if expectedInstallationID != "" && expectedInstallationID != payload.InstallationID {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}

	stored, found, err := s.oauthStates.GetByNonce(ctx, payload.Nonce)
	if err != nil {
		return OAuthStatePayload{}, err
	}
	if !found {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	if stored.IsExpired(s.clock.Now().UTC()) {
		return OAuthStatePayload{}, domain.ErrAuthStateExpired
	}
	if stored.IsConsumed() {
		return OAuthStatePayload{}, domain.ErrAuthStateConsumed
	}
	if stored.Nonce != payload.Nonce || stored.InstallationID != payload.InstallationID {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}

	consumed, err := s.oauthStates.ConsumeNonce(ctx, stored.ID)
	if err != nil {
		return OAuthStatePayload{}, err
	}
	if !consumed {
		return OAuthStatePayload{}, domain.ErrAuthStateConsumed
	}

	return payload, nil
}

func (s *AuthFlowService) saveCredential(ctx context.Context, installationID string, payload CredentialPayload) error {
	secret := map[string]any{
		"type":                payload.SecretType,
		"access_token":        payload.AccessToken,
		"refresh_token":       payload.RefreshToken,
		"api_key":             payload.APIKey,
		"provider_account_id": payload.ProviderAccountID,
	}
	for k, v := range payload.Extra {
		secret[k] = v
	}

	ciphertext, keyID, err := s.encryptor.EncryptJSON(secret)
	if err != nil {
		return err
	}

	_, err = s.credentials.Rotate(ctx, RotateCredentialInput{
		CredentialID:     fmt.Sprintf("cred_%d", time.Now().UTC().UnixNano()),
		InstallationID:   installationID,
		SecretType:       payload.SecretType,
		EncryptedPayload: ciphertext,
		EncryptionKeyID:  keyID,
	})
	return err
}

func randomState() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("state_%d", time.Now().UTC().UnixNano())
	}
	return hex.EncodeToString(buf[:])
}

func ptrTime(v time.Time) *time.Time {
	value := v.UTC()
	return &value
}

func encodePayload(payload map[string]any) []byte {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return raw
}

func decodePayload(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return map[string]any{}
	}
	return payload
}

var errAdapterNotFound = errors.New("INTEGRATIONS_AUTH_ADAPTER_NOT_FOUND")
