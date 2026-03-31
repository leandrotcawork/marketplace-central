# Simulador EAN Ref Display Design

**Goal:** Show EAN and Ref lines under the SKU in the Simulador product column when available.

**Architecture:** Extend the product cell rendering to conditionally display `ean` and `referencia` values. No data flow changes.

**Tech Stack:** Next.js App Router, React client components.

---

## Behavior
- In the product column, below the SKU, show:
  - `EAN: <value>` if `product.ean` exists
  - `Ref: <value>` if `product.referencia` exists
- If a value is missing, its line is not rendered.

## UI Details
- Same typography as SKU (mono, `text-xs`).
- Prefixes are literal `EAN:` and `Ref:`.
- No other layout changes.

## Error Handling
- None needed; missing values simply skip rendering.

## Testing
- Optional: UI test to assert EAN/Ref lines appear when present and are absent otherwise.

## Out of Scope
- Any new columns or new data sources.
