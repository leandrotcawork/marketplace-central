# Simulador Preco Manual Prioritario Design

**Goal:** When applying “Usar sugestão MS” in the simulador, prefer the manual suggested price (if present) over the MS suggestion.

**Architecture:** Reuse the existing manual suggested price store and resolve a per-product “preferred suggestion” in the simulador. If manual exists, it wins; otherwise fall back to `product.msPriceSuggestion`.

**Tech Stack:** Next.js App Router, React client components, Zustand stores.

---

## Behavior
- Clicking **“Usar sugestão MS”** (global) applies the **manual suggested price** when available.
- Clicking the per-product **“MS”** button follows the same rule.
- If neither manual nor MS suggestion exists, no price change is applied.

## Data Source
- Manual suggested price is stored in `useProductSuggestedPriceStore`, keyed by `productId`.
- MS suggestion remains `product.msPriceSuggestion` from MetalShopping.

## Selection Rule
For each product:
1. If manual suggested price exists, use it.
2. Else, if `product.msPriceSuggestion` exists, use it.
3. Else, do nothing.

## UI
- No UI changes. Only the behavior of existing buttons changes.

## Error Handling
- None required; if a value is missing, it simply skips.

## Testing
- Unit test for selection logic is optional.
- UI test should validate that manual prices are applied when “Usar sugestão MS” is clicked.

## Out of Scope
- New UI controls or toggles.
- Persisting manual suggestions to server.
