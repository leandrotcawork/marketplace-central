package application

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
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
	CodeChallenge  string
}

type HandleCallbackAdapterInput struct {
	InstallationID string
	Code           string
	RedirectURI    string
	CodeVerifier   string
}

type OAuthStatePayload struct {
	TenantID       string `json:"tenant_id"`
	Nonce          string `json:"nonce"`
	InstallationID string `json:"installation_id"`
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
	GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error)
	Rotate(ctx context.Context, input RotateCredentialInput) (domain.Credential, error)
}

type authFlowSessionWriter interface {
	GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error)
	Upsert(ctx context.Context, input UpsertAuthSessionInput) (domain.AuthSession, error)
}

type authFlowOAuthStateStore interface {
	Save(ctx context.Context, state domain.OAuthState) error
	GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error)
	ConsumeNonce(ctx context.Context, id string) (bool, error)
}

type authFlowOAuthStateCodec interface {
	EncodeAndSign(payload OAuthStatePayload) (string, error)
	DecodeAndVerify(state string) (OAuthStatePayload, error)
}

type authFlowEncryptor interface {
	EncryptJSON(payload map[string]any) ([]byte, string, error)
	DecryptJSON(encoded []byte) (map[string]any, string, error)
}

type authFlowClock interface {
	Now() time.Time
}

type systemAuthFlowClock struct{}

func (systemAuthFlowClock) Now() time.Time {
	return time.Now().UTC()
}

type AuthFlowConfig struct {
	TenantID        string
	Installations   authFlowInstallationStore
	Credentials     authFlowCredentialRotator
	AuthSessions    authFlowSessionWriter
	OAuthStates     authFlowOAuthStateStore
	OAuthStateCodec authFlowOAuthStateCodec
	Encryptor       authFlowEncryptor
	Clock           authFlowClock
	RandomReader    io.Reader
	Adapters        []MarketplaceAuthAdapter
}

type AuthFlowService struct {
	tenantID        string
	installations   authFlowInstallationStore
	credentials     authFlowCredentialRotator
	authSessions    authFlowSessionWriter
	oauthStates     authFlowOAuthStateStore
	oauthStateCodec authFlowOAuthStateCodec
	encryptor       authFlowEncryptor
	clock           authFlowClock
	randomReader    io.Reader
	adapters        map[string]MarketplaceAuthAdapter
}

func NewAuthFlowService(cfg AuthFlowConfig) (*AuthFlowService, error) {
	if cfg.Installations == nil {
		return nil, fmt.Errorf("%w: installations", errAuthFlowInvalidConfig)
	}
	if cfg.Credentials == nil {
		return nil, fmt.Errorf("%w: credentials", errAuthFlowInvalidConfig)
	}
	if cfg.AuthSessions == nil {
		return nil, fmt.Errorf("%w: auth sessions", errAuthFlowInvalidConfig)
	}
	if cfg.OAuthStates == nil {
		return nil, fmt.Errorf("%w: oauth states", errAuthFlowInvalidConfig)
	}
	if cfg.OAuthStateCodec == nil {
		return nil, fmt.Errorf("%w: oauth state codec", errAuthFlowInvalidConfig)
	}
	if cfg.Encryptor == nil {
		return nil, fmt.Errorf("%w: encryptor", errAuthFlowInvalidConfig)
	}

	byProvider := make(map[string]MarketplaceAuthAdapter, len(cfg.Adapters))
	for _, adapter := range cfg.Adapters {
		if adapter == nil {
			return nil, fmt.Errorf("%w: auth adapter", errAuthFlowInvalidConfig)
		}
		providerCode := strings.TrimSpace(adapter.ProviderCode())
		if providerCode == "" {
			return nil, fmt.Errorf("%w: auth adapter provider code", errAuthFlowInvalidConfig)
		}
		byProvider[providerCode] = adapter
	}

	tenantID := strings.TrimSpace(cfg.TenantID)
	if tenantID == "" {
		tenantID = "tenant_default"
	}
	clock := cfg.Clock
	if clock == nil {
		clock = systemAuthFlowClock{}
	}
	randomReader := cfg.RandomReader
	if randomReader == nil {
		randomReader = rand.Reader
	}

	return &AuthFlowService{
		tenantID:        tenantID,
		installations:   cfg.Installations,
		credentials:     cfg.Credentials,
		authSessions:    cfg.AuthSessions,
		oauthStates:     cfg.OAuthStates,
		oauthStateCodec: cfg.OAuthStateCodec,
		encryptor:       cfg.Encryptor,
		clock:           clock,
		randomReader:    randomReader,
		adapters:        byProvider,
	}, nil
}

func (s *AuthFlowService) StartAuthorize(ctx context.Context, input StartAuthorizeInput) (AuthorizeStart, error) {
	inst, adapter, err := s.loadOAuthInstallation(ctx, input.InstallationID)
	if err != nil {
		return AuthorizeStart{}, err
	}

	nonce, err := randomOAuthToken(s.randomReader)
	if err != nil {
		return AuthorizeStart{}, fmt.Errorf("%w: nonce entropy: %v", domain.ErrAuthStateInvalid, err)
	}
	codeVerifier, err := randomOAuthToken(s.randomReader)
	if err != nil {
		return AuthorizeStart{}, fmt.Errorf("%w: verifier entropy: %v", domain.ErrAuthStateInvalid, err)
	}
	statePayload := OAuthStatePayload{
		TenantID:       s.tenantID,
		Nonce:          nonce,
		InstallationID: inst.InstallationID,
	}
	state, err := s.oauthStateCodec.EncodeAndSign(statePayload)
	if err != nil {
		return AuthorizeStart{}, domain.ErrAuthStateInvalid
	}

	now := s.clock.Now().UTC()
	if err := s.oauthStates.Save(ctx, domain.OAuthState{
		ID:             fmt.Sprintf("oauth_state_%s", nonce),
		TenantID:       s.tenantID,
		InstallationID: inst.InstallationID,
		Nonce:          nonce,
		CodeVerifier:   codeVerifier,
		HMACSignature:  state,
		ExpiresAt:      now.Add(10 * time.Minute),
		CreatedAt:      now,
	}); err != nil {
		return AuthorizeStart{}, err
	}

	start, err := adapter.StartAuthorize(ctx, StartAuthorizeAdapterInput{
		InstallationID: inst.InstallationID,
		State:          state,
		RedirectURI:    input.RedirectURI,
		Scopes:         input.Scopes,
		CodeChallenge:  pkceChallenge(codeVerifier),
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
	statePayload, codeVerifier, err := s.verifyAndConsumeCallbackState(ctx, input.State, input.InstallationID)
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
		CodeVerifier:   codeVerifier,
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
		LastVerifiedAt:       ptrTime(s.clock.Now().UTC()),
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
	inst, adapter, err := s.loadInstallationWithAdapter(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}

	session, found, err := s.authSessions.GetAuthSession(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}
	if !found {
		return AuthStatus{}, domain.ErrCredentialValidationFailed
	}

	activeCredential, found, err := s.credentials.GetActiveCredential(ctx, input.InstallationID)
	if err != nil {
		return AuthStatus{}, err
	}
	if !found {
		return AuthStatus{}, domain.ErrCredentialNotFound
	}

	activePayload, keyID, err := s.encryptor.DecryptJSON(activeCredential.EncryptedPayload)
	if err != nil {
		return AuthStatus{}, fmt.Errorf("%w: %v", domain.ErrCredentialDecryptionFailed, err)
	}
	if activeCredential.EncryptionKeyID != "" && keyID != "" && activeCredential.EncryptionKeyID != keyID {
		return AuthStatus{}, domain.ErrCredentialDecryptionFailed
	}
	refreshToken, ok := credentialPayloadString(activePayload, "refresh_token")
	if !ok {
		return AuthStatus{}, domain.ErrRefreshTokenInvalid
	}

	payload, err := adapter.Refresh(ctx, RefreshCredentialAdapterInput{
		InstallationID: input.InstallationID,
		RefreshToken:   refreshToken,
	})
	if err != nil {
		return AuthStatus{}, err
	}
	if strings.TrimSpace(payload.RefreshToken) == "" {
		payload.RefreshToken = refreshToken
	}
	if strings.TrimSpace(payload.ProviderAccountID) == "" {
		payload.ProviderAccountID = firstNonEmpty(session.ProviderAccountID, inst.ExternalAccountID)
	}

	if err := s.saveCredential(ctx, input.InstallationID, payload); err != nil {
		return AuthStatus{}, err
	}

	now := s.clock.Now().UTC()
	if _, err := s.authSessions.Upsert(ctx, UpsertAuthSessionInput{
		AuthSessionID:        firstNonEmpty(session.AuthSessionID, fmt.Sprintf("auth_%s", input.InstallationID)),
		InstallationID:       input.InstallationID,
		ProviderAccountID:    payload.ProviderAccountID,
		State:                domain.AuthStateValid,
		AccessTokenExpiresAt: payload.ExpiresAt,
		LastVerifiedAt:       &now,
		RefreshFailureCode:   "",
		ConsecutiveFailures:  0,
		NextRetryAt:          nil,
	}); err != nil {
		return AuthStatus{}, err
	}

	if err := s.installations.UpdateStatus(ctx, input.InstallationID, domain.InstallationStatusConnected, domain.HealthStatusHealthy); err != nil {
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

func (s *CredentialService) GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error) {
	return s.store.GetActiveCredential(ctx, installationID)
}

func (s *AuthService) GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error) {
	return s.store.GetAuthSession(ctx, installationID)
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

func (s *AuthFlowService) verifyAndConsumeCallbackState(ctx context.Context, state string, expectedInstallationID string) (OAuthStatePayload, string, error) {
	payload, err := s.oauthStateCodec.DecodeAndVerify(state)
	if err != nil {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if payload.TenantID == "" || payload.Nonce == "" || payload.InstallationID == "" {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if payload.TenantID != s.tenantID {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if expectedInstallationID != "" && expectedInstallationID != payload.InstallationID {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}

	stored, found, err := s.oauthStates.GetByNonce(ctx, payload.Nonce)
	if err != nil {
		return OAuthStatePayload{}, "", err
	}
	if !found {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if stored.IsExpired(s.clock.Now().UTC()) {
		return OAuthStatePayload{}, "", domain.ErrAuthStateExpired
	}
	if stored.IsConsumed() {
		return OAuthStatePayload{}, "", domain.ErrAuthStateConsumed
	}
	if stored.Nonce != payload.Nonce || stored.InstallationID != payload.InstallationID {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if stored.TenantID != "" && stored.TenantID != payload.TenantID {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if stored.HMACSignature != state {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}
	if stored.CodeVerifier == "" {
		return OAuthStatePayload{}, "", domain.ErrAuthStateInvalid
	}

	consumed, err := s.oauthStates.ConsumeNonce(ctx, stored.ID)
	if err != nil {
		return OAuthStatePayload{}, "", err
	}
	if !consumed {
		return OAuthStatePayload{}, "", domain.ErrAuthStateConsumed
	}

	return payload, stored.CodeVerifier, nil
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
		if _, reserved := reservedCredentialPayloadKeys[k]; reserved {
			continue
		}
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

func credentialPayloadString(payload map[string]any, key string) (string, bool) {
	value, ok := payload[key]
	if !ok {
		return "", false
	}
	text, ok := value.(string)
	if !ok {
		return "", false
	}
	text = strings.TrimSpace(text)
	return text, text != ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func randomOAuthToken(reader io.Reader) (string, error) {
	var buf [32]byte
	if _, err := io.ReadFull(reader, buf[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf[:]), nil
}

func pkceChallenge(codeVerifier string) string {
	digest := sha256.Sum256([]byte(codeVerifier))
	return base64.RawURLEncoding.EncodeToString(digest[:])
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
var errAuthFlowInvalidConfig = errors.New("INTEGRATIONS_AUTH_FLOW_INVALID_CONFIG")

var reservedCredentialPayloadKeys = map[string]struct{}{
	"type":                {},
	"access_token":        {},
	"refresh_token":       {},
	"api_key":             {},
	"provider_account_id": {},
}

type HMACOAuthStateCodec struct {
	key []byte
}

func NewHMACOAuthStateCodec(secret string) (*HMACOAuthStateCodec, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return nil, fmt.Errorf("%w: oauth state secret", errAuthFlowInvalidConfig)
	}
	return &HMACOAuthStateCodec{key: []byte(secret)}, nil
}

func (c *HMACOAuthStateCodec) EncodeAndSign(payload OAuthStatePayload) (string, error) {
	if payload.TenantID == "" || payload.Nonce == "" || payload.InstallationID == "" {
		return "", domain.ErrAuthStateInvalid
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	signature := c.sign(raw)
	return base64.RawURLEncoding.EncodeToString(raw) + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (c *HMACOAuthStateCodec) DecodeAndVerify(state string) (OAuthStatePayload, error) {
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	if !hmac.Equal(signature, c.sign(raw)) {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}

	var payload OAuthStatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return OAuthStatePayload{}, domain.ErrAuthStateInvalid
	}
	return payload, nil
}

func (c *HMACOAuthStateCodec) sign(payload []byte) []byte {
	mac := hmac.New(sha256.New, c.key)
	mac.Write(payload)
	return mac.Sum(nil)
}
