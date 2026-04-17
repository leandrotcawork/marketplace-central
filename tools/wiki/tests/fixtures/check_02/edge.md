---
kind: flow
title: OAuth
status: active
owners: [claude, leandro]
since: 2026-04-17
last_verified: 2026-04-17
depends_on: []
related: []
sources: []
---

# OAuth

## Actors
Integration admin and provider OAuth server.

## Trigger
User clicks connect provider.

## Step-by-step sequence
_N/A — sequence deferred for this edge fixture_

## Failure modes
_N/A — failure catalogue deferred for this edge fixture_

## Idempotency / retry
Retry on transient token exchange errors.

## Observability
Action/result/duration logs emitted.

## Related wiki
`wiki/modules/integrations.md`.

## Sources
apps/server_core/internal/modules/integrations/application/oauth_flow.go:1-8@abcdef1
