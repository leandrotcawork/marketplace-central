# ADR-002: MPC own tables live in `mpc` schema on MetalShopping's Postgres cluster

**Date:** 2026-04-04
**Status:** accepted

## Context
MPC needs its own tables (product_enrichments, classifications, marketplace_accounts, pricing_simulations, etc.)
but no separate Postgres instance exists for MPC in the current local dev environment.

## Decision
MPC's tables are created in a dedicated `mpc` schema on MetalShopping's Postgres cluster.
MC_DATABASE_URL uses `?search_path=mpc`. MS_DATABASE_URL points to the same cluster, public schema.

## Rationale
Avoids provisioning a second Postgres instance for local dev and early production.
Schema separation (mpc vs public) keeps MPC and MetalShopping tables cleanly isolated.
Same cluster simplifies ops; schema prefix prevents table name collisions.
Aligns with the future plan to merge MPC into MetalShopping as a module.

## Consequences
Both pools connect to the same Postgres cluster — single point of failure in dev.
metalshopping_app user needs CREATE/ALL on `mpc` schema (granted via GRANT ALL ON SCHEMA mpc).
Migration runner must always SET search_path = mpc before executing MPC migrations.

## Alternatives Considered
- Separate Postgres instance: rejected — over-engineered for local dev/early stage
- Same schema as MetalShopping (public): rejected — table name collision risk
