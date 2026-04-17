---
title: Pricing Module
kind: module
status: active
last_verified: "2025-01-01"
related: []
depends_on: []
---

# Pricing Module

## Purpose

Handles pricing calculations and margin thresholds.

## Scope — In

Margin simulation, price tier computation.

## Scope — Out

Order fulfillment, shipping costs.

## Key entities

PriceRule, MarginThreshold

## Ports

PricingRepository, MarketplaceRateProvider

## Adapters

PostgresPricingAdapter, VtexRateAdapter

## Transport

POST /pricing/simulate, GET /pricing/rules

## Data model

mpc_price_rules, mpc_margin_thresholds

## Flows referenced

flow/checkout-pricing.md

## Gotchas

commissionPercent is stored as decimal (0.16 not 16).

## Related wiki

wiki/modules/marketplace.md

## Sources

internal/modules/pricing
