package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type CredentialStore interface {
	NextCredentialVersion(ctx context.Context, installationID string) (int, error)
	SaveCredentialVersion(ctx context.Context, cred domain.Credential) error
}
