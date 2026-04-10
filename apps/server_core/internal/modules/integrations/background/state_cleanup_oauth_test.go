package background

import (
	"context"
	"testing"
	"time"
)

type cleanupOAuthStateStore struct {
	deleted   int64
	cutoff    time.Time
	callCount int
}

func (s *cleanupOAuthStateStore) DeleteExpired(_ context.Context, cutoff time.Time) (int64, error) {
	s.callCount++
	s.cutoff = cutoff
	return s.deleted, nil
}

func TestStateCleanupDeletesExpiredOAuthStates(t *testing.T) {
	t.Parallel()

	now := time.Unix(3000, 0).UTC()
	store := &cleanupOAuthStateStore{deleted: 3}
	job := NewStateCleanup(store, time.Hour)

	if err := job.RunOnceAt(context.Background(), now); err != nil {
		t.Fatalf("RunOnceAt() error = %v", err)
	}
	if store.callCount != 1 {
		t.Fatalf("delete call count = %d, want 1", store.callCount)
	}

	wantCutoff := now.Add(-1 * time.Hour)
	if !store.cutoff.Equal(wantCutoff) {
		t.Fatalf("delete cutoff = %s, want %s", store.cutoff, wantCutoff)
	}
}
