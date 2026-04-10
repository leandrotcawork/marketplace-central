package ports

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type OAuthStateStore interface {
	Save(ctx context.Context, state domain.OAuthState) error
	GetByNonce(ctx context.Context, nonce string) (domain.OAuthState, bool, error)
	ConsumeNonce(ctx context.Context, id string) (bool, error)
	DeleteExpired(ctx context.Context, olderThan time.Time) (int64, error)
}
