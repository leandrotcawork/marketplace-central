package msdb

import (
	"context"
	"errors"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Config holds the connection parameters for the MetalShopping database.
type Config struct {
	DatabaseURL string
	TenantID    string
}

// LoadConfig reads MetalShopping database configuration from environment
// variables. Both MS_DATABASE_URL and MS_TENANT_ID are required.
func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL: os.Getenv("MS_DATABASE_URL"),
		TenantID:    os.Getenv("MS_TENANT_ID"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("MS_DATABASE_URL is required")
	}
	if cfg.TenantID == "" {
		return Config{}, errors.New("MS_TENANT_ID is required")
	}
	return cfg, nil
}

// NewPool creates a pgxpool connected to the MetalShopping database.
// It configures BeforeAcquire to set the RLS tenant context on every
// connection checkout, ensuring tenant isolation on reused connections.
func NewPool(ctx context.Context, cfg Config) (*pgxpool.Pool, error) {
	if cfg.DatabaseURL == "" {
		return nil, errors.New("MS_DATABASE_URL is required")
	}
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	// Set tenant context on every connection acquire (not just creation) so
	// MetalShopping's RLS policies work even on reused pooled connections.
	poolCfg.BeforeAcquire = func(ctx context.Context, conn *pgx.Conn) bool {
		_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", cfg.TenantID)
		return err == nil
	}
	return pgxpool.NewWithConfig(ctx, poolCfg)
}
