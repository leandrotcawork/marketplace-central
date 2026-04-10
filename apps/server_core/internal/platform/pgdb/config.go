package pgdb

import (
	"errors"
	"os"
)

type Config struct {
	DatabaseURL     string
	DefaultTenantID string
	EncryptionKey   string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL:     os.Getenv("MC_DATABASE_URL"),
		DefaultTenantID: os.Getenv("MC_DEFAULT_TENANT_ID"),
		EncryptionKey:   os.Getenv("MPC_ENCRYPTION_KEY"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("MC_DATABASE_URL is required")
	}
	if cfg.DefaultTenantID == "" {
		cfg.DefaultTenantID = "tenant_default"
	}
	if cfg.EncryptionKey == "" {
		cfg.EncryptionKey = "0123456789abcdef0123456789abcdef"
	}
	return cfg, nil
}
