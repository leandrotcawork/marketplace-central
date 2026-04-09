package application

import (
	"context"
	"errors"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type RotateCredentialInput struct {
	CredentialID     string
	InstallationID   string
	SecretType       string
	EncryptedPayload []byte
	EncryptionKeyID  string
}

type CredentialService struct {
	store    ports.CredentialStore
	tenantID string
}

func NewCredentialService(store ports.CredentialStore, tenantID string) *CredentialService {
	return &CredentialService{store: store, tenantID: tenantID}
}

func (s *CredentialService) Rotate(ctx context.Context, input RotateCredentialInput) (domain.Credential, error) {
	if input.CredentialID == "" || input.InstallationID == "" || input.SecretType == "" || len(input.EncryptedPayload) == 0 || input.EncryptionKeyID == "" {
		return domain.Credential{}, errors.New("INTEGRATIONS_CREDENTIAL_INVALID")
	}

	version, err := s.store.NextCredentialVersion(ctx, input.InstallationID)
	if err != nil {
		return domain.Credential{}, err
	}

	now := time.Now().UTC()
	cred := domain.Credential{
		CredentialID:     input.CredentialID,
		TenantID:         s.tenantID,
		InstallationID:   input.InstallationID,
		Version:          version,
		SecretType:       input.SecretType,
		EncryptedPayload: append([]byte(nil), input.EncryptedPayload...),
		EncryptionKeyID:  input.EncryptionKeyID,
		IsActive:         true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	return cred, s.store.SaveCredentialVersion(ctx, cred)
}
