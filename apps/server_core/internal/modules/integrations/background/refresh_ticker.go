package background

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type expiringSessionLister interface {
	ListExpiringSessions(ctx context.Context, expiresWithin time.Duration) ([]domain.AuthSession, error)
}

type credentialRefresher interface {
	RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error)
}

type RefreshTicker struct {
	sessions      expiringSessionLister
	flow          credentialRefresher
	interval      time.Duration
	expiresWithin time.Duration
	stop          chan struct{}
}

func NewRefreshTicker(sessions expiringSessionLister, flow credentialRefresher, interval time.Duration) *RefreshTicker {
	return &RefreshTicker{
		sessions:      sessions,
		flow:          flow,
		interval:      interval,
		expiresWithin: 10 * time.Minute,
		stop:          make(chan struct{}),
	}
}

func (t *RefreshTicker) RunOnce(ctx context.Context) error {
	sessions, err := t.sessions.ListExpiringSessions(ctx, t.expiresWithin)
	if err != nil {
		return err
	}
	for _, session := range sessions {
		_, err := t.flow.RefreshCredential(ctx, application.RefreshCredentialInput{
			InstallationID: session.InstallationID,
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
