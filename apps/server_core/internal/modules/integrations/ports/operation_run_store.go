package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type OperationRunStore interface {
	SaveOperationRun(ctx context.Context, run domain.OperationRun) error
}
