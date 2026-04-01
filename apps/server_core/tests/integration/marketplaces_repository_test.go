package integration

import (
	"context"
	"os"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestMarketplacesRepositorySaveAndList(t *testing.T) {
	if os.Getenv("MC_DATABASE_URL") == "" {
		t.Skip("MC_DATABASE_URL not set")
	}

	cfg, err := pgdb.LoadConfig()
	if err != nil {
		t.Fatalf("config error: %v", err)
	}

	pool, err := pgdb.NewPool(context.Background(), cfg)
	if err != nil {
		t.Fatalf("pool error: %v", err)
	}
	defer pool.Close()

	repo := postgres.NewRepository(pool, cfg.DefaultTenantID)

	account := domain.Account{
		TenantID:       cfg.DefaultTenantID,
		AccountID:      "acct-test",
		ChannelCode:    "vtex",
		DisplayName:    "VTEX",
		Status:         "active",
		ConnectionMode: "api",
	}

	if err := repo.SaveAccount(context.Background(), account); err != nil {
		t.Fatalf("save account error: %v", err)
	}

	accounts, err := repo.ListAccounts(context.Background())
	if err != nil {
		t.Fatalf("list accounts error: %v", err)
	}
	if len(accounts) == 0 {
		t.Fatalf("expected accounts")
	}
}
