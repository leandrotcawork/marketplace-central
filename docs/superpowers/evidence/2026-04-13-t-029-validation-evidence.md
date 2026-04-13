# T-029 Validation Evidence Ledger

Date: 2026-04-13  
Task: T-029 Operational E2E validation  
Runbook: `docs/superpowers/runbooks/2026-04-13-t-029-operational-e2e-runbook.md`

## Execution Snapshot

| Scenario | Provider(s) | Status | Evidence Type | Notes |
|---|---|---|---|---|
| Automated baseline: backend auth+fee-sync integration tests | N/A | PASS | Command output | `go test ./tests/integration -run "TestAuthFlow|TestFeeSync"` passed on 2026-04-13 |
| Automated baseline: runtime hub + sdk tests | N/A | PASS | Command output | 43 tests passed across SDK, IntegrationsHub, AppRouter, Marketplaces page |
| OAuth authorize/callback/connect | mercado_livre, magalu | PENDING | API + UI + logs | Awaiting live sandbox operator run |
| Credentials connect | shopee | PENDING | API + UI + logs | Awaiting runtime credentials submission in sandbox |
| Auth status checks | mercado_livre, magalu, shopee | PENDING | API + UI + logs | Awaiting per-installation status checks after connect/disconnect |
| Reauth and disconnect idempotency | OAuth providers + one installation | PENDING | API + UI + logs | Awaiting requires_reauth fixture and live reauth |
| Fee-sync queue and timeline progression | mercado_livre, magalu, shopee | PENDING | API + UI + logs | Awaiting worker-backed run progression |
| Tenant isolation guard checks | tenant_alpha, tenant_beta | PENDING | API + SQL + UI + logs | Requires two server processes (`API_PORT=8080`, `API_PORT=8081`) |

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

## Pending Manual Evidence Checklist

- [ ] OAuth API transcript + callback redirect for Mercado Livre
- [ ] OAuth API transcript + callback redirect for Magalu
- [ ] Shopee credentials connect transcript
- [ ] Auth status API/UI parity screenshots for all providers
- [ ] Reauth flow transcript and post-reauth connected status
- [ ] Disconnect idempotency transcript (double call)
- [ ] Fee-sync queued response and operations timeline progression
- [ ] Tenant beta cannot read/mutate tenant alpha installation
- [ ] Tenant-scoped SQL verification output
- [ ] Server logs for every scenario with `action`, `result`, `duration_ms`

## Current Classification

`BLOCKED` until provider sandbox/manual runtime validation is executed and evidence is attached.