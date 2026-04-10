package domain

import "time"

type OAuthState struct {
	ID             string     `json:"id"`
	TenantID       string     `json:"tenant_id"`
	InstallationID string     `json:"installation_id"`
	Nonce          string     `json:"nonce"`
	CodeVerifier   string     `json:"code_verifier"`
	HMACSignature  string     `json:"hmac_signature"`
	ExpiresAt      time.Time  `json:"expires_at"`
	ConsumedAt     *time.Time `json:"consumed_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

func (s OAuthState) IsExpired(now time.Time) bool {
	return now.After(s.ExpiresAt)
}

func (s OAuthState) IsConsumed() bool {
	return s.ConsumedAt != nil
}
