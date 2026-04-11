# Last Session — Marketplace Central
> Date: 2026-04-11 | Session: #13

## What Was Accomplished
- Fixed integrations lifecycle transition matrix to allow `requires_reauth -> pending_connection` (kept `-> disconnected`)
- Aligned `packages/sdk-runtime` with OpenAPI for integrations auth endpoints (authorize + auth status)
- Implemented missing SDK client methods: `startIntegrationAuthorization`, `getIntegrationAuthStatus`
- Updated SDK unit tests to match the contract response shape (`auth_url`, `status`, `health_status`)
- Verified gates: `apps/server_core go build ./...`, `apps/server_core go test ./internal/modules/integrations/...`, `npm -w packages/sdk-runtime test`
- Created commit: `feat(integrations): implement OAuth + credential lifecycle (phases A–I)`

## What Changed in the System
- `packages/sdk-runtime/src/index.ts` now exposes client calls for `/integrations/installations/{id}/auth/authorize` and `/integrations/installations/{id}/auth/status`
- Integrations domain lifecycle state machine now supports reauth restart without creating a new installation

## Decisions Made This Session
- Keep SDK method naming and response types contract-first (OpenAPI is source of truth)

## What's Immediately Next
- Start `T-028`: implement the web UI connection/sync screens using `sdk-runtime` only (no direct fetch)

## Open Questions
- None
