package background

import (
	"context"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type refreshSessionStore struct {
	items []domain.AuthSession
}

func (s refreshSessionStore) ListExpiringSessions(context.Context, time.Duration) ([]domain.AuthSession, error) {
	return append([]domain.AuthSession(nil), s.items...), nil
}

type refreshFlow struct {
	inputs []application.RefreshCredentialInput
}

func (s *refreshFlow) RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error) {
	s.inputs = append(s.inputs, input)
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusConnected}, nil
}

func TestRefreshTickerUsesListExpiringSessions(t *testing.T) {
	t.Parallel()

	flow := &refreshFlow{}
	job := NewRefreshTicker(refreshSessionStore{items: []domain.AuthSession{
		{InstallationID: "installation_expiring_1"},
		{InstallationID: "installation_expiring_2"},
	}}, flow, time.Minute)

	if err := job.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if len(flow.inputs) != 2 {
		t.Fatalf("refresh count = %d, want 2", len(flow.inputs))
	}
	if flow.inputs[0].InstallationID != "installation_expiring_1" || flow.inputs[1].InstallationID != "installation_expiring_2" {
		t.Fatalf("refresh inputs = %#v, want expiring-session installation IDs", flow.inputs)
	}
}
