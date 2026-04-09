package domain

import "time"

type Credential struct {
	CredentialID     string     `json:"credential_id"`
	TenantID         string     `json:"tenant_id"`
	InstallationID   string     `json:"installation_id"`
	Version          int        `json:"version"`
	SecretType       string     `json:"secret_type"`
	EncryptedPayload []byte     `json:"encrypted_payload"`
	EncryptionKeyID  string     `json:"encryption_key_id"`
	IsActive         bool       `json:"is_active"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}
