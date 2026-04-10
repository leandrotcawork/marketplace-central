package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type CredentialStore interface {
	NextCredentialVersion(ctx context.Context, installationID string) (int, error)
	SaveCredentialVersion(ctx context.Context, cred domain.Credential) error
	GetActiveCredential(ctx context.Context, installationID string) (domain.Credential, bool, error)
	DeactivateCredential(ctx context.Context, credentialID string) error
	DeactivateAllForInstallation(ctx context.Context, installationID string) error
}
