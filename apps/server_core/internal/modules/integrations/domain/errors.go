package domain

import "errors"

var (
	ErrAuthProviderNotOAuth    = errors.New("INTEGRATIONS_AUTH_PROVIDER_NOT_OAUTH")
	ErrAuthStateInvalid        = errors.New("INTEGRATIONS_AUTH_STATE_INVALID")
	ErrAuthStateExpired        = errors.New("INTEGRATIONS_AUTH_STATE_EXPIRED")
	ErrAuthStateConsumed       = errors.New("INTEGRATIONS_AUTH_STATE_CONSUMED")
	ErrAuthCodeExchangeFailed  = errors.New("INTEGRATIONS_AUTH_CODE_EXCHANGE_FAILED")
	ErrAuthProviderUnreachable = errors.New("INTEGRATIONS_AUTH_PROVIDER_UNREACHABLE")
	ErrAuthScopesInsufficient  = errors.New("INTEGRATIONS_AUTH_SCOPES_INSUFFICIENT")
)

var (
	ErrInstallationInvalidTransition = errors.New("INTEGRATIONS_INSTALLATION_INVALID_TRANSITION")
	ErrInstallationNotFound          = errors.New("INTEGRATIONS_INSTALLATION_NOT_FOUND")
	ErrInstallationWrongStatus       = errors.New("INTEGRATIONS_INSTALLATION_WRONG_STATUS")
	ErrInstallationAlreadyConnected  = errors.New("INTEGRATIONS_INSTALLATION_ALREADY_CONNECTED")
)

var (
	ErrReauthAccountMismatch = errors.New("INTEGRATIONS_REAUTH_ACCOUNT_MISMATCH")
	ErrReauthCooldownActive  = errors.New("INTEGRATIONS_REAUTH_COOLDOWN_ACTIVE")
)

var (
	ErrCredentialValidationFailed = errors.New("INTEGRATIONS_CREDENTIAL_VALIDATION_FAILED")
	ErrCredentialEncryptionFailed = errors.New("INTEGRATIONS_CREDENTIAL_ENCRYPTION_FAILED")
	ErrCredentialDecryptionFailed = errors.New("INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED")
	ErrCredentialNotFound         = errors.New("INTEGRATIONS_CREDENTIAL_NOT_FOUND")
)

var (
	ErrRefreshTokenInvalid   = errors.New("INTEGRATIONS_REFRESH_TOKEN_INVALID")
	ErrRefreshRateLimited    = errors.New("INTEGRATIONS_REFRESH_RATE_LIMITED")
	ErrRefreshProviderError  = errors.New("INTEGRATIONS_REFRESH_PROVIDER_ERROR")
	ErrRefreshMaxFailures    = errors.New("INTEGRATIONS_REFRESH_MAX_FAILURES")
	ErrRefreshLockContention = errors.New("INTEGRATIONS_REFRESH_LOCK_CONTENTION")
)

var (
	ErrAPIKeyValidationFailed = errors.New("INTEGRATIONS_APIKEY_VALIDATION_FAILED")
	ErrAPIKeyMissingFields    = errors.New("INTEGRATIONS_APIKEY_MISSING_FIELDS")
)

var (
	ErrDisconnectAlreadyDisconnected = errors.New("INTEGRATIONS_DISCONNECT_ALREADY_DISCONNECTED")
	ErrDisconnectRevocationFailed    = errors.New("INTEGRATIONS_DISCONNECT_REVOCATION_FAILED")
)

var ErrNotSupported = errors.New("INTEGRATIONS_OPERATION_NOT_SUPPORTED")
