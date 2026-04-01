package pgdb

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL     string
	DefaultTenantID string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL:     os.Getenv("MC_DATABASE_URL"),
		DefaultTenantID: os.Getenv("MC_DEFAULT_TENANT_ID"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("MC_DATABASE_URL is required")
	}
	if cfg.DefaultTenantID == "" {
		cfg.DefaultTenantID = "tenant_default"
	}
	return cfg, nil
}
