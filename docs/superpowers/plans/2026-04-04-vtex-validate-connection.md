# VTEX Validate Connection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /connectors/vtex/validate-connection` endpoint that verifies VTEX API credentials by making a lightweight read-only call to the VTEX category tree API.

**Architecture:** Follows the existing hexagonal pattern in the connectors module. The new method threads through port → adapter → application → transport, identical to every other VTEX operation. No database interaction — pure passthrough.

**Tech Stack:** Go 1.25.1, pgx/v5 (existing, not used by this feature), VTEX Catalog REST API

**Spec:** `docs/superpowers/specs/2026-04-04-vtex-validate-connection-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/server_core/internal/modules/connectors/ports/vtex_catalog.go` | Add `ValidateConnection` to port interface |
| Modify | `apps/server_core/internal/modules/connectors/adapters/vtex/http/config.go` | Add retry config for `ValidateConnection` |
| Modify | `apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter.go` | Implement `ValidateConnection` on HTTP adapter |
| Modify | `apps/server_core/internal/modules/connectors/adapters/vtex/stub/adapter.go` | Add `ValidateConnection` stub |
| Modify | `apps/server_core/internal/modules/connectors/application/orchestrator.go` | Add `ValidateConnection` delegation method |
| Modify | `apps/server_core/internal/modules/connectors/transport/http_handler.go` | Add `handleValidateConnection` + register route |
| Modify | `contracts/api/marketplace-central.openapi.yaml` | Add endpoint to OpenAPI spec |
| Modify | `apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter_test.go` | Unit test for `ValidateConnection` |
| Create | `apps/server_core/internal/modules/connectors/adapters/vtex/http/integration_test.go` | Integration test with real VTEX credentials |

---

### Task 1: Add `ValidateConnection` to the Port Interface

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/ports/vtex_catalog.go:91-107`

- [ ] **Step 1: Add the method to VTEXCatalogPort**

In `ports/vtex_catalog.go`, add `ValidateConnection` to the interface, after the `ActivateProduct` line (line 101) and before the blank line before `GetProduct`:

```go
	ActivateProduct(ctx context.Context, params ActivateParams) error

	ValidateConnection(ctx context.Context, vtexAccount string) error

	GetProduct(ctx context.Context, vtexAccount, vtexID string) (ProductData, error)
```

- [ ] **Step 2: Verify the project does NOT compile**

Run:
```bash
cd apps/server_core && go build ./...
```

Expected: Compilation fails because `Adapter` in `adapters/vtex/http/` and `adapters/vtex/stub/` no longer satisfy `VTEXCatalogPort`.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/ports/vtex_catalog.go
git commit -m "feat(connectors): add ValidateConnection to VTEXCatalogPort interface"
```

---

### Task 2: Implement `ValidateConnection` on the HTTP Adapter

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/adapters/vtex/http/config.go:15-29`
- Modify: `apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter.go:238-246`

- [ ] **Step 1: Add retry config for ValidateConnection**

In `config.go`, add this entry to the `retryConfigs` map, after the `"GetBrand"` entry:

```go
	"GetBrand":             {MaxAttempts: 3, BaseDelay: 1 * time.Second, JitterPct: 0.25, AllowNetworkRetry: true},
	"ValidateConnection":   {MaxAttempts: 1, BaseDelay: 0, JitterPct: 0, AllowNetworkRetry: false},
```

Single attempt, no retry. If the first call fails, we want to report the error immediately rather than masking transient issues.

- [ ] **Step 2: Implement ValidateConnection on the HTTP adapter**

In `adapter.go`, add this method before the `resultStr` helper at the bottom of the file (before line 240):

```go
func (a *Adapter) ValidateConnection(ctx context.Context, vtexAccount string) error {
	start := time.Now()

	_, _, err := a.client.Get(ctx, vtexAccount, "/api/catalog/pvt/category/tree/1", retryConfigs["ValidateConnection"])
	slog.Info("vtex_api_call", "action", "ValidateConnection", "result", resultStr(err), "vtex_account", vtexAccount, "duration_ms", time.Since(start).Milliseconds())
	return err
}
```

- [ ] **Step 3: Verify the HTTP adapter compiles (stub will still fail)**

Run:
```bash
cd apps/server_core && go build ./internal/modules/connectors/adapters/vtex/http/
```

Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/vtex/http/config.go apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter.go
git commit -m "feat(connectors): implement ValidateConnection on VTEX HTTP adapter"
```

---

### Task 3: Add Stub Implementation + Unit Test

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/adapters/vtex/stub/adapter.go:75`
- Modify: `apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter_test.go`

- [ ] **Step 1: Add ValidateConnection to the stub adapter**

In `stub/adapter.go`, add this method at the end of the file (after `GetBrand`):

```go
func (a *Adapter) ValidateConnection(_ context.Context, vtexAccount string) error {
	return nil
}
```

- [ ] **Step 2: Verify the full project compiles**

Run:
```bash
cd apps/server_core && go build ./...
```

Expected: Compiles successfully — both adapters now satisfy the interface.

- [ ] **Step 3: Write the unit test for ValidateConnection**

In `adapter_test.go`, add this test at the end of the file (after `TestRetryConfigsDisableTimeoutRetriesForNonIdempotentPosts`):

```go
func TestValidateConnectionReturnsNilOn200(t *testing.T) {
	client := &Client{
		credentials: staticCredentialProvider{},
		httpClient: &gohttp.Client{
			Transport: roundTripFunc(func(req *gohttp.Request) (*gohttp.Response, error) {
				if req.Method != gohttp.MethodGet {
					t.Fatalf("expected GET, got %s", req.Method)
				}
				if req.URL.Path != "/api/catalog/pvt/category/tree/1" {
					t.Fatalf("expected category tree path, got %s", req.URL.Path)
				}
				return jsonResponse(gohttp.StatusOK, `[]`), nil
			}),
		},
	}

	adapter := &Adapter{client: client}
	err := adapter.ValidateConnection(context.Background(), "test-account")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestValidateConnectionReturnsErrorOn401(t *testing.T) {
	client := &Client{
		credentials: staticCredentialProvider{},
		httpClient: &gohttp.Client{
			Transport: roundTripFunc(func(req *gohttp.Request) (*gohttp.Response, error) {
				return jsonResponse(gohttp.StatusUnauthorized, `{"Message":"Invalid credentials"}`), nil
			}),
		},
	}

	adapter := &Adapter{client: client}
	err := adapter.ValidateConnection(context.Background(), "test-account")
	if err == nil {
		t.Fatal("expected auth error, got nil")
	}
}
```

- [ ] **Step 4: Run the tests**

Run:
```bash
cd apps/server_core && go test ./internal/modules/connectors/adapters/vtex/http/ -v -run "TestValidateConnection"
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/adapters/vtex/stub/adapter.go apps/server_core/internal/modules/connectors/adapters/vtex/http/adapter_test.go
git commit -m "feat(connectors): add ValidateConnection stub + unit tests"
```

---

### Task 4: Add Application Layer Method

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/application/orchestrator.go`

- [ ] **Step 1: Add ValidateConnection to the orchestrator**

In `orchestrator.go`, add this method after the `NewBatchOrchestrator` constructor (after line 78):

```go
// ValidateConnection verifies that VTEX API credentials are valid for the given account.
func (o *BatchOrchestrator) ValidateConnection(ctx context.Context, vtexAccount string) error {
	return o.vtex.ValidateConnection(ctx, vtexAccount)
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd apps/server_core && go build ./internal/modules/connectors/application/
```

Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/server_core/internal/modules/connectors/application/orchestrator.go
git commit -m "feat(connectors): add ValidateConnection to BatchOrchestrator"
```

---

### Task 5: Add Transport Handler + Route

**Files:**
- Modify: `apps/server_core/internal/modules/connectors/transport/http_handler.go`

- [ ] **Step 1: Register the new route**

In `http_handler.go`, add the route in the `Register` method (after line 31):

```go
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/connectors/vtex/publish", h.handlePublish)
	mux.HandleFunc("/connectors/vtex/publish/batch/", h.handleBatchRoutes)
	mux.HandleFunc("/connectors/vtex/validate-connection", h.handleValidateConnection)
}
```

- [ ] **Step 2: Add the request type and handler**

Add these types and handler at the end of the file (after `handleRetry`):

```go
// ---- POST /connectors/vtex/validate-connection ----

type validateConnectionRequest struct {
	VTEXAccount string `json:"vtex_account"`
}

func (h *Handler) handleValidateConnection(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeConnectorsError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		slog.Info("connectors.validate_connection", "action", "reject_method", "result", "405", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	var req validateConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_VALIDATE_INVALID_BODY", "malformed request body")
		slog.Info("connectors.validate_connection", "action", "decode_body", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if req.VTEXAccount == "" {
		writeConnectorsError(w, http.StatusBadRequest, "CONNECTORS_VALIDATE_MISSING_ACCOUNT", "vtex_account is required")
		slog.Info("connectors.validate_connection", "action", "validate_account", "result", "400", "duration_ms", time.Since(start).Milliseconds())
		return
	}

	if err := h.orchestrator.ValidateConnection(r.Context(), req.VTEXAccount); err != nil {
		if errors.Is(err, domain.ErrVTEXAuth) {
			writeConnectorsError(w, http.StatusUnauthorized, "CONNECTORS_VTEX_AUTH_INVALID", "VTEX credentials are invalid or expired")
			slog.Info("connectors.validate_connection", "action", "validate", "result", "401", "vtex_account", req.VTEXAccount, "duration_ms", time.Since(start).Milliseconds())
			return
		}
		writeConnectorsError(w, http.StatusBadGateway, "CONNECTORS_VTEX_TRANSIENT", "VTEX API is unreachable")
		slog.Error("connectors.validate_connection", "action", "validate", "result", "502", "vtex_account", req.VTEXAccount, "error", err.Error(), "duration_ms", time.Since(start).Milliseconds())
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":       "connected",
		"vtex_account": req.VTEXAccount,
	})
	slog.Info("connectors.validate_connection", "action", "validate", "result", "200", "vtex_account", req.VTEXAccount, "duration_ms", time.Since(start).Milliseconds())
}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd apps/server_core && go build ./...
```

Expected: Compiles successfully.

- [ ] **Step 4: Run all existing tests to confirm no regressions**

Run:
```bash
cd apps/server_core && go test ./...
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server_core/internal/modules/connectors/transport/http_handler.go
git commit -m "feat(connectors): add POST /connectors/vtex/validate-connection handler"
```

---

### Task 6: Update OpenAPI Spec

**Files:**
- Modify: `contracts/api/marketplace-central.openapi.yaml`

- [ ] **Step 1: Add the endpoint to the OpenAPI spec**

In `marketplace-central.openapi.yaml`, add this path block immediately before the existing `/connectors/vtex/publish:` path (before line 381):

```yaml
  /connectors/vtex/validate-connection:
    post:
      summary: Validate VTEX API credentials
      operationId: validateVTEXConnection
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - vtex_account
              properties:
                vtex_account:
                  type: string
                  description: VTEX account name
      responses:
        "200":
          description: Connection successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [connected]
                  vtex_account:
                    type: string
        "400":
          description: Missing vtex_account
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        "401":
          description: Invalid VTEX credentials
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        "502":
          description: VTEX API unreachable
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
```

- [ ] **Step 2: Commit**

```bash
git add contracts/api/marketplace-central.openapi.yaml
git commit -m "docs(connectors): add validate-connection endpoint to OpenAPI spec"
```

---

### Task 7: Add .env Variable + Integration Test

**Files:**
- Modify: `.env`
- Create: `apps/server_core/internal/modules/connectors/adapters/vtex/http/integration_test.go`

- [ ] **Step 1: Add VTEX_ACCOUNT to .env**

Add this line after `VTEX_APP_TOKEN` in `.env`:

```
VTEX_ACCOUNT=tfcvgo
```

- [ ] **Step 2: Write the integration test**

Create `apps/server_core/internal/modules/connectors/adapters/vtex/http/integration_test.go`:

```go
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
```

- [ ] **Step 3: Run the integration test with real credentials**

Run (from `apps/server_core/`):
```bash
cd apps/server_core && VTEX_ACCOUNT=tfcvgo VTEX_APP_KEY=vtexappkey-tfcvgo-HLWZZR VTEX_APP_TOKEN=<token_from_env> go test ./internal/modules/connectors/adapters/vtex/http/ -tags integration -run TestIntegration -v
```

Expected: `PASS` — VTEX returns HTTP 200 for the category tree call.

- [ ] **Step 4: Verify normal tests still skip the integration test**

Run:
```bash
cd apps/server_core && go test ./internal/modules/connectors/adapters/vtex/http/ -v
```

Expected: All existing unit tests PASS. `TestIntegration_ValidateConnection` does NOT appear (build tag excludes it).

- [ ] **Step 5: Commit**

```bash
git add .env apps/server_core/internal/modules/connectors/adapters/vtex/http/integration_test.go
git commit -m "feat(connectors): add VTEX connectivity integration test"
```

---

### Task 8: End-to-End Verification via curl

**Files:** None — uses the running server.

- [ ] **Step 1: Build and start the server**

Run:
```bash
cd apps/server_core && go build -o server.exe ./cmd/server/ && ./server.exe
```

Expected: Server starts, logs show all modules registered including connectors.

- [ ] **Step 2: Test successful connection**

In a separate terminal:
```bash
curl -s -X POST http://localhost:8080/connectors/vtex/validate-connection \
  -H "Content-Type: application/json" \
  -d '{"vtex_account":"tfcvgo"}' | jq .
```

Expected response:
```json
{
  "status": "connected",
  "vtex_account": "tfcvgo"
}
```

- [ ] **Step 3: Test missing account validation**

```bash
curl -s -X POST http://localhost:8080/connectors/vtex/validate-connection \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Expected response (HTTP 400):
```json
{
  "error": {
    "code": "CONNECTORS_VALIDATE_MISSING_ACCOUNT",
    "message": "vtex_account is required"
  }
}
```

- [ ] **Step 4: Test wrong method**

```bash
curl -s -X GET http://localhost:8080/connectors/vtex/validate-connection | jq .
```

Expected response (HTTP 405):
```json
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "method not allowed"
  }
}
```

- [ ] **Step 5: Stop the server and commit any remaining changes**

Press Ctrl+C to stop the server. If all tests pass, the feature is complete.
