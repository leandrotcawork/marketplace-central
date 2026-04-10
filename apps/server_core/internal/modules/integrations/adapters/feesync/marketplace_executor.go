package feesync

import (
	"context"
	"errors"
	"strings"

	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	integrationports "marketplace-central/apps/server_core/internal/modules/integrations/ports"
	marketplacesports "marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

const (
	feeSyncResultOK          = "INTEGRATIONS_FEE_SYNC_OK"
	feeSyncResultUnsupported = "INTEGRATIONS_FEE_SYNC_UNSUPPORTED"
	feeSyncResultProviderErr = "INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR"
)

var _ integrationports.FeeSyncExecutor = (*MarketplaceExecutor)(nil)

type MarketplaceExecutor struct {
	repo    marketplacesports.FeeScheduleRepository
	syncers map[string]marketplacesports.FeeScheduleSyncer
}

func NewMarketplaceExecutor(repo marketplacesports.FeeScheduleRepository, syncers []marketplacesports.FeeScheduleSyncer) *MarketplaceExecutor {
	executor := &MarketplaceExecutor{
		repo:    repo,
		syncers: make(map[string]marketplacesports.FeeScheduleSyncer, len(syncers)),
	}
	for _, syncer := range syncers {
		if syncer == nil {
			continue
		}
		code := strings.TrimSpace(syncer.MarketplaceCode())
		if code == "" {
			continue
		}
		executor.syncers[code] = syncer
	}
	return executor
}

func (e *MarketplaceExecutor) Execute(ctx context.Context, installation integrationsdomain.Installation, provider integrationsdomain.ProviderDefinition) (integrationports.FeeSyncResult, error) {
	code := strings.TrimSpace(provider.ProviderCode)
	if code == "" {
		code = strings.TrimSpace(installation.ProviderCode)
	}
	if code == "" {
		return integrationports.FeeSyncResult{ResultCode: feeSyncResultUnsupported, FailureCode: feeSyncResultUnsupported}, errors.New(feeSyncResultUnsupported)
	}

	syncer, ok := e.syncers[code]
	if !ok {
		return integrationports.FeeSyncResult{ResultCode: feeSyncResultUnsupported, FailureCode: feeSyncResultUnsupported}, nil
	}

	rows, err := syncer.Sync(ctx, e.repo)
	if err != nil {
		return integrationports.FeeSyncResult{
			ResultCode:  feeSyncResultProviderErr,
			FailureCode: feeSyncResultProviderErr,
			Transient:   true,
		}, err
	}

	return integrationports.FeeSyncResult{
		RowsSynced: rows,
		ResultCode: feeSyncResultOK,
	}, nil
}
