package ports

import (
	"context"

	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type FeeSyncResult struct {
	RowsSynced     int
	ResultCode     string
	FailureCode    string
	Transient      bool
	RequiresReauth bool
}

type FeeSyncExecutor interface {
	Execute(ctx context.Context, installation integrationsdomain.Installation, provider integrationsdomain.ProviderDefinition) (FeeSyncResult, error)
}
