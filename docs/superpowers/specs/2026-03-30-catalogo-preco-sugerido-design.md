# Catalogo Preco Sugerido Implementation Design

**Goal:** Show live MetalShopping suggested price in the catalog product panel, with local manual override stored per product.

**Architecture:** Add a dedicated GET route for single-SKU suggestions and fetch it when the product panel opens. Store the live suggestion in component state only, and persist any manual override in local SQLite-backed state (like dimensions).

**Tech Stack:** Next.js App Router (Route Handlers), React client components, Zustand + sqliteStorage, TypeScript.

---

## User Experience
- In `Catálogo`, clicking a product opens the right-side panel.
- Panel shows dimensões and a new "Preço Sugerido" section.
- On panel open, it calls the live API to fetch the suggested price.
- If the API returns a value, show it (read-only).
- If the API returns nothing, show the field empty for manual input.
- Manual input is stored locally per product and shown when present.

## Data Flow
1. User clicks product in `Catálogo`.
2. Panel opens and calls `GET /api/metalshopping/price-suggestion/[sku]`.
3. If suggestion exists, store it in component state (not persisted).
4. A new local store persists manual suggested price by `productId`.
5. Panel displays manual value if present; live MS value is shown as reference.

## API Contract
**Route:** `GET /api/metalshopping/price-suggestion/[sku]`
- **Input:** `sku` from route param
- **Output:**
  - Success with suggestion: `{ success: true, data: { sku: string, minPrice: number, observedAt?: string } }`
  - Success with no data: `{ success: true, data: null }`
  - Error: `{ success: false, error: string }`

## Persistence
- Manual suggested price is stored locally using a new Zustand store with sqlite-backed storage, keyed by `productId`.
- Live suggestion is not persisted (always fetched on open).

## Error Handling
- If API fails, show "Preço Sugerido indisponível" and keep manual input available.
- If API returns no suggestion, keep the field empty (manual input only).

## Testing
- Unit test the new store: set/get/clear for manual suggested prices.
- Component test: panel renders live suggestion when available, empty field when not, and persists manual value.

## Out of Scope
- Syncing manual suggested prices back to MetalShopping or server.
- Batch prefetching suggestions for all products.
