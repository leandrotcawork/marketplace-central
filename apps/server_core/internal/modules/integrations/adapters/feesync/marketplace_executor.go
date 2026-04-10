package feesync

import (
	"context"
	"errors"
	"strings"
	"time"

	connectorsdomain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	integrationports "marketplace-central/apps/server_core/internal/modules/integrations/ports"
	marketplacesdomain "marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
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
	switch source {
	case "api_sync":
		return e.executeAPISync(ctx, code)
	case "seed":
		return e.executeSeedSync(ctx, code)
	default:
		return unsupportedResult(), nil
	}
}

func (e *MarketplaceExecutor) executeAPISync(ctx context.Context, code string) (integrationports.FeeSyncResult, error) {
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

func (e *MarketplaceExecutor) executeSeedSync(ctx context.Context, code string) (integrationports.FeeSyncResult, error) {
	if syncer, ok := e.syncers[code]; ok {
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

	return e.seedFromRegistryDefinition(ctx, code)
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

func (e *MarketplaceExecutor) seedFromRegistryDefinition(ctx context.Context, code string) (integrationports.FeeSyncResult, error) {
	plugin, ok := marketplacesregistry.Get(code)
	if !ok {
		return unsupportedResult(), nil
	}

	definition := plugin.Definition()
	if strings.ToLower(strings.TrimSpace(definition.FeeSource)) != "seed" {
		return unsupportedResult(), nil
	}

	schedules, ok := deterministicSeedSchedules(code)
	if !ok {
		return unsupportedResult(), nil
	}

	fixedSyncedAt := time.Unix(0, 0).UTC()
	for i := range schedules {
		schedules[i].SyncedAt = fixedSyncedAt
	}

	if err := e.repo.UpsertSchedules(ctx, schedules); err != nil {
		requiresReauth, transient := classifyFeeSyncError(err)
		return integrationports.FeeSyncResult{
			ResultCode:     feeSyncResultProviderErr,
			FailureCode:    feeSyncResultProviderErr,
			RequiresReauth: requiresReauth,
			Transient:      transient,
		}, err
	}

	return integrationports.FeeSyncResult{
		RowsSynced: len(schedules),
		ResultCode: feeSyncResultOK,
	}, nil
}

func deterministicSeedSchedules(code string) ([]marketplacesdomain.FeeSchedule, bool) {
	switch code {
	case "amazon":
		return []marketplacesdomain.FeeSchedule{
			{
				MarketplaceCode:   "amazon",
				CategoryID:        "default",
				CommissionPercent: 0.12,
				FixedFeeAmount:    0,
				Notes:             "deterministic seed fallback",
				Source:            "seeded",
			},
		}, true
	case "madeira_madeira":
		return []marketplacesdomain.FeeSchedule{
			{
				MarketplaceCode:   "madeira_madeira",
				CategoryID:        "default",
				CommissionPercent: 0.15,
				FixedFeeAmount:    0,
				Notes:             "deterministic seed fallback",
				Source:            "seeded",
			},
		}, true
	case "leroy_merlin":
		return []marketplacesdomain.FeeSchedule{
			{
				MarketplaceCode:   "leroy_merlin",
				CategoryID:        "default",
				CommissionPercent: 0.18,
				FixedFeeAmount:    0,
				Notes:             "deterministic seed fallback",
				Source:            "seeded",
			},
		}, true
	default:
		return nil, false
	}
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
