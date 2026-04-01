package unit

import (
	"testing"

	domain "marketplace-central/apps/server_core/internal/modules/connectors/domain"
)

func TestOrderedStepsHasNineEntries(t *testing.T) {
	if len(domain.OrderedSteps) != 9 {
		t.Fatalf("expected 9 ordered steps, got %d", len(domain.OrderedSteps))
	}
}

func TestSharedStepsAreFirstTwoOrderedSteps(t *testing.T) {
	if len(domain.SharedSteps) != 2 {
		t.Fatalf("expected 2 shared steps, got %d", len(domain.SharedSteps))
	}
	if domain.SharedSteps[0] != domain.StepCategory {
		t.Fatalf("expected first shared step to be %q, got %q", domain.StepCategory, domain.SharedSteps[0])
	}
	if domain.SharedSteps[1] != domain.StepBrand {
		t.Fatalf("expected second shared step to be %q, got %q", domain.StepBrand, domain.SharedSteps[1])
	}
}

func TestPerProductStepsAreRemainingSevenSteps(t *testing.T) {
	if len(domain.PerProductSteps) != 7 {
		t.Fatalf("expected 7 per-product steps, got %d", len(domain.PerProductSteps))
	}
	if domain.PerProductSteps[0] != domain.StepProduct {
		t.Fatalf("expected first per-product step to be %q, got %q", domain.StepProduct, domain.PerProductSteps[0])
	}
	if domain.PerProductSteps[6] != domain.StepActivate {
		t.Fatalf("expected last per-product step to be %q, got %q", domain.StepActivate, domain.PerProductSteps[6])
	}
}

func TestPublicationBatchDefaults(t *testing.T) {
	b := domain.PublicationBatch{
		BatchID:     "batch_1",
		TenantID:    "tenant_default",
		VTEXAccount: "mystore",
		Status:      domain.BatchStatusPending,
	}
	if b.Status != "pending" {
		t.Fatalf("expected status pending, got %q", b.Status)
	}
	if b.CompletedAt != nil {
		t.Fatalf("expected completed_at to be nil for pending batch")
	}
}

func TestVTEXEntityMappingEntityTypes(t *testing.T) {
	types := []string{
		domain.EntityTypeCategory,
		domain.EntityTypeBrand,
		domain.EntityTypeProduct,
		domain.EntityTypeSKU,
	}
	if len(types) != 4 {
		t.Fatalf("expected 4 entity types, got %d", len(types))
	}
}

func TestVTEXErrorTypesAreDefined(t *testing.T) {
	if domain.ErrVTEXValidation == nil {
		t.Fatal("ErrVTEXValidation must not be nil")
	}
	if domain.ErrVTEXNotFound == nil {
		t.Fatal("ErrVTEXNotFound must not be nil")
	}
	if domain.ErrVTEXTransient == nil {
		t.Fatal("ErrVTEXTransient must not be nil")
	}
	if domain.ErrVTEXAuth == nil {
		t.Fatal("ErrVTEXAuth must not be nil")
	}
}
