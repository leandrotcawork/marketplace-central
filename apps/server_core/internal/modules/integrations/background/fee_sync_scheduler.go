package background

import (
	"context"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type feeSyncInstallationLister interface {
	List(ctx context.Context) ([]domain.Installation, error)
}

type feeSyncProviderLookup interface {
	GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error)
}

type feeSyncStarter interface {
	StartSync(ctx context.Context, input application.StartFeeSyncInput) (application.FeeSyncAccepted, error)
}

type FeeSyncScheduler struct {
	installations feeSyncInstallationLister
	providers     feeSyncProviderLookup
	flow          feeSyncStarter
	interval      time.Duration
}

func NewFeeSyncScheduler(installations feeSyncInstallationLister, providers feeSyncProviderLookup, flow feeSyncStarter, interval time.Duration) *FeeSyncScheduler {
	return &FeeSyncScheduler{
		installations: installations,
		providers:     providers,
		flow:          flow,
		interval:      interval,
	}
}

func (s *FeeSyncScheduler) Start(ctx context.Context) {
	if s == nil || s.interval <= 0 {
		return
	}
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.RunOnce(ctx)
		}
	}
}

func (s *FeeSyncScheduler) RunOnce(ctx context.Context) error {
	if s == nil || s.installations == nil || s.providers == nil || s.flow == nil {
		return nil
	}

	installations, err := s.installations.List(ctx)
	if err != nil {
		return err
	}
	for _, inst := range installations {
		if inst.Status != domain.InstallationStatusConnected {
			continue
		}
		provider, found, err := s.providers.GetProviderDefinition(ctx, inst.ProviderCode)
		if err != nil || !found || !declaresCapability(provider.DeclaredCapabilities, "pricing_fee_sync") {
			continue
		}
		_, _ = s.flow.StartSync(ctx, application.StartFeeSyncInput{
			InstallationID: inst.InstallationID,
			ActorType:      "system",
			ActorID:        "fee_sync_scheduler",
		})
	}
	return nil
}

func declaresCapability(declared []string, capability string) bool {
	for _, item := range declared {
		if strings.TrimSpace(item) == capability {
			return true
		}
	}
	return false
}
