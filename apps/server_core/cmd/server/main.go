package main

import (
	"context"
	"log"
	"net/http"

	"marketplace-central/apps/server_core/internal/composition"
	"marketplace-central/apps/server_core/internal/platform/config"
	"marketplace-central/apps/server_core/internal/platform/logging"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func main() {
	ctx := context.Background()
	cfg := config.Load()
	logger := logging.New()

	dbCfg, err := pgdb.LoadConfig()
	if err != nil {
		log.Fatalf("db config: %v", err)
	}
	pool, err := pgdb.NewPool(ctx, dbCfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	// Note: pool.Close() is not deferred because http.ListenAndServe exits via log.Fatal (os.Exit).
	// The OS reclaims all connections on process exit.

	logger.Printf("server starting on %s", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, composition.NewRootRouter(pool, dbCfg)))
}
