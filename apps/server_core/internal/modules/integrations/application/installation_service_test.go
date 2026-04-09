package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type stubInstallationRepo struct {
	saved    []domain.Installation
	list     []domain.Installation
	updated  []installationStatusUpdate
	getByID  map[string]domain.Installation
}

type installationStatusUpdate struct {
	installationID string
	status         domain.InstallationStatus
	health         domain.HealthStatus
}

func (s *stubInstallationRepo) CreateInstallation(_ context.Context, inst domain.Installation) error {
	s.saved = append(s.saved, inst)
	return nil
}

func (s *stubInstallationRepo) GetInstallation(_ context.Context, installationID string) (domain.Installation, bool, error) {
	if s.getByID != nil {
		inst, ok := s.getByID[installationID]
		if ok {
			return inst, true, nil
		}
	}
	for _, inst := range s.list {
		if inst.InstallationID == installationID {
			return inst, true, nil
		}
	}
	return domain.Installation{}, false, nil
}

func (s *stubInstallationRepo) ListInstallations(_ context.Context) ([]domain.Installation, error) {
	return append([]domain.Installation(nil), s.list...), nil
}

func (s *stubInstallationRepo) UpdateInstallationStatus(_ context.Context, installationID string, status domain.InstallationStatus, health domain.HealthStatus) error {
	s.updated = append(s.updated, installationStatusUpdate{
		installationID: installationID,
		status:         status,
		health:         health,
	})
	return nil
}

func TestCreateDraftInstallation(t *testing.T) {
	t.Parallel()

	repo := &stubInstallationRepo{}
	svc := NewInstallationService(repo, "tenant-default")

	inst, err := svc.CreateDraft(context.Background(), CreateInstallationInput{
		InstallationID: "inst_001",
		ProviderCode:   "mercado_livre",
		DisplayName:    "ML Primary",
		Family:         string(domain.IntegrationFamilyMarketplace),
	})
	if err != nil {
		t.Fatalf("CreateDraft() error = %v", err)
	}

	if inst.Status != domain.InstallationStatusDraft {
		t.Fatalf("installation status = %q, want %q", inst.Status, domain.InstallationStatusDraft)
	}
	if inst.HealthStatus != domain.HealthStatusHealthy {
		t.Fatalf("installation health = %q, want %q", inst.HealthStatus, domain.HealthStatusHealthy)
	}
	if inst.TenantID != "tenant-default" {
		t.Fatalf("tenant_id = %q, want %q", inst.TenantID, "tenant-default")
	}
	if len(repo.saved) != 1 {
		t.Fatalf("saved installations = %d, want 1", len(repo.saved))
	}
	if got := repo.saved[0]; got.InstallationID != "inst_001" || got.ProviderCode != "mercado_livre" || got.DisplayName != "ML Primary" || got.Family != domain.IntegrationFamilyMarketplace {
		t.Fatalf("saved installation = %#v, want installation draft fields to match", got)
	}
}

func TestCreateDraftInstallationRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	svc := NewInstallationService(&stubInstallationRepo{}, "tenant-default")

	_, err := svc.CreateDraft(context.Background(), CreateInstallationInput{})
	if err == nil {
		t.Fatal("CreateDraft() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_INSTALLATION_INVALID"; got != want {
		t.Fatalf("CreateDraft() error = %q, want %q", got, want)
	}
}

func TestInstallationServiceGetListAndUpdateStatus(t *testing.T) {
	t.Parallel()

	now := time.Unix(100, 0).UTC()
	repo := &stubInstallationRepo{
		list: []domain.Installation{{
			InstallationID: "inst_001",
			TenantID:       "tenant-default",
			ProviderCode:   "mercado_livre",
			Family:         domain.IntegrationFamilyMarketplace,
			DisplayName:    "ML Primary",
			Status:         domain.InstallationStatusConnected,
			HealthStatus:   domain.HealthStatusHealthy,
			CreatedAt:      now,
			UpdatedAt:      now,
		}},
		getByID: map[string]domain.Installation{
			"inst_001": {
				InstallationID: "inst_001",
				TenantID:       "tenant-default",
				ProviderCode:   "mercado_livre",
				Family:         domain.IntegrationFamilyMarketplace,
				DisplayName:    "ML Primary",
				Status:         domain.InstallationStatusConnected,
				HealthStatus:   domain.HealthStatusHealthy,
				CreatedAt:      now,
				UpdatedAt:      now,
			},
		},
	}
	svc := NewInstallationService(repo, "tenant-default")

	inst, ok, err := svc.Get(context.Background(), "inst_001")
	if err != nil || !ok {
		t.Fatalf("Get() = (%#v, %v, %v), want installation, true, nil", inst, ok, err)
	}
	if inst.InstallationID != "inst_001" {
		t.Fatalf("Get() installation_id = %q, want %q", inst.InstallationID, "inst_001")
	}

	items, err := svc.List(context.Background())
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !reflect.DeepEqual(items, repo.list) {
		t.Fatalf("List() = %#v, want %#v", items, repo.list)
	}

	if err := svc.UpdateStatus(context.Background(), "inst_001", domain.InstallationStatusDegraded, domain.HealthStatusWarning); err != nil {
		t.Fatalf("UpdateStatus() error = %v", err)
	}
	if got, want := repo.updated, []installationStatusUpdate{{installationID: "inst_001", status: domain.InstallationStatusDegraded, health: domain.HealthStatusWarning}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("UpdateStatus() calls = %#v, want %#v", got, want)
	}
}

func TestInstallationServiceRejectsInvalidUpdateStatus(t *testing.T) {
	t.Parallel()

	svc := NewInstallationService(&stubInstallationRepo{}, "tenant-default")

	err := svc.UpdateStatus(context.Background(), "", domain.InstallationStatusDraft, domain.HealthStatusHealthy)
	if err == nil {
		t.Fatal("UpdateStatus() error = nil, want invalid input error")
	}
	if got, want := err.Error(), "INTEGRATIONS_INSTALLATION_INVALID"; got != want {
		t.Fatalf("UpdateStatus() error = %q, want %q", err.Error(), "INTEGRATIONS_INSTALLATION_INVALID")
	}
}
