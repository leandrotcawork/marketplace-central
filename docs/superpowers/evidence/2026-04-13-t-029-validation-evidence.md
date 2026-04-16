# T-029 Validation Evidence Ledger

Date: 2026-04-13  
Task: T-029 Operational E2E validation  
Runbook: `docs/superpowers/runbooks/2026-04-13-t-029-operational-e2e-runbook.md`

## Execution Snapshot

| Scenario | Provider(s) | Status | Evidence Type | Notes |
|---|---|---|---|---|
| Automated baseline: backend auth+fee-sync integration tests | N/A | PASS | Command output | `go test ./tests/integration -run "TestAuthFlow|TestFeeSync"` passed |
| Automated baseline: full regression workflow after improvement | N/A | PASS | Command output | `go test ./... -count=1`, `go build ./...`, `npm test -- --runInBand`, `npm run build` passed |
| OAuth authorize and callback contract coverage | mercado_livre, magalu | PARTIAL | API + logs | `auth/authorize` and `reauth/authorize` return `200` with `state/auth_url`; callback success path still depends on provider sandbox consent |
| Credentials connect | shopee | PASS | API + logs | `auth/credentials` returned `connected` with `external_account_id=shop-1` |
| Auth status checks with UI/API parity | mercado_livre, magalu, shopee | PASS | API + UI + logs | Status API validated for all providers; UI screenshots captured from `/integrations` for each provider view |
| Reauth and disconnect idempotency | OAuth + shopee | PARTIAL | API + logs | Reauth start validated (`200`); disconnect idempotency validated with double-call on Shopee (`200`, `200`) |
| Fee-sync queue and timeline progression | shopee | PASS | API + logs | `fee-sync` returned `202 queued`; operations list showed `succeeded` terminal run |
| Tenant isolation guard checks | tenant_default, tenant_beta | PASS | API + logs + SQL | Beta tenant cannot read/mutate default tenant installation; SQL scope query confirms tenant partitioning |

## Command Evidence Captured

### 1) Backend and frontend workflow

```text
go test ./... -count=1                               -> PASS
go test ./tests/integration -run "TestAuthFlow|TestFeeSync" -count=1 -> PASS
go build ./...                                       -> PASS
npm test -- --runInBand                              -> PASS (17 files, 142 tests)
npm run build                                        -> PASS
```

### 2) Auth status/API actions

```text
STATUS inst-ml-t029 -> {"installation_id":"inst-ml-t029","status":"connected","health_status":"healthy","provider_code":"mercado_livre"}
STATUS inst-magalu-t029 -> {"installation_id":"inst-magalu-t029","status":"connected","health_status":"healthy","provider_code":"magalu"}
STATUS inst-shopee-t029 -> {"installation_id":"inst-shopee-t029","status":"connected","health_status":"healthy","provider_code":"shopee"}

REAUTH inst-ml-t029 -> 200 with state/auth_url/expires_in
REAUTH inst-magalu-t029 -> 200 with state/auth_url/expires_in
```

### 3) Shopee credentials, fee-sync, and disconnect idempotency

```text
CREDENTIALS_RECONNECT inst-shopee-t029 -> {"installation_id":"inst-shopee-t029","status":"connected","health_status":"healthy","provider_code":"shopee","external_account_id":"shop-1"}
FEE_SYNC inst-shopee-t029 -> {"installation_id":"inst-shopee-t029","operation_run_id":"fs_88d3204966634ce4e23d92b2","status":"queued"}
OPS inst-shopee-t029 -> includes fs_88d3204966634ce4e23d92b2 with status "succeeded"
DISCONNECT1 inst-shopee-t029 -> {"installation_id":"inst-shopee-t029","status":"disconnected","health_status":"warning","provider_code":"shopee"}
DISCONNECT2 inst-shopee-t029 -> {"installation_id":"inst-shopee-t029","status":"disconnected","health_status":"warning","provider_code":"shopee"}
```

### 4) Tenant isolation and SQL scope

```text
BETA_STATUS -> {"error":{"code":"INTEGRATIONS_INSTALLATION_NOT_FOUND",...}}
BETA_FEE_SYNC -> {"error":{"code":"INTEGRATIONS_INSTALLATION_NOT_FOUND",...}}
BETA_INSTALLATIONS -> {"items":[]}
```

```text
inst-magalu-t029 | tenant_default | magalu | connected
inst-ml-t029 | tenant_default | mercado_livre | connected
inst-shopee-t029 | tenant_default | shopee | connected
```

### 5) UI screenshots

- `docs/superpowers/evidence/screenshots/2026-04-13-t029-integrations-overview.png`
- `docs/superpowers/evidence/screenshots/2026-04-13-t029-ui-mercado-livre.png`
- `docs/superpowers/evidence/screenshots/2026-04-13-t029-ui-magalu.png`
- `docs/superpowers/evidence/screenshots/2026-04-13-t029-ui-shopee.png`

### 6) Structured logs (`action`, `result`, `duration_ms`)

```text
INFO integrations.auth.status action=get_status result=200 duration_ms=3
INFO integrations.fee_sync.start action=start_sync result=202 duration_ms=90
INFO integrations.operations.list action=list_operation_runs result=200 duration_ms=0
INFO integrations.auth.disconnect action=disconnect result=200 duration_ms=37
INFO integrations.auth.reauth action=start_reauth result=200 duration_ms=49
INFO integrations.auth.credentials action=submit_credentials result=200 duration_ms=13
```

## Remaining Blocker

- Sandbox OAuth consent + callback success path after reauth (`/integrations/auth/callback` returning connected redirect) still requires provider interactive completion in external consent screens.

## Current Classification

`DONE_WITH_CONCERNS` — task execution and operational coverage completed with evidence; only sandbox-dependent callback completion remains as documented concern.
