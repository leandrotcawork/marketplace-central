# ADR-001: MPC reads products directly from MetalShopping Postgres

**Date:** 2026-04-04
**Status:** accepted

## Context
MPC needs product catalog data (name, SKU, EAN, cost, price, stock, taxonomy) for pricing simulation,
VTEX publishing, and classification. MetalShopping already maintains this catalog in Postgres.

## Decision
MPC reads product data directly from MetalShopping's Postgres via a second read-only pgxpool (`msdb`).
MPC never writes to MetalShopping's tables. No sync/copy job or separate product table in MPC.

## Rationale
Avoids data duplication and sync lag. MetalShopping is the system of record for products.
A second pool with BeforeAcquire RLS context setting keeps tenant isolation intact.
Belt-and-suspenders: explicit `tenant_id = current_setting('app.tenant_id')` in every WHERE clause.

## Consequences
MPC catalog features depend on MetalShopping Postgres being available.
metalshopping_app user must have SELECT on catalog, pricing, inventory, taxonomy tables.
Backend cost resolution deferred — frontend sends cost_amount from MS product data.

## Alternatives Considered
- Sync job (copy products to MPC): rejected — sync lag, duplication, extra complexity
- REST API call to MetalShopping: rejected — latency, coupling to MS API availability
