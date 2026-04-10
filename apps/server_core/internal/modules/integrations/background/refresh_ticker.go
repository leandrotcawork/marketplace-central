package background

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type installationLister interface {
	List(ctx context.Context) ([]domain.Installation, error)
}

type credentialRefresher interface {
	RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error)
}

type RefreshTicker struct {
	installations installationLister
	flow          credentialRefresher
	interval      time.Duration
	stop          chan struct{}
}

func NewRefreshTicker(installations installationLister, flow credentialRefresher, interval time.Duration) *RefreshTicker {
	return &RefreshTicker{
		installations: installations,
		flow:          flow,
		interval:      interval,
		stop:          make(chan struct{}),
	}
}

func (t *RefreshTicker) RunOnce(ctx context.Context) error {
	installations, err := t.installations.List(ctx)
	if err != nil {
		return err
	}
	for _, installation := range installations {
		if installation.Status != domain.InstallationStatusConnected {
			continue
		}
		_, err := t.flow.RefreshCredential(ctx, application.RefreshCredentialInput{
			InstallationID: installation.InstallationID,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func (t *RefreshTicker) Start(ctx context.Context) {
	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.stop:
			return
		case <-ticker.C:
			_ = t.RunOnce(ctx)
		}
	}
}

func (t *RefreshTicker) Stop() {
	select {
	case <-t.stop:
	default:
		close(t.stop)
	}
}
