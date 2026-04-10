package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type InstallationRepository interface {
	CreateInstallation(ctx context.Context, inst domain.Installation) error
	GetInstallation(ctx context.Context, installationID string) (domain.Installation, bool, error)
	ListInstallations(ctx context.Context) ([]domain.Installation, error)
	UpdateInstallationStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error
	UpdateActiveCredentialID(ctx context.Context, installationID string, credentialID string) error
	SetProviderAccountID(ctx context.Context, installationID, providerAccountID, providerAccountName string) error
}
