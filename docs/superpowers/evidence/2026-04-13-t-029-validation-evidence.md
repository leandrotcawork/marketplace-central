# T-029 Validation Evidence Ledger

Date: 2026-04-13  
Task: T-029 Operational E2E validation  
Runbook: `docs/superpowers/runbooks/2026-04-13-t-029-operational-e2e-runbook.md`

## Execution Snapshot

| Scenario | Provider(s) | Status | Evidence Type | Notes |
|---|---|---|---|---|
| Automated baseline: backend auth+fee-sync integration tests | N/A | PASS | Command output | `go test ./tests/integration -run "TestAuthFlow|TestFeeSync"` passed on 2026-04-13 |
| Automated baseline: runtime hub + sdk tests | N/A | PASS | Command output | 43 tests passed across SDK, IntegrationsHub, AppRouter, Marketplaces page |
| OAuth authorize start + callback redirect | mercado_livre, magalu | PARTIAL | API + logs | `auth/authorize` returned 200 with state/auth_url, callback with fake code returned `302 /connections?status=failed` |
| Credentials connect | shopee | PASS | API + logs | `auth/credentials` returned connected status with `external_account_id=shop-1` |
| Auth status checks | mercado_livre, magalu, shopee | PARTIAL | API + logs | Shopee connected->disconnected confirmed; ML/Magalu remained `pending_connection` without sandbox callback |
| Reauth and disconnect idempotency | OAuth providers + one installation | PARTIAL | API + logs | Disconnect idempotency validated on Shopee; OAuth reauth blocked without valid connected OAuth session |
| Fee-sync queue and timeline progression | shopee | PASS | API + logs | `fee-sync` returned `202 queued`; operations endpoint returned terminal `succeeded` run |
| Tenant isolation guard checks | tenant_default, tenant_beta | PASS | API + logs | Second server (`tenant_beta`, `API_PORT=8091`) could not read or mutate `tenant_default` installation |

## Command Evidence Captured Today

### 1) Backend integration subset

- Command:

```powershell
cd apps/server_core
$cache = Join-Path (Get-Location) '.gocache'
if (!(Test-Path $cache)) { New-Item -ItemType Directory -Path $cache | Out-Null }
$env:GOCACHE = $cache
go test ./tests/integration -run "TestAuthFlow|TestFeeSync"
```

- Result: PASS (`ok   marketplace-central/apps/server_core/tests/integration`)

### 2) Frontend runtime subset

- Command:

```powershell
npm.cmd run test --workspace @marketplace-central/web -- \
  packages/sdk-runtime/src/index.test.ts \
  packages/feature-integrations/src/IntegrationsHubPage.test.tsx \
  apps/web/src/app/AppRouter.test.tsx \
  packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx
```

- Result: PASS (4 files, 43 tests)

### 3) API scenario transcripts (terminal execution)

- Shopee credentials connect:

```text
CREDENTIALS={"installation_id":"inst-shopee-t029","status":"connected","health_status":"healthy","provider_code":"shopee","external_account_id":"shop-1"}
```

- Shopee status, fee-sync, operations, disconnect idempotency:

```text
STATUS1={"installation_id":"inst-shopee-t029","status":"connected","health_status":"healthy","provider_code":"shopee"}
FEE_SYNC={"installation_id":"inst-shopee-t029","operation_run_id":"fs_22fffab0d659b430f72c02a0","status":"queued"}
OPS1={"items":[{"operation_run_id":"fs_22fffab0d659b430f72c02a0","installation_id":"inst-shopee-t029","status":"succeeded","result_code":"INTEGRATIONS_FEE_SYNC_OK",...}]}
DISCONNECT1={"installation_id":"inst-shopee-t029","status":"disconnected","health_status":"warning","provider_code":"shopee"}
DISCONNECT2={"installation_id":"inst-shopee-t029","status":"disconnected","health_status":"warning","provider_code":"shopee"}
STATUS2={"installation_id":"inst-shopee-t029","status":"disconnected","health_status":"warning","provider_code":"shopee"}
```

- OAuth authorize + callback redirect evidence:

```text
ML_AUTHZ -> 200 with state/auth_url, status moved to pending_connection
MAGALU_AUTHZ -> 200 with state/auth_url, status moved to pending_connection
ML_CALLBACK_HEADERS: HTTP/1.1 302 Found, Location: /connections?status=failed
MAGALU_CALLBACK_HEADERS: HTTP/1.1 302 Found, Location: /connections?status=failed
```

- Tenant isolation evidence (`tenant_beta` server on `:8091`):

```text
BETA_STATUS={"error":{"code":"INTEGRATIONS_INSTALLATION_NOT_FOUND",...}}
BETA_SYNC={"error":{"code":"INTEGRATIONS_INSTALLATION_NOT_FOUND",...}}
BETA_INSTALLATIONS={"items":[]}
```

- Structured log evidence (sample):

```text
INFO integrations.auth.credentials action=submit_credentials result=200 duration_ms=12
INFO integrations.fee_sync.start action=start_sync result=202 duration_ms=18
INFO integrations.operations.list action=list_operation_runs result=200 duration_ms=0
INFO integrations.auth.disconnect action=disconnect result=200 duration_ms=2
INFO integrations.auth.callback action=handle_callback result=302 duration_ms=287
```

## Pending Manual Evidence Checklist

- [x] OAuth API transcript + callback redirect for Mercado Livre
- [x] OAuth API transcript + callback redirect for Magalu
- [x] Shopee credentials connect transcript
- [ ] Auth status API/UI parity screenshots for all providers
- [ ] Reauth flow transcript and post-reauth connected status for OAuth providers
- [x] Disconnect idempotency transcript (double call)
- [x] Fee-sync queued response and operations timeline progression
- [x] Tenant beta cannot read/mutate tenant default installation
- [ ] Tenant-scoped SQL verification output
- [x] Server logs for executed scenarios with `action`, `result`, `duration_ms`

## Current Classification

`DONE_WITH_CONCERNS` for backend/API operational validation, with remaining blockers on OAuth sandbox callback success path and UI screenshot capture.
