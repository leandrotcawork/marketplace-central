package application

import (
	"context"
	"testing"

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
	runs []domain.OperationRun
}

func (s *stubOperationRunListStore) SaveOperationRun(_ context.Context, run domain.OperationRun) error {
	s.runs = append(s.runs, run)
	return nil
}

func (s *stubOperationRunListStore) ListByInstallation(_ context.Context, installationID string) ([]domain.OperationRun, error) {
	return append([]domain.OperationRun(nil), s.runs...), nil
}
