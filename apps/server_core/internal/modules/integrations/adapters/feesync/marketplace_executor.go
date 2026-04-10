package feesync

import (
	"context"
	"errors"
	"strings"

	connectorsdomain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	integrationports "marketplace-central/apps/server_core/internal/modules/integrations/ports"
	marketplacesports "marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
	marketplacesregistry "marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
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
	code := resolveProviderCode(provider, installation)
	if code == "" {
		return unsupportedResult(), nil
	}

	source := resolveFeeSource(code, provider)
	if source != "api_sync" && source != "seed" {
		return unsupportedResult(), nil
	}

	syncer, ok := e.syncers[code]
	if !ok {
		return unsupportedResult(), nil
	}

	rows, err := syncer.Sync(ctx, e.repo)
	if err != nil {
		requiresReauth, transient := classifyFeeSyncError(err)
		return integrationports.FeeSyncResult{
			ResultCode:     feeSyncResultProviderErr,
			FailureCode:    feeSyncResultProviderErr,
			RequiresReauth: requiresReauth,
			Transient:      transient,
		}, err
	}

	return integrationports.FeeSyncResult{
		RowsSynced: rows,
		ResultCode: feeSyncResultOK,
	}, nil
}

func resolveProviderCode(provider integrationsdomain.ProviderDefinition, installation integrationsdomain.Installation) string {
	if code := strings.TrimSpace(provider.ProviderCode); code != "" {
		return code
	}
	return strings.TrimSpace(installation.ProviderCode)
}

func resolveFeeSource(providerCode string, provider integrationsdomain.ProviderDefinition) string {
	if provider.Metadata != nil {
		if raw, ok := provider.Metadata["fee_source"]; ok {
			if source, ok := raw.(string); ok {
				source = strings.ToLower(strings.TrimSpace(source))
				if source != "" {
					return source
				}
			}
		}
	}

	if providerCode == "" {
		return ""
	}

	if plugin, ok := marketplacesregistry.Get(providerCode); ok {
		return strings.ToLower(strings.TrimSpace(plugin.Definition().FeeSource))
	}

	return ""
}

func classifyFeeSyncError(err error) (requiresReauth bool, transient bool) {
	if err == nil {
		return false, false
	}
	if errors.Is(err, connectorsdomain.ErrVTEXAuth) || errors.Is(err, integrationsdomain.ErrReauthAccountMismatch) {
		return true, false
	}
	return false, true
}

func unsupportedResult() integrationports.FeeSyncResult {
	return integrationports.FeeSyncResult{
		ResultCode:  feeSyncResultUnsupported,
		FailureCode: feeSyncResultUnsupported,
	}
}
