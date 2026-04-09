package domain

import "time"

type AuthSession struct {
	AuthSessionID        string     `json:"auth_session_id"`
	TenantID             string     `json:"tenant_id"`
	InstallationID       string     `json:"installation_id"`
	State                AuthState  `json:"state"`
	ProviderAccountID    string     `json:"provider_account_id"`
	AccessTokenExpiresAt *time.Time `json:"access_token_expires_at,omitempty"`
	LastVerifiedAt       *time.Time `json:"last_verified_at,omitempty"`
	RefreshFailureCode   string     `json:"refresh_failure_code"`
	ConsecutiveFailures  int        `json:"consecutive_failures"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}
