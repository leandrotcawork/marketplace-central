package ports

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type AuthSessionStore interface {
	UpsertAuthSession(ctx context.Context, session domain.AuthSession) error
	GetAuthSession(ctx context.Context, installationID string) (domain.AuthSession, bool, error)
	ListExpiringSessions(ctx context.Context, expiresWithin time.Duration) ([]domain.AuthSession, error)
}
