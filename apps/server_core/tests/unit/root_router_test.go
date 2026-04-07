package unit

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"

	"marketplace-central/apps/server_core/internal/composition"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestNewRootRouterRequiresVTEXCredentials(t *testing.T) {
	if os.Getenv("TEST_NEW_ROOT_ROUTER_MISSING_CREDENTIALS") == "1" {
		composition.NewRootRouter(nil, nil, pgdb.Config{DefaultTenantID: "tenant_default"})
		return
	}

	cmd := exec.Command(os.Args[0], "-test.run=^TestNewRootRouterRequiresVTEXCredentials$")
	cmd.Env = append(filteredEnv(os.Environ(), "VTEX_APP_KEY", "VTEX_APP_TOKEN"), "TEST_NEW_ROOT_ROUTER_MISSING_CREDENTIALS=1")

	err := cmd.Run()
	if err == nil {
		t.Fatal("expected NewRootRouter to exit when VTEX credentials are missing")
	}

	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected subprocess exit error, got %v", err)
	}
}

func TestNewRootRouterBuildsWhenVTEXCredentialsArePresent(t *testing.T) {
	t.Setenv("VTEX_APP_KEY", "test-key")
	t.Setenv("VTEX_APP_TOKEN", "test-token")
	t.Setenv("ME_CLIENT_ID", "test-client")
	t.Setenv("ME_CLIENT_SECRET", "test-secret")

	router := composition.NewRootRouter(nil, nil, pgdb.Config{DefaultTenantID: "tenant_default"})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected /healthz to return 200, got %d", rec.Code)
	}

	startReq := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/auth/start", nil)
	startRec := httptest.NewRecorder()
	router.ServeHTTP(startRec, startReq)
	if startRec.Code == http.StatusNotFound {
		t.Fatal("expected Melhor Envio auth route to be registered")
	}
}

func filteredEnv(env []string, keys ...string) []string {
	blocked := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		blocked[key] = struct{}{}
	}

	filtered := make([]string, 0, len(env))
	for _, entry := range env {
		key, _, found := strings.Cut(entry, "=")
		if !found {
			filtered = append(filtered, entry)
			continue
		}
		if _, blockedKey := blocked[key]; blockedKey {
			continue
		}
		filtered = append(filtered, entry)
	}

	return filtered
}
