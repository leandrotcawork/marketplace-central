# T-028 Integrations Runtime Hub Design

Date: 2026-04-11
Owner: Integrations + Web
Status: Draft for review
Task: T-028 Frontend connection and sync UX

## Goal

Deliver a production-grade operational frontend for integrations so operators can connect, monitor, and run lifecycle actions against already-implemented backend OAuth and fee-sync capabilities.

This design explicitly separates setup concerns from runtime operations:
- `Marketplaces` page remains commercial setup (accounts, pricing policies).
- New `/integrations` hub owns operational runtime (auth lifecycle, health, sync, operation runs).

## Scope

In scope:
1. New `/integrations` runtime hub with installation grid and right-side detail drawer.
2. Runtime actions: authorize, reauthorize, disconnect, submit credentials (non-OAuth), start fee sync.
3. Runtime observability: auth/health status and operation runs timeline.
4. Robust loading, error, and empty states across all data-fetching UI.
5. SDK-first data access only (`packages/sdk-runtime`), no direct backend fetch from feature UI.

Out of scope:
1. Backend auth/fee-sync business logic changes (implemented in T-026/T-027).
2. Commercial policy editing redesign (stays in `Marketplaces` flow).
3. Provider sandbox E2E runbook and operational certification (T-029).

## Information Architecture

Primary route:
1. `/integrations` (default)
2. Deep link: `/integrations?installation=<id>` to open selected drawer state.

Existing route retained:
1. `/marketplaces` for account/policy setup.

Layout:
1. Header strip (title, last refresh, refresh action).
2. Operational KPI summary row.
3. Filters and search row.
4. Installation grid as primary canvas.
5. Persistent right drawer for selected installation details and actions.

## Screen-Level Design

### 1. Integrations Hub (`/integrations`)

Header strip:
1. Title: `Integrations`.
2. Subtitle clarifying operational scope.
3. Refresh action + last updated timestamp.

Operational summary row (clickable KPI filters):
1. Connected.
2. Requires Reauth.
3. Warning.
4. Critical.
5. Sync Failures (24h).

Filters and search:
1. Provider filter.
2. Installation status filter.
3. Health status filter.
4. Needs-action toggle.
5. Search by display name, external account id/name, provider code.

Installation card content:
1. Provider icon + display name.
2. Installation status badge.
3. Health badge.
4. External account identity.
5. Last operation result and timestamp.
6. Needs-action pill when applicable.
7. Contextual CTAs:
   - `Authorize` for draft/pending connection paths.
   - `Reauthorize` for `requires_reauth`.
   - `Sync Fees` for connected/degraded.
   - `Disconnect` for connected/requires_reauth.

### 2. Right-Side Drawer (Selected Installation)

Drawer modules:
1. Header:
   - Provider + installation identity.
   - Status + health.
   - Copyable installation identifier.
2. Auth lifecycle:
   - Auth strategy and safe session metadata.
   - Contextual auth actions (authorize/reauth/credentials).
3. Capability and sync health:
   - Capability status list.
   - Fee sync status (last run, last error code if any).
   - `Run Fee Sync` action.
4. Operation runs timeline:
   - Recent runs with operation type, status, actor, timestamps, result/failure codes.
   - Incremental load behavior for longer histories.
5. Safety actions:
   - `Disconnect` with explicit confirmation copy.

Interaction behavior:
1. Card select opens drawer and syncs query param.
2. Refresh preserves selection when still available.
3. Action execution shows pending state and reconciles with backend result.
4. Errors are shown inline at module level, not hidden in transient toasts only.

## Data Contract and Frontend State

### SDK Contract Additions/Usage

Read operations:
1. `listIntegrationProviders()`
2. `listIntegrationInstallations()`
3. `listIntegrationOperationRuns(installationId)`
4. `getInstallationAuthStatus(installationId)`

Write operations:
1. `startInstallationAuthorize(installationId)` -> returns authorize URL.
2. `startInstallationReauth(installationId)` -> returns authorize URL.
3. `submitInstallationCredentials(installationId, credentials)`
4. `disconnectInstallation(installationId)`
5. `startIntegrationFeeSync(installationId)`

### Frontend State Model

Page-level:
1. `installations`, `providers`, `kpis`, `filters`, `selectedInstallationId`
2. `loading`, `error`, `lastRefreshedAt`

Drawer-level:
1. `authStatus`
2. `operationRuns`
3. `actionPendingMap` keyed by action type

Action flow:
1. Authorize/Reauth:
   - Request authorize URL from SDK.
   - Redirect browser to provider URL.
   - On callback return to app, reload hub and restore selected installation by query param.
2. Fee sync:
   - Trigger action and show queued immediate state.
   - Refresh runs/status until terminal result.
3. Disconnect:
   - Confirmation gate, then action.
   - Rebind card and drawer to disconnected state after success.

Error handling:
1. Preserve backend structured `error.code` in UI.
2. Render operator-friendly copy mapped by code while keeping raw code visible where useful.
3. Provide retry controls at each failed module boundary.

## Professional Architecture Rationale

1. Runtime operations are separated from commercial setup to reduce cognitive load and improve long-term maintainability.
2. Grid + drawer model supports high-throughput operator workflows while preserving list context.
3. URL-addressable selection enables shareable incident links and reproducible troubleshooting.
4. SDK-only data flow keeps the frontend contract-centered and aligned with platform architecture rules.

## Testing Strategy

SDK tests:
1. Endpoint/method correctness for new runtime actions.
2. Structured error propagation integrity.

Feature tests:
1. Loading/error/empty/data rendering for hub and drawer modules.
2. Card selection and URL synchronization behavior.
3. Conditional action visibility by installation state.
4. Action dispatch correctness and pending/error transitions.

App routing smoke tests:
1. `/integrations` renders.
2. Deep link query opens expected drawer selection.

Regression guard:
1. Existing `Marketplaces` setup flows remain unchanged and passing.

## Acceptance Criteria

1. Operator can view all installations with status and health in a single operational screen.
2. Operator can trigger authorize, reauthorize, disconnect, and fee-sync actions from the runtime hub.
3. OAuth actions correctly redirect through provider authorize URLs from backend response.
4. Fee-sync operation outcomes are visible in the per-installation timeline.
5. Operation run metadata is visible with status/result/failure signals.
6. UI never exposes secrets; only safe metadata.
7. All frontend integration calls use `sdk-runtime`.
8. Every data-fetching section includes loading, error, and empty states.
9. Existing setup page behavior remains stable.

## Definition of Done

1. New `/integrations` runtime hub implemented with installation grid and right drawer.
2. Required SDK methods and types implemented and tested.
3. Frontend tests pass for runtime flows and routing.
4. Contract parity with backend/OpenAPI endpoints validated.
5. Build and affected test suites are green.
