# Fee Sync Installation Capabilities Design

**Date:** 2026-04-10
**Task:** T-027
**Status:** Draft for review

## Goal

Implement installation-scoped `pricing_fee_sync` operations for all providers that declare the capability, using a unified orchestration path shared by manual API triggers and a background scheduler.

The first slice must:
- support both `api_sync` and `seed` fee-source providers
- execute manual sync asynchronously and return `operation_run_id`
- enforce bounded automatic retries for transient failures
- update `operation_runs` and `capability_states` consistently

## Scope

Included:
- installation-scoped fee sync orchestration in `integrations`
- manual async trigger endpoint
- background scheduler for eligible installations
- provider runtime split by fee source (`api_sync` vs `seed`)
- capability-state updates for current sync health
- operation-run persistence for queue/running/final states
- tests for service, transport, scheduler, and integration paths

Excluded:
- frontend UX work for sync controls and status display
- provider sandbox validation and runbook publication
- expanding beyond `pricing_fee_sync` to other capabilities in this task

## Recommended Architecture

Use a unified orchestration service in `apps/server_core/internal/modules/integrations/application`.

Add:
- `application/fee_sync_service.go`
- `ports/fee_sync_executor.go`
- `background/fee_sync_scheduler.go`
- `transport/fee_sync_handler.go`

Keep responsibilities split as follows:
- `integrations` owns orchestration, retry policy, capability-state transitions, and operation-run lifecycle
- `marketplaces` continues to own fee schedule persistence and lookup
- provider adapters only fetch or reseed fee rows and return structured execution results

## Core Flow

Both manual HTTP triggers and scheduler ticks call the same orchestration path.

The service flow is:
1. Load installation and provider definition.
2. Confirm the provider declares `pricing_fee_sync`.
3. Resolve persisted capability state for the installation.
4. Reject or short-circuit invalid runtime states:
   - installation not connected
   - auth/config missing for `api_sync`
   - retry cooldown active
   - unsupported runtime mode
5. Record an `operation_run` as `queued`, then `running`.
6. Execute provider sync through a fee-sync executor.
7. Persist final `operation_run` result.
8. Update installation capability state based on outcome.

## Provider Runtime Behavior

`api_sync` providers:
- require valid installation/auth state
- fetch fresh fee rows from provider-facing adapter logic
- upsert those rows through marketplace fee-schedule persistence

`seed` providers:
- reseed deterministically from registry/source package on each sync
- still create a real `operation_run`
- still update capability state based on execution result

This keeps one mental model for sync across providers while allowing different data sources.

## Service Boundary

Introduce a port like:

```go
type FeeSyncExecutor interface {
    Execute(ctx context.Context, installation domain.Installation, provider domain.ProviderDefinition) (FeeSyncResult, error)
}

type FeeSyncResult struct {
    RowsSynced     int
    ResultCode     string
    FailureCode    string
    Transient      bool
    RequiresReauth bool
}
```

The executor translates runtime work into a structured result. Application code remains responsible for retry decisions and capability-state mapping.

## Capability-State Model

For `pricing_fee_sync`, the first slice uses:
- `enabled` on successful sync
- `degraded` on transient execution failure
- `requires_reauth` on credential/auth failure
- `unsupported` when capability is declared but runtime mode cannot execute it

This gives the system a current operational truth independent of raw operation history.

## Operation-Run Model

Manual sync is async-only.

Proposed endpoint behavior:
- `POST /integrations/installations/{installation_id}/fee-sync`
- response: `202 Accepted`
- payload includes:
  - `installation_id`
  - `operation_run_id`
  - `status`

Operation runs should capture:
- queue/start/final lifecycle
- attempt count
- result/failure code
- actor identity (`system` for scheduler, user/system source for manual path)

If existing operation-run listing is insufficient for polling/UI, add a read endpoint scoped by installation.

## Scheduler Behavior

Add a background scheduler that:
- scans installations whose provider declares `pricing_fee_sync`
- only schedules eligible connected installations
- skips installations with in-flight runs
- skips installations inside retry cooldown
- calls the same orchestration service used by manual HTTP

The scheduler must not own business logic beyond scanning and dispatch.

## Retry Policy

Use bounded automatic retries for transient failures only.

First-slice policy:
- maximum 3 automatic attempts
- backoff derived from recent failed operation runs for the installation/capability
- no automatic retries for:
  - `requires_reauth`
  - `unsupported`
  - invalid installation/configuration states

Manual trigger remains available even after automatic retries are exhausted.

## Data Ownership And Dependencies

`integrations` depends on:
- installation repository/service
- capability-state store/service
- operation-run store/service
- provider-definition lookup
- auth/session state as needed for `api_sync`
- fee-sync executor port

executor implementations depend on:
- marketplace fee-schedule repository/service
- provider-specific fetch/reseed logic

No transport handler or background job should perform direct fee-sync policy decisions.

## Error Handling

Use structured codes aligned with existing conventions.

Examples:
- `INTEGRATIONS_FEE_SYNC_INVALID`
- `INTEGRATIONS_FEE_SYNC_UNSUPPORTED`
- `INTEGRATIONS_FEE_SYNC_RETRY_COOLDOWN`
- `INTEGRATIONS_FEE_SYNC_REQUIRES_REAUTH`
- `INTEGRATIONS_FEE_SYNC_PROVIDER_ERROR`

Map failures as follows:
- invalid request or installation state -> immediate rejection
- transient remote/provider failures -> failed operation run + capability `degraded`
- auth/credential failures -> failed operation run + capability `requires_reauth`
- runtime unsupported mode -> failed operation run + capability `unsupported`

## Testing Strategy

Application tests:
- successful `api_sync` run
- successful `seed` reseed run
- transient failure maps to `degraded`
- auth failure maps to `requires_reauth`
- unsupported runtime mode maps to `unsupported`
- retry cooldown skip
- bounded automatic retry behavior
- manual trigger returns async operation metadata

Background tests:
- scheduler selects only eligible installations
- scheduler skips in-flight and cooldown-blocked installations
- scheduler delegates to application service only

Transport tests:
- `POST` returns `202 Accepted` with `operation_run_id`
- invalid installation/mode returns structured error

Integration tests:
- one `api_sync` provider stub path
- one `seed` provider path
- operation-run + capability-state persistence assertions

## Implementation Sequencing Recommendation

Implement operation-run persistence-first, then scheduler.

Rationale:
- manual and scheduler paths both depend on a stable async operation contract
- retry/cooldown policy is naturally expressed on top of persisted operation history
- it reduces the risk of building a scheduler before the operation semantics are stable

## Acceptance Criteria

- Manual fee sync starts asynchronously and returns `operation_run_id`
- Scheduler and manual path share one orchestration service
- All providers declaring `pricing_fee_sync` are handled through runtime fee-source branching
- `seed` providers reseed deterministically on sync
- transient failures are retried automatically within bounded policy
- permanent failures do not auto-retry
- capability state reflects current sync health
- operation runs provide reliable execution history per installation
