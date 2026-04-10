package background

import (
	"context"
	"time"
)

type oauthStateStore interface {
	DeleteExpired(ctx context.Context, olderThan time.Time) (int64, error)
}

type StateCleanup struct {
	store     oauthStateStore
	retention time.Duration
	interval  time.Duration
	stop      chan struct{}
}

func NewStateCleanup(store oauthStateStore, retention time.Duration) *StateCleanup {
	return &StateCleanup{
		store:     store,
		retention: retention,
		interval:  15 * time.Minute,
		stop:      make(chan struct{}),
	}
}

func (s *StateCleanup) RunOnceAt(ctx context.Context, now time.Time) error {
	cutoff := now.Add(-s.retention)
	_, err := s.store.DeleteExpired(ctx, cutoff)
	return err
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
