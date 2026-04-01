# VTEX Integration Reference

Source material: `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\Guia_Arquitetural_API_VTEX_Leandro.docx`

This document converts the VTEX architecture guide into implementation guidance for Marketplace Central.

## Executive summary

For our architecture, VTEX should not be treated as the master system for business intelligence or marketplace operations. VTEX is the operational hub that receives normalized data from Marketplace Central and turns it into:

- publishable catalog items
- channel-aware commercial context
- usable price and inventory state
- OMS order lifecycle

Marketplace Central remains the system of truth for:

- master product intelligence
- business rules and guardrails
- messaging and customer service
- marketplace monitoring and analytics
- cross-channel orchestration

The practical consequence is simple: our software should adapt to the VTEX model instead of trying to make VTEX behave like a generic product database.

## Recommended system positioning

### Marketplace Central

Use as the strategic core:

- master catalog and normalization
- pricing intelligence
- SLA guardrails
- channel monitoring
- message centralization
- alerting and reconciliation

### VTEX

Use as the operational commerce layer:

- product and SKU operational catalog
- trade policy context
- price publication
- inventory publication
- OMS order flow
- downstream marketplace distribution

### External marketplaces

Use as channel endpoints:

- listing exposure
- reputation
- channel-specific constraints
- customer questions and messages
- channel-side order details

## Core VTEX concepts we must respect

### Product vs SKU

This is the most important modeling rule.

- Product: commercial definition
- SKU: sellable and stockable unit

Most operational APIs revolve around the SKU, not the product. If our internal mapping treats them as the same thing, the integration will drift.

Implementation implication:

- our connector model must preserve both `product` and `sku`
- publish logic must be SKU-centered
- price and stock synchronization must always resolve to SKU

### Trade policy

Trade policy is the main context separator in VTEX. It controls how a product participates in a specific selling context.

Implementation implication:

- channel mapping in Marketplace Central should always include `channel -> trade_policy`
- channel publication eligibility must check trade policy before trying to publish
- channel-specific price strategies should map to VTEX pricing context, not ad hoc flags

### Warehouse and logistics

Stock is not just quantity. Stock only becomes sellable if it is attached to a valid logistics structure.

Implementation implication:

- inventory integration must consider warehouse context
- we should model "publishable stock" as operational stock in VTEX, not just raw ERP balance

### OMS

Orders live in VTEX OMS. That is the operational lifecycle we should read from when VTEX is the transactional hub.

Implementation implication:

- order synchronization should read OMS state
- invoicing and tracking integrations must be designed against OMS lifecycle rules

## Authentication guidance

The guide recommends `appKey` + `appToken` for backend integration.

Headers:

- `X-VTEX-API-AppKey`
- `X-VTEX-API-AppToken`

Implementation rules:

- never expose these credentials in frontend code
- keep separate credentials per environment and integration role
- grant least privilege
- rotate tokens periodically
- log correlation IDs and response failures for troubleshooting

## Catalog flow we should implement

The healthy VTEX catalog sequence is:

1. ensure category and brand exist
2. create product
3. create SKU under the product
4. attach specifications and images
5. activate only after operational prerequisites are satisfied
6. associate to the correct trade policy
7. configure price
8. configure stock
9. allow indexing and marketplace replication

Implementation implication:

- our VTEX connector should not be a single "send product" action
- it should be a staged pipeline with state tracking
- activation should happen only after completeness checks pass

## Pricing model implications

VTEX pricing should be treated as:

- base price
- fixed prices per context or trade policy
- promotional layers on top

Implementation implication:

- Marketplace Central must keep internal auditability for channel pricing intent
- we should not store just one final price value for multichannel operation
- our pricing simulator should be able to reason in channel context before writing to VTEX

## Inventory implications

Writing quantity alone is not enough. Inventory only becomes commercially available if logistics context is valid.

Implementation implication:

- do not consider inventory sync successful just because a stock endpoint returned `200`
- availability validation should include warehouse and operational context
- failed logistics context should block publication

## Marketplace publication implications

Marketplace publication in VTEX is not only catalog creation. A SKU can exist and still fail channel exposure if any of these are wrong:

- product inactive
- SKU incomplete
- missing trade policy association
- invalid category mapping
- invalid price
- invalid stock or logistics context

Implementation implication:

- publish flow must have a preflight validation stage
- failures should be stored as actionable states, not generic "sync failed"
- channel publication should be asynchronous and stateful

Recommended preflight checks:

- product active
- SKU complete
- images/specifications present
- trade policy mapped
- category mapped for destination
- price valid in context
- stock valid in context

## Orders, invoice, and tracking

The guide positions VTEX OMS as the system where order progression happens.

Implementation implication:

- for order monitoring, Marketplace Central should consume OMS state instead of inferring state from marketplace noise
- invoice and tracking APIs must be wrapped behind an internal order service, because routes can vary by architecture and account setup
- do not hardcode a single invoice route assumption across every account

## Recommended Marketplace Central architecture for VTEX

The guide strongly supports a three-layer split that matches our direction.

### 1. Core system

Marketplace Central:

- source of truth
- business rules
- analytics
- alerts
- message handling
- orchestration

### 2. VTEX connector

A dedicated adapter layer that translates our internal model into VTEX:

- brand/category creation or lookup
- product creation
- SKU creation
- trade policy association
- price updates
- inventory updates
- OMS synchronization
- reconciliation

### 3. Channel-specific connectors

Use when VTEX is not the right control plane:

- messages
- reputation
- channel-specific SLAs
- competitive monitoring

This is directly aligned with our long-term plan: VTEX as commerce hub, Marketplace Central as intelligence and orchestration hub.

## Practical decisions for our implementation

Based on the guide, these should be treated as implementation rules:

1. VTEX is not our master catalog.
2. Marketplace Central owns business intelligence and orchestration.
3. Product and SKU must remain distinct in our domain model.
4. Trade policy is mandatory channel context, not optional metadata.
5. Price and stock writes must be context-aware.
6. Publication should be staged and asynchronous.
7. OMS is the source for order lifecycle when VTEX is the transaction layer.
8. Messaging should remain outside VTEX unless a specific account proves otherwise.

## What this means for the next implementation phases

### Phase 3: VTEX connector

We should build Phase 3 around:

- product pipeline state machine
- SKU-centric synchronization
- trade policy aware publication
- operational validation before activation
- reconciliation logs per entity and per channel

### Phase 4: Messaging and orders

We should assume:

- orders can be read from VTEX OMS
- customer messages probably need channel-specific connectors
- SLA and guardrails belong in Marketplace Central, not in VTEX

### Phase 5: Multi-marketplace

VTEX should remain the publication and transaction layer where applicable, but:

- channel-specific messaging remains in direct connectors
- channel-specific reputation remains outside VTEX
- marketplace-specific publishing exceptions should be tracked in our own state model

## Suggested internal model additions

To implement VTEX cleanly later, Marketplace Central should eventually track:

- `vtex_account`
- `vtex_trade_policy`
- `vtex_category_mapping`
- `vtex_brand_mapping`
- `vtex_product_id`
- `vtex_sku_id`
- `publication_state`
- `publication_error_code`
- `publication_error_message`
- `last_sync_at`
- `last_publish_attempt_at`

## Final guidance

The strongest takeaway from the guide is this:

VTEX should be treated as a structured commerce execution layer, not as the brain of the operation.

If we preserve that separation, the architecture stays stable:

- Marketplace Central decides
- VTEX operationalizes
- marketplaces execute channel outcomes

