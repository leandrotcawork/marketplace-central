package pgdb

import "context"

func DefaultTenantID(ctx context.Context, fallback string) string {
	if fallback == "" {
		return "tenant_default"
	}
	return fallback
}
