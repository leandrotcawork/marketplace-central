//go:build integration

package vtexhttp

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestIntegration_ValidateConnection(t *testing.T) {
	account := os.Getenv("VTEX_ACCOUNT")
	if account == "" {
		t.Skip("VTEX_ACCOUNT not set, skipping integration test")
	}

	creds, err := NewEnvCredentialProvider()
	if err != nil {
		t.Skip("VTEX_APP_KEY/VTEX_APP_TOKEN not set, skipping integration test")
	}

	adapter := NewAdapter(creds)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := adapter.ValidateConnection(ctx, account); err != nil {
		t.Fatalf("ValidateConnection failed: %v", err)
	}
}
