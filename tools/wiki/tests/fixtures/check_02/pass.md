---
kind: module
title: Pricing
status: active
owners: [claude, leandro]
since: 2026-04-17
last_verified: 2026-04-17
depends_on: []
related: []
sources: []
---

# Pricing

## Purpose
Tracks pricing simulation behavior.

## Scope — In
Simulation orchestration and persistence.

## Scope — Out
Marketplace transport runtime internals.

## Key entities
Simulation, policy, override.

## Ports
Repository and fee lookup.

## Adapters
Postgres repository adapter.

## Transport
HTTP endpoints for simulate/list.

## Data model
`pricing_simulations` and overrides.

## Flows referenced
`wiki/flows/pricing-simulation.md`.

## Gotchas
Margin rules vary by listing type.

## Related wiki
`wiki/contracts/openapi.md`.

## Sources
apps/server_core/internal/modules/pricing/application/service.go:1-10@abcdef1
