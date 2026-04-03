package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/classifications/application"
	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
)

type classificationsRepoStub struct {
	created domain.Classification
	items   []domain.Classification
}

func (s *classificationsRepoStub) List(_ context.Context) ([]domain.Classification, error) {
	return s.items, nil
}

func (s *classificationsRepoStub) GetByID(_ context.Context, id string) (domain.Classification, error) {
	return domain.Classification{}, nil
}

func (s *classificationsRepoStub) Create(_ context.Context, c domain.Classification) error {
	s.created = c
	return nil
}

func (s *classificationsRepoStub) Update(_ context.Context, c domain.Classification) error {
	return nil
}

func (s *classificationsRepoStub) Delete(_ context.Context, id string) error {
	return nil
}

func TestClassificationsServiceCreateValidatesName(t *testing.T) {
	repo := &classificationsRepoStub{}
	svc := application.NewService(repo, "tenant_default")

	_, err := svc.Create(context.Background(), application.CreateInput{
		Name:       "",
		AIContext:  "some context",
		ProductIDs: []string{"p1"},
	})
	if err == nil {
		t.Fatal("expected error for empty name, got nil")
	}
	if err.Error() != "CLASSIFICATIONS_CREATE_NAME_REQUIRED" {
		t.Fatalf("expected CLASSIFICATIONS_CREATE_NAME_REQUIRED, got %q", err.Error())
	}
}

func TestClassificationsServiceCreateSuccess(t *testing.T) {
	repo := &classificationsRepoStub{}
	svc := application.NewService(repo, "tenant_default")

	c, err := svc.Create(context.Background(), application.CreateInput{
		Name:       "Electronics",
		AIContext:  "Consumer electronics products",
		ProductIDs: []string{"p1", "p2", "p3"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.Name != "Electronics" {
		t.Fatalf("expected name 'Electronics', got %q", c.Name)
	}
	if c.TenantID != "tenant_default" {
		t.Fatalf("expected tenant_id 'tenant_default', got %q", c.TenantID)
	}
	if c.AIContext != "Consumer electronics products" {
		t.Fatalf("expected ai_context 'Consumer electronics products', got %q", c.AIContext)
	}
	if c.ProductCount != 3 {
		t.Fatalf("expected product_count 3, got %d", c.ProductCount)
	}
	if len(c.ProductIDs) != 3 {
		t.Fatalf("expected 3 product_ids, got %d", len(c.ProductIDs))
	}
	if c.ClassificationID == "" {
		t.Fatal("expected non-empty classification_id")
	}
	if c.CreatedAt.IsZero() {
		t.Fatal("expected non-zero created_at")
	}

	// Verify repo received the classification
	if repo.created.ClassificationID != c.ClassificationID {
		t.Fatal("repo did not receive the created classification")
	}
}
