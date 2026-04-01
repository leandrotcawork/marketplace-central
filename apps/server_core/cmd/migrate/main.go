package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"marketplace-central/apps/server_core/internal/platform/migrate"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func main() {
	ctx := context.Background()
	if err := run(ctx); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	cfg, err := pgdb.LoadConfig()
	if err != nil {
		return err
	}
	pool, err := pgdb.NewPool(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	// migrationsDir: resolve relative to binary location or use env override
	migrationsDir := os.Getenv("MC_MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "apps/server_core/migrations"
	}

	applied, err := migrate.Run(ctx, pool, migrationsDir)
	if err != nil {
		return err
	}
	fmt.Printf("applied %d migration(s)\n", applied)
	return nil
}
