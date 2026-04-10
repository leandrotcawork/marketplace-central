package background

import (
	"context"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type refreshInstallationLister struct {
	items []domain.Installation
}

func (s refreshInstallationLister) List(context.Context) ([]domain.Installation, error) {
	return append([]domain.Installation(nil), s.items...), nil
}

type refreshFlow struct {
	inputs []application.RefreshCredentialInput
}

func (s *refreshFlow) RefreshCredential(ctx context.Context, input application.RefreshCredentialInput) (application.AuthStatus, error) {
	s.inputs = append(s.inputs, input)
	return application.AuthStatus{InstallationID: input.InstallationID, Status: domain.InstallationStatusConnected}, nil
}

func TestRefreshTickerRefreshesConnectedInstallations(t *testing.T) {
	t.Parallel()

	flow := &refreshFlow{}
	job := NewRefreshTicker(refreshInstallationLister{items: []domain.Installation{
		{InstallationID: "connected", Status: domain.InstallationStatusConnected},
		{InstallationID: "draft", Status: domain.InstallationStatusDraft},
	}}, flow, time.Minute)

	if err := job.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if len(flow.inputs) != 1 || flow.inputs[0].InstallationID != "connected" {
		t.Fatalf("refresh inputs = %#v, want connected installation only", flow.inputs)
	}
}
