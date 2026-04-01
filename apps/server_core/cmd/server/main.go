package main

import (
	"log"
	"net/http"

	"marketplace-central/apps/server_core/internal/composition"
	"marketplace-central/apps/server_core/internal/platform/config"
	"marketplace-central/apps/server_core/internal/platform/logging"
)

func main() {
	cfg := config.Load()
	logger := logging.New()
	logger.Printf("server starting on %s", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, composition.NewRootRouter()))
}
