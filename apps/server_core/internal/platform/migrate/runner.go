package migrate

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Run applies all pending SQL migrations from migrationsDir to the database.
// It returns the number of migrations applied and any error encountered.
// Migrations are applied in lexicographic filename order and tracked in
// schema_migrations to guarantee idempotency.
func Run(ctx context.Context, pool *pgxpool.Pool, migrationsDir string) (int, error) {
	// Ensure schema_migrations table exists
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		return 0, fmt.Errorf("ensure schema_migrations: %w", err)
	}

	// Read all .sql files from migrationsDir
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return 0, fmt.Errorf("read migrations dir %s: %w", migrationsDir, err)
	}

	var filenames []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" {
			filenames = append(filenames, e.Name())
		}
	}
	sort.Strings(filenames)

	// Query already-applied filenames
	rows, err := pool.Query(ctx, `SELECT filename FROM schema_migrations`)
	if err != nil {
		return 0, fmt.Errorf("query schema_migrations: %w", err)
	}
	applied := map[string]bool{}
	for rows.Next() {
		var fn string
		if err := rows.Scan(&fn); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan schema_migrations row: %w", err)
		}
		applied[fn] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate schema_migrations: %w", err)
	}

	count := 0
	for _, filename := range filenames {
		if applied[filename] {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, filename))
		if err != nil {
			return count, fmt.Errorf("read migration file %s: %w", filename, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return count, err
		}
		defer tx.Rollback(ctx) //nolint:errcheck // noop after commit

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			return count, fmt.Errorf("migration %s: %w", filename, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (filename) VALUES ($1)`, filename); err != nil {
			return count, fmt.Errorf("record migration %s: %w", filename, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return count, err
		}
		count++
	}

	return count, nil
}
