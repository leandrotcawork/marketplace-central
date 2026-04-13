# T-029 Operational E2E Runbook

Date: 2026-04-13  
Task: T-029 Operational E2E validation  
Related plan: `docs/superpowers/plans/2026-04-13-t-029-operational-e2e-validation.md`

## Purpose

Execute and certify integrations runtime behavior for OAuth and credential connect, lifecycle actions, fee-sync queueing, operations timeline, and tenant isolation.

## Preconditions

- Branch: `feat/t-029-operational-e2e-validation`
- API: `apps/server_core/cmd/server`
- Web: `apps/web`
- Required env vars set: `MC_DATABASE_URL`, `MC_DEFAULT_TENANT_ID`, `MPC_ENCRYPTION_KEY`, `MPC_OAUTH_HMAC_SECRET`
- Provider sandbox/test credentials available for:
  - `mercado_livre`
  - `magalu`
  - `shopee` (credentials path)

## Quick Verification (Automated Baseline)

Run these before any sandbox/manual validation:

```powershell
# backend auth/fee-sync integration tests
cd apps/server_core
$cache = Join-Path (Get-Location) '.gocache'
if (!(Test-Path $cache)) { New-Item -ItemType Directory -Path $cache | Out-Null }
$env:GOCACHE = $cache
go test ./tests/integration -run "TestAuthFlow|TestFeeSync"

# frontend/sdk runtime tests
cd ../..
npm.cmd run test --workspace @marketplace-central/web -- \
  packages/sdk-runtime/src/index.test.ts \
  packages/feature-integrations/src/IntegrationsHubPage.test.tsx \
  apps/web/src/app/AppRouter.test.tsx \
  packages/feature-marketplaces/src/MarketplaceSettingsPage.test.tsx
```

Required outcome:

- All commands pass
- No regressions in runtime hub, SDK contract, or integration lifecycle tests

## Scenario Execution Order

1. OAuth connect flow: `mercado_livre`, `magalu`
2. Credentials connect flow: `shopee`
3. Auth status consistency across API and UI
4. Reauth and disconnect idempotency
5. Fee-sync queue + operations timeline
6. Tenant isolation with two server processes

Use the canonical scenario steps from:
- `docs/superpowers/plans/2026-04-13-t-029-operational-e2e-validation.md`

## Evidence Requirements Per Scenario

Capture all three categories:

1. API transcript (`curl.exe` request + response body)
2. UI evidence (screenshot from `/integrations`)
3. Structured server logs showing `action`, `result`, `duration_ms`

Do not mark scenario complete with only a single HTTP status code.

## Blocker Handling

If sandbox callback or worker progression is blocked:

1. Mark scenario as `BLOCKED` in evidence ledger.
2. Record the exact blocked sub-step.
3. Preserve last successful verifiable hop and output.
4. Do not fabricate callback or operation terminal states.

## Final Classification

- `DONE`: all required scenarios complete and evidenced.
- `DONE_WITH_CONCERNS`: complete with non-blocking evidence gap documented.
- `BLOCKED`: one or more mandatory scenarios could not be executed.
- `NEEDS_CONTEXT`: environment does not expose required endpoints/UI.