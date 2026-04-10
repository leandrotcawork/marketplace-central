package background

import (
	"context"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/application"
	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

func TestFeeSyncSchedulerStartsSyncForEligibleInstallations(t *testing.T) {
	t.Parallel()

	installations := schedulerInstallationLister{items: []domain.Installation{{InstallationID: "inst_connected", ProviderCode: "mercado_livre", Status: domain.InstallationStatusConnected}}}
	providers := schedulerProviderLookup{items: map[string]domain.ProviderDefinition{"mercado_livre": {ProviderCode: "mercado_livre", DeclaredCapabilities: []string{"pricing_fee_sync"}}}}
	service := &schedulerFeeSyncStarter{}
	job := NewFeeSyncScheduler(installations, providers, service, time.Minute)

	if err := job.RunOnce(context.Background()); err != nil || len(service.inputs) != 1 {
		t.Fatalf("inputs=%#v err=%v", service.inputs, err)
	}
}

func TestFeeSyncSchedulerSkipsIneligibleInstallations(t *testing.T) {
	t.Parallel()

	installations := schedulerInstallationLister{items: []domain.Installation{
		{InstallationID: "inst_disconnected", ProviderCode: "mercado_livre", Status: domain.InstallationStatusDisconnected},
		{InstallationID: "inst_no_cap", ProviderCode: "shopee", Status: domain.InstallationStatusConnected},
	}}
	providers := schedulerProviderLookup{items: map[string]domain.ProviderDefinition{
		"mercado_livre": {ProviderCode: "mercado_livre", DeclaredCapabilities: []string{"pricing_fee_sync"}},
		"shopee":       {ProviderCode: "shopee", DeclaredCapabilities: []string{"inventory_sync"}},
	}}
	service := &schedulerFeeSyncStarter{}
	job := NewFeeSyncScheduler(installations, providers, service, time.Minute)

	if err := job.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if len(service.inputs) != 0 {
		t.Fatalf("inputs=%#v, want none", service.inputs)
	}
}

type schedulerInstallationLister struct {
	items []domain.Installation
	err   error
}

func (s schedulerInstallationLister) List(context.Context) ([]domain.Installation, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]domain.Installation(nil), s.items...), nil
}

type schedulerProviderLookup struct {
	items map[string]domain.ProviderDefinition
}

func (s schedulerProviderLookup) GetProviderDefinition(_ context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	item, ok := s.items[providerCode]
	return item, ok, nil
}

type schedulerFeeSyncStarter struct {
	inputs []application.StartFeeSyncInput
}

func (s *schedulerFeeSyncStarter) StartSync(_ context.Context, input application.StartFeeSyncInput) (application.FeeSyncAccepted, error) {
	s.inputs = append(s.inputs, input)
	return application.FeeSyncAccepted{InstallationID: input.InstallationID, OperationRunID: "run_sched", Status: domain.OperationRunStatusQueued}, nil
}
