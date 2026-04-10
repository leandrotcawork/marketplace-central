package background

import (
	"context"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type cleanupStore struct {
	items    []domain.Installation
	updates []domain.InstallationStatus
}

func (s *cleanupStore) List(context.Context) ([]domain.Installation, error) {
	return append([]domain.Installation(nil), s.items...), nil
}

func (s *cleanupStore) UpdateStatus(ctx context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	s.updates = append(s.updates, status)
	return nil
}

func TestStateCleanupFailsStalePendingConnections(t *testing.T) {
	t.Parallel()

	now := time.Unix(3000, 0).UTC()
	store := &cleanupStore{items: []domain.Installation{
		{InstallationID: "stale", Status: domain.InstallationStatusPendingConnection, UpdatedAt: now.Add(-2 * time.Hour)},
		{InstallationID: "fresh", Status: domain.InstallationStatusPendingConnection, UpdatedAt: now.Add(-5 * time.Minute)},
	}}
	job := NewStateCleanup(store, time.Hour)

	if err := job.RunOnceAt(context.Background(), now); err != nil {
		t.Fatalf("RunOnceAt() error = %v", err)
	}
	if len(store.updates) != 1 || store.updates[0] != domain.InstallationStatusFailed {
		t.Fatalf("updates = %#v, want one failed update", store.updates)
	}
}
