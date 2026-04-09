package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type AuthSessionStore interface {
	UpsertAuthSession(ctx context.Context, session domain.AuthSession) error
}
