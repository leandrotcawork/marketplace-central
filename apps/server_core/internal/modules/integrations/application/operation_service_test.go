package application

import (
	"context"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

func TestOperationServiceListByInstallationReturnsRuns(t *testing.T) {
	t.Parallel()

	store := &stubOperationRunListStore{
		runs: []domain.OperationRun{
			{
				OperationRunID: "run_001",
				InstallationID: "inst_001",
			},
		},
	}
	svc := NewOperationService(store, "tenant-default")

	runs, err := svc.ListByInstallation(context.Background(), "inst_001")
	if err != nil {
		t.Fatalf("ListByInstallation() error = %v", err)
	}

	if len(runs) != 1 {
		t.Fatalf("runs = %d, want 1", len(runs))
	}
	if got, want := runs[0].OperationRunID, "run_001"; got != want {
		t.Fatalf("operation_run_id = %q, want %q", got, want)
	}
	if got, want := runs[0].InstallationID, "inst_001"; got != want {
		t.Fatalf("installation_id = %q, want %q", got, want)
	}
	if got, want := store.lastInstallationID, "inst_001"; got != want {
		t.Fatalf("forwarded installation_id = %q, want %q", got, want)
	}
}

func TestOperationServiceListByInstallationRejectsEmptyInstallationID(t *testing.T) {
	t.Parallel()

	svc := NewOperationService(&stubOperationRunListStore{}, "tenant-default")

	_, err := svc.ListByInstallation(context.Background(), " ")
	if err == nil {
		t.Fatal("ListByInstallation() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_OPERATION_INVALID"; got != want {
		t.Fatalf("ListByInstallation() error = %q, want %q", got, want)
	}
}

type stubOperationRunListStore struct {
	runs               []domain.OperationRun
	lastInstallationID string
}

func (s *stubOperationRunListStore) SaveOperationRun(_ context.Context, run domain.OperationRun) error {
	s.runs = append(s.runs, run)
	return nil
}

func (s *stubOperationRunListStore) ListByInstallation(_ context.Context, installationID string) ([]domain.OperationRun, error) {
	s.lastInstallationID = installationID
	return append([]domain.OperationRun(nil), s.runs...), nil
}

func TestOperationServiceRecordMapsRichFields(t *testing.T) {
	t.Parallel()

	startedAt := time.Unix(100, 0).UTC()
	completedAt := time.Unix(200, 0).UTC()
	store := &stubOperationRunListStore{}
	svc := NewOperationService(store, "tenant-default")

	run, err := svc.Record(context.Background(), RecordOperationInput{
		OperationRunID: "run_002",
		InstallationID: "inst_002",
		OperationType:  "pricing_fee_sync",
		Status:         domain.OperationRunStatusRunning,
		ResultCode:     "INTEGRATIONS_OPERATION_RUNNING",
		FailureCode:    "INTEGRATIONS_OPERATION_TIMEOUT",
		AttemptCount:   3,
		ActorType:      "system",
		ActorID:        "scheduler",
		StartedAt:      &startedAt,
		CompletedAt:    &completedAt,
	})
	if err != nil {
		t.Fatalf("Record() error = %v", err)
	}

	if got, want := run.FailureCode, "INTEGRATIONS_OPERATION_TIMEOUT"; got != want {
		t.Fatalf("failure_code = %q, want %q", got, want)
	}
	if got, want := run.ActorType, "system"; got != want {
		t.Fatalf("actor_type = %q, want %q", got, want)
	}
	if got, want := run.ActorID, "scheduler"; got != want {
		t.Fatalf("actor_id = %q, want %q", got, want)
	}
	if run.StartedAt == nil || !run.StartedAt.Equal(startedAt) {
		t.Fatalf("started_at = %v, want %v", run.StartedAt, startedAt)
	}
	if run.CompletedAt == nil || !run.CompletedAt.Equal(completedAt) {
		t.Fatalf("completed_at = %v, want %v", run.CompletedAt, completedAt)
	}
	if len(store.runs) != 1 {
		t.Fatalf("saved runs = %d, want 1", len(store.runs))
	}
	if got, want := store.runs[0], run; got != want {
		t.Fatalf("saved run = %#v, want %#v", got, want)
	}
}
