# ME Auth Port + Status Connectivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple ME auth transport from the adapter layer and make Melhor Envio connectivity checks reflect real API availability.

**Architecture:** Introduce a small `MEAuthPort` in connectors ports, have the ME OAuth handler implement it, and update transport to depend only on the port. Update ME status checks (OAuth handler + client IsConnected) to call the services endpoint and treat non-200 as disconnected.

**Tech Stack:** Go, net/http, pgxpool, existing httpx helpers, existing ME adapter.

---

## File Map (Responsibilities)

- Create: `apps/server_core/internal/modules/connectors/ports/me_auth.go`
  - Defines `MEAuthPort` interface used by transport.
- Modify: `apps/server_core/internal/modules/connectors/transport/http_handler.go`
  - Replace adapter dependency with port interface.
- Modify: `apps/server_core/tests/unit/connectors_handler_test.go`
  - Add delegation test using a fake `MEAuthPort`.
- Modify: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go`
  - Implement connectivity check against services endpoint.
- Modify: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go`
  - Use services check for status and align route registration.
- Modify: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth_test.go`
  - Update status route, add connectivity tests.
- Modify: `apps/server_core/tests/unit/melhorenvio_client_test.go`
  - Add IsConnected tests for services endpoint success/failure.

---

### Task 1: Add MEAuthPort and decouple connectors transport

**Files:**
- Create: `apps/server_core/internal/modules/connectors/ports/me_auth.go`
- Modify: `apps/server_core/internal/modules/connectors/transport/http_handler.go`
- Test: `apps/server_core/tests/unit/connectors_handler_test.go`

- [ ] **Step 1: Write failing test for ME auth delegation**

Add to `apps/server_core/tests/unit/connectors_handler_test.go`:

```go
func TestConnectorsMEStatusDelegatesToAuthPort(t *testing.T) {
	orch := newTestOrchestrator()
	stub := &meAuthStub{}
	h := transport.NewHandler(orch, stub)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if !stub.called {
		t.Fatal("expected ME auth port to be called")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

type meAuthStub struct{ called bool }

func (m *meAuthStub) HandleStart(http.ResponseWriter, *http.Request) {}
func (m *meAuthStub) HandleCallback(http.ResponseWriter, *http.Request) {}
func (m *meAuthStub) HandleStatus(w http.ResponseWriter, _ *http.Request) {
	m.called = true
	w.WriteHeader(http.StatusOK)
}
```

- [ ] **Step 2: Run the new test (expect failure)**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestConnectorsMEStatusDelegatesToAuthPort -v
```

Expected: FAIL with compile error (NewHandler signature or missing interface).

- [ ] **Step 3: Add MEAuthPort and update transport to use it**

Create `apps/server_core/internal/modules/connectors/ports/me_auth.go`:

```go
package ports

import "net/http"

type MEAuthPort interface {
	HandleStart(http.ResponseWriter, *http.Request)
	HandleCallback(http.ResponseWriter, *http.Request)
	HandleStatus(http.ResponseWriter, *http.Request)
}
```

Update `apps/server_core/internal/modules/connectors/transport/http_handler.go`:

```go
import (
	// ...
	connectorports "marketplace-central/apps/server_core/internal/modules/connectors/ports"
)

// Handler exposes the VTEX publish pipeline over HTTP.
type Handler struct {
	orchestrator *app.BatchOrchestrator
	meAuth       connectorports.MEAuthPort // nil if ME_CLIENT_ID not set
}

// NewHandler constructs a Handler.
func NewHandler(orchestrator *app.BatchOrchestrator, meAuth connectorports.MEAuthPort) *Handler {
	return &Handler{orchestrator: orchestrator, meAuth: meAuth}
}
```

Remove the adapter import (`adapters/melhorenvio`) from transport.

- [ ] **Step 4: Re-run the test (expect pass)**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestConnectorsMEStatusDelegatesToAuthPort -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/ports/me_auth.go \
        apps/server_core/internal/modules/connectors/transport/http_handler.go \
        apps/server_core/tests/unit/connectors_handler_test.go
git commit -m "refactor(connectors): decouple ME auth transport via port"
```

---

### Task 2: Implement real connectivity checks for ME status

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go`
- Modify: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go`
- Test: `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth_test.go`
- Test: `apps/server_core/tests/unit/melhorenvio_client_test.go`

- [ ] **Step 1: Write failing tests for IsConnected services check**

Add to `apps/server_core/tests/unit/melhorenvio_client_test.go`:

```go
func TestMEClientIsConnectedChecksServicesEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/me/shipment/services" {
			t.Fatalf("expected services path, got %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("expected bearer token header, got %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)
	connected, err := client.IsConnected(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !connected {
		t.Fatal("expected connected=true")
	}
}

func TestMEClientIsConnectedReturnsFalseOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	client := melhorenvio.NewClientWithBaseURL(melhorenvio.NewInMemoryTokenStore("test-token"), srv.URL)
	connected, err := client.IsConnected(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if connected {
		t.Fatal("expected connected=false")
	}
}
```

- [ ] **Step 2: Run the new tests (expect failure)**

```bash
cd apps/server_core && go test ./tests/unit/... -run TestMEClientIsConnected -v
```

Expected: FAIL (IsConnected still token-only).

- [ ] **Step 3: Implement services check in client**

Update `apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go`:

```go
import (
	// ...
	"strings"
)

func (c *Client) IsConnected(ctx context.Context) (bool, error) {
	token, err := c.tokens.GetToken(ctx)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(token) == "" {
		return false, nil
	}
	return checkServices(ctx, c.httpClient, c.baseURL, token)
}

func checkServices(ctx context.Context, httpClient *http.Client, baseURL, token string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/me/shipment/services", nil)
	if err != nil {
		return false, fmt.Errorf("melhorenvio build services request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", userAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("melhorenvio services request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil
	}
	return true, nil
}
```

- [ ] **Step 4: Update OAuth status handler to use services check and align route**

Update `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go`:

```go
func (h *OAuthHandler) Register(mux *http.ServeMux) {
	if h == nil {
		return
	}
	mux.HandleFunc("/connectors/melhor-envio/auth/start", h.HandleStart)
	mux.HandleFunc("/connectors/melhor-envio/auth/callback", h.HandleCallback)
	mux.HandleFunc("/connectors/melhor-envio/status", h.HandleStatus)
}

func (h *OAuthHandler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeOAuthError(w, http.StatusMethodNotAllowed, "CONNECTORS_ME_METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.me_auth", "action", "status", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	token, err := h.store.GetToken(r.Context())
	if err != nil {
		writeOAuthError(w, http.StatusInternalServerError, "CONNECTORS_ME_STATUS_STORE_FAILED", "failed to load token state")
		slog.Error("connectors.me_auth", "action", "status", "result", "500", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	connected := false
	if strings.TrimSpace(token) != "" {
		client := h.httpClient
		if client == nil {
			client = &http.Client{Timeout: defaultOAuthTimeout}
		}
		ok, err := checkServices(r.Context(), client, defaultBaseURL, token)
		if err != nil {
			slog.Error("connectors.me_auth", "action", "status", "result", "200", "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
			ok = false
		}
		connected = ok
	}

	slog.Info("connectors.me_auth", "action", "status", "result", "200", "connected", connected, "duration_ms", time.Since(start).Milliseconds())
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"connected": connected})
}
```

- [ ] **Step 5: Update OAuth tests for status + services check**

In `apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth_test.go`, update the status request path and add connectivity tests:

```go
func TestOAuthHandlerHandleStatusSurfacesStoreError(t *testing.T) {
	store := &oauthTestStore{getErr: errors.New("db unavailable")}
	h := newOAuthHandlerForTest(store, &http.Client{})

	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if code := errorCodeFromResponse(t, rec.Body); code != "CONNECTORS_ME_STATUS_STORE_FAILED" {
		t.Fatalf("expected CONNECTORS_ME_STATUS_STORE_FAILED, got %q", code)
	}
}

func TestOAuthHandlerHandleStatusReturnsFalseWhenServiceCheckFails(t *testing.T) {
	store := &oauthTestStore{token: "token-123"}
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusUnauthorized,
			Body:       ioNopCloser{Reader: bytes.NewReader([]byte(`{}`))},
			Header:     make(http.Header),
		}, nil
	})}
	
	h := newOAuthHandlerForTest(store, client)
	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var payload map[string]bool
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["connected"] {
		t.Fatal("expected connected=false")
	}
}

func TestOAuthHandlerHandleStatusReturnsTrueWhenServiceCheckSucceeds(t *testing.T) {
	store := &oauthTestStore{token: "token-123"}
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       ioNopCloser{Reader: bytes.NewReader([]byte(`{}`))},
			Header:     make(http.Header),
		}, nil
	})}
	
	h := newOAuthHandlerForTest(store, client)
	req := httptest.NewRequest(http.MethodGet, "/connectors/melhor-envio/status", nil)
	rec := httptest.NewRecorder()

	h.HandleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var payload map[string]bool
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload["connected"] {
		t.Fatal("expected connected=true")
	}
}
```

- [ ] **Step 6: Run updated tests (expect pass)**

```bash
cd apps/server_core && go test ./internal/modules/connectors/adapters/melhorenvio -run TestOAuthHandlerHandleStatus -v
cd apps/server_core && go test ./tests/unit/... -run TestMEClientIsConnected -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/melhorenvio/client.go \
        apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth.go \
        apps/server_core/internal/modules/connectors/adapters/melhorenvio/oauth_test.go \
        apps/server_core/tests/unit/melhorenvio_client_test.go
git commit -m "fix(connectors): check ME connectivity via services endpoint"
```

---

## Plan Self-Review

- **Spec coverage:** All items (port interface, transport decoupling, services check, route alignment, tests) are mapped to Tasks 1-2.
- **Placeholder scan:** No TODO/TBD placeholders used.
- **Type consistency:** `MEAuthPort` methods match `OAuthHandler` methods and transport handlers.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-07-me-auth-port-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
