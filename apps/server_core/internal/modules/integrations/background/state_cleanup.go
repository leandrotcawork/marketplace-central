package background

import (
	"context"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stalePendingStore interface {
	List(ctx context.Context) ([]domain.Installation, error)
	UpdateStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error
}

type StateCleanup struct {
	store    stalePendingStore
	maxAge   time.Duration
	interval time.Duration
	stop     chan struct{}
}

func NewStateCleanup(store stalePendingStore, maxAge time.Duration) *StateCleanup {
	return &StateCleanup{
		store:    store,
		maxAge:   maxAge,
		interval: 15 * time.Minute,
		stop:     make(chan struct{}),
	}
}

func (s *StateCleanup) RunOnceAt(ctx context.Context, now time.Time) error {
	installations, err := s.store.List(ctx)
	if err != nil {
		return err
	}
	for _, installation := range installations {
		if installation.Status != domain.InstallationStatusPendingConnection {
			continue
		}
		if now.Sub(installation.UpdatedAt) < s.maxAge {
			continue
		}
		if err := s.store.UpdateStatus(ctx, installation.InstallationID, domain.InstallationStatusFailed, domain.HealthStatusWarning); err != nil {
			return err
		}
	}
	return nil
}

func (s *StateCleanup) RunOnce(ctx context.Context) error {
	return s.RunOnceAt(ctx, time.Now().UTC())
}

func (s *StateCleanup) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stop:
			return
		case <-ticker.C:
			_ = s.RunOnce(ctx)
		}
	}
}

func (s *StateCleanup) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}
