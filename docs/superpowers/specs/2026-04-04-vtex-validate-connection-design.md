# VTEX Validate Connection Endpoint

> Date: 2026-04-04
> Status: Approved
> Scope: Single endpoint, no frontend, no database

## Purpose

Verify that VTEX API credentials are valid and the account is reachable. This is
the first real HTTP call to VTEX from MPC — a connectivity proof before attempting
full publish flows.

## Architecture Flow

```
POST /connectors/vtex/validate-connection
  → transport.Handler.handleValidateConnection()
    → application.BatchOrchestrator.ValidateConnection(ctx, vtexAccount)
      → ports.VTEXCatalogPort.ValidateConnection(ctx, vtexAccount)
        → GET https://{account}.vtexcommercestable.com.br/api/catalog/pvt/category/tree/1
```

## Changes by Layer

### 1. Port — `ports/vtex_catalog.go`

Add to `VTEXCatalogPort` interface:

```go
ValidateConnection(ctx context.Context, vtexAccount string) error
```

### 2. Adapter — `adapters/vtex/http/adapter.go`

Implement `ValidateConnection`:
- Calls `GET /api/catalog/pvt/category/tree/1` with single-attempt retry config
- **200** → return `nil` (connection valid)
- **401/403** → return classified auth error (`CONNECTORS_VTEX_AUTH_INVALID`)
- **Network/timeout** → return classified transient error (`CONNECTORS_VTEX_TRANSIENT`)

The category tree endpoint is ideal:
- Returns `[]` on empty accounts (never 404)
- Lightweight read-only call
- Requires valid catalog API credentials

### 3. Stub Adapter — `adapters/vtex/stub/adapter.go`

Add `ValidateConnection` returning `nil` to satisfy the interface.

### 4. Application — `application/orchestrator.go`

Add method:

```go
func (o *BatchOrchestrator) ValidateConnection(ctx context.Context, vtexAccount string) error {
    return o.vtexCatalog.ValidateConnection(ctx, vtexAccount)
}
```

Pure delegation — no business logic needed.

### 5. Transport — `transport/http_handler.go`

Register `POST /connectors/vtex/validate-connection`.

**Request:**
```json
{"vtex_account": "tfcvgo"}
```

**Response 200 (connected):**
```json
{"status": "connected", "vtex_account": "tfcvgo"}
```

**Response 401 (auth failure):**
```json
{"error": {"code": "CONNECTORS_VTEX_AUTH_INVALID", "message": "VTEX credentials are invalid or expired"}}
```

**Response 502 (VTEX unreachable):**
```json
{"error": {"code": "CONNECTORS_VTEX_TRANSIENT", "message": "VTEX API is unreachable"}}
```

**Validation:**
- `vtex_account` required → 400 `CONNECTORS_VALIDATE_MISSING_ACCOUNT`
- Method must be POST → 405

**Logging:** `action`, `result`, `duration_ms` on every response.

### 6. OpenAPI — `contracts/api/marketplace-central.openapi.yaml`

Add `POST /connectors/vtex/validate-connection` with:
- Request schema: `ValidateConnectionRequest` (`vtex_account` string, required)
- Response 200 schema: `ValidateConnectionResponse` (`status`, `vtex_account`)
- Error responses: 400, 401, 405, 502

### 7. Integration Test — `adapters/vtex/http/integration_test.go`

Build tag: `//go:build integration`

- Reads `VTEX_APP_KEY`, `VTEX_APP_TOKEN`, `VTEX_ACCOUNT` from env
- Skips if any are missing
- Calls `adapter.ValidateConnection(ctx, vtexAccount)`
- Asserts `nil` error

Run with:
```bash
VTEX_ACCOUNT=tfcvgo go test ./internal/modules/connectors/adapters/vtex/http/ -tags integration -run TestIntegration -v
```

## Out of Scope

- **Frontend:** No UI changes. Future "Test Connection" button is a separate task.
- **SDK:** No `sdk-runtime` method until the frontend needs it.
- **Database:** No persistence. This is a stateless passthrough.
- **Multi-account:** Uses `EnvCredentialProvider` (single credential set from env).

## Verification Plan

1. Build compiles with no errors
2. Existing unit tests still pass
3. Start server locally
4. `curl -X POST http://localhost:8080/connectors/vtex/validate-connection -H "Content-Type: application/json" -d '{"vtex_account":"tfcvgo"}'`
5. Expect `{"status":"connected","vtex_account":"tfcvgo"}` with HTTP 200
6. Integration test passes with real credentials
