# Simulator Comparison Redesign

## Purpose

Redesign the pricing simulator results view so it supports real marketplace comparison for each product. The current batch simulation works technically, but the UI collapses too much information into a single margin-oriented cell per marketplace. The new design should expose cost structure, shipping impact, and pre/post-shipping profitability in one lateral scan.

## Scope

- Redesign only the frontend presentation of `/simulator`
- Preserve the current batch simulation backend, SDK methods, and command-bar workflow
- Keep marketplace comparison within a single table row per product
- Keep inline selling-price overrides in the results view

Out of scope:

- Backend pricing formula changes
- New API fields
- Export features
- New persistence rules

## User Goal

For one product row, the user should be able to answer in a single glance:

- Which marketplace is healthiest for this SKU
- How much the marketplace itself costs
- How much shipping reduces profitability
- Whether a price override fixes the problem

## Layout

The page keeps the current sticky command bar and selection/filter workflow before a run. After a successful simulation, the results area becomes a comparison matrix:

- One product per row
- Left frozen columns for product context
- One marketplace card column per policy on the right
- Auto-height cards so the financial breakdown stays readable

### Left Frozen Columns

- Selection checkbox
- Product name
- SKU
- Product cost
- Reference price

`Reference price` means the global simulation basis selected in the command bar:

- `My price`
- `Suggested price`

## Sticky Command Bar

The command bar remains the page entry point and keeps these controls:

- `Origin CEP`
- `Destination CEP`
- `Price reference` switch: `My price` / `Suggested price`
- `Run simulation`

Rules:

- The selected price reference defines the initial selling price used for every product x marketplace result in that run
- Changing the price reference after a run clears results and inline overrides, forcing a new run
- Inline edits remain local product x marketplace overrides after the run

## Marketplace Card Column

Each marketplace column is rendered as a compact card block within the row. Cards are always visible after the run; there is no collapsed/expanded marketplace state.

Each card shows:

- Marketplace name
- Editable selling price
- `Marketplace cost: R$ X (Y%)`
- `Shipping: R$ X`
- `Margin before shipping: R$ X`
- Before-shipping margin chip with `%`
- `Final margin: R$ X`
- Final-margin chip with `%`

### Financial Semantics

- `Marketplace cost` is a grouped value: commission amount plus fixed fee amount
- The commission rate remains visible inside the grouped label: `Marketplace cost: R$ 32.40 (16%)`
- `Margin before shipping` is the result before subtracting freight
- `Final margin` is the current backend result after freight

This separation is mandatory because shipping is one of the main diagnostic dimensions for marketplace comparison.

## Visual Priority

The visual hierarchy inside each marketplace card should be:

1. Final margin percent chip
2. Final margin in `R$`
3. Marketplace cost
4. Shipping
5. Margin before shipping

Color is driven by final margin status:

- Green: healthy
- Amber: attention
- Red: critical

The final-margin chip must remain the most prominent signal in the row, but it must be surrounded by enough context to explain why the value is good or bad.

## Interaction Model

### Before Run

- Product selection table behaves as it does today
- Classification pills, search, and taxonomy filter remain available
- No marketplace cards are shown

### After Run

- The same product table becomes a comparison grid
- Each product row shows one marketplace card column per policy
- Results persist while filters change
- User can clear results explicitly

### Inline Price Editing

- Selling price is editable directly inside each marketplace card
- Commit on blur or Enter
- Escape restores the last committed value
- Editing one card updates only that product x marketplace result

The redesign keeps inline editing in the comparison surface because opening a separate detail panel would break side-by-side reasoning.

## Empty, Loading, and Error States

- Before data load: existing loading state remains
- Before simulation: normal product-selection table
- Simulation in progress: keep current run loading affordance, but results area should not flicker between layouts
- Run failure: existing error banner remains below the command bar
- No matching products: existing empty-state messaging remains

## Implementation Notes

- This redesign should reuse current batch simulation payloads
- No OpenAPI or SDK contract change is required
- Existing result indexing by `product_id::policy_id` remains valid
- The current collapsed/expanded marketplace-column state can be removed

## Testing

Frontend tests should be updated to verify:

- Marketplace comparison cards render after a run
- Each card shows marketplace cost, shipping, margin before shipping, final margin, and margin chips
- The price reference switch still controls run behavior and clears results when changed after a run
- Inline editing still commits per product x marketplace overrides
- Loading, error, and empty states remain covered

## Success Criteria

- A user can compare one product across all marketplaces without expanding hidden columns
- Shipping impact is visible without mental subtraction
- Final margin status is obvious through the chip color
- The view remains dense enough for analysis, but readable enough for diagnosis
