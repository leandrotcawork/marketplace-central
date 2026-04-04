# UX Redesign — Products, VTEX Publisher, Pricing Simulator

> Date: 2026-04-04
> Status: Design — awaiting approval
> Scope: Three pages share the same root UX problems; this spec addresses all three.

---

## Root Problems (shared by all three pages)

| Problem | Impact |
|---------|--------|
| All 3,858 products rendered in DOM at once | Browser freeze on load, scroll lag, unusable table |
| Form fields / primary action buried below a huge table | Users must scroll past the entire catalog to do anything |
| Products page: clicking Edit opens a centered modal | Context is lost; can't see table while editing |
| Products page: no way to create or manage classifications | Feature exists in backend, invisible in UI |
| VTEX Publisher: classification filter exists but "load all" requires manual select-all | Friction for the most common workflow |
| Pricing Simulator: policy picker and Run button are 3 scroll-sections below the fold | Users don't see the action until after they scroll |

---

## Design System

- **Colors:** Primary `#2563EB`, Background `#F8FAFC`, Text `#1E293B`, Success `#10B981`, Danger `#EF4444`
- **Typography:** Inter (existing), tabular-nums for all monetary/numeric columns
- **Transitions:** 150–300ms ease-out for panels and state changes
- **Icons:** lucide-react (existing), consistent 16px stroke-2
- **Spacing:** 4/8pt rhythm, 16px horizontal page padding

---

## Page 1 — Products

### Layout

```
┌──────────────────────────────────────────────────────────────────┬─────────────────────┐
│  HEADER ROW                                                       │                      │
│  "Products"  3,858 items                  [+ New Classification]  │   DETAIL PANEL       │
│                                                                   │   (slide-over)        │
├──────────────────────────────────────────────────────────────────│                      │
│  FILTER BAR                                                       │                      │
│  [🔍 Search name, SKU, EAN…] [Taxonomy ▼] [Classification ▼]    │                      │
│                                                                   │                      │
├──────────────────────────────────────────────────────────────────│                      │
│  TABLE (25 rows/page)                                             │                      │
│  Name        SKU      Brand     Cost    Price   Stock  Dims  ✏   │                      │
│  ─────────────────────────────────────────────────────────────   │                      │
│  Product A   SKU001   Brand X   R$12    R$20    100    ✓     [✏]  │                      │
│  Product B   SKU002   Brand Y   R$8     R$15    50     —     [✏]  │                      │
│  ...                                                              │                      │
├──────────────────────────────────────────────────────────────────│                      │
│  PAGINATION                                                       │                      │
│  [← Prev]  Page 1 of 155  [Next →]  25 per page                  │                      │
└──────────────────────────────────────────────────────────────────┴─────────────────────┘
```

### Detail Panel (right side — 380px wide)

Opens when user clicks the ✏ edit button on any row. Slides in from the right. Table remains fully visible and interactive.

```
┌───────────────────────────────┐
│ Product A          [×] Close  │
│ SKU: SKU001 · EAN: 789...     │
│ Brand: Brand X                │
├───────────────────────────────│
│ ENRICHMENT                    │
│                               │
│ Dimensions (cm)               │
│ Height [ 10.5 ]  Width [ 5.0 ]│
│ Length [ 15.0 ]               │
│                               │
│ Suggested Price (R$)          │
│ [ 24.90                     ] │
│                               │
├───────────────────────────────│
│ CLASSIFICATIONS               │
│                               │
│ [✓] VTEX Ready (42 products)  │
│ [ ] Fragile Shipping (8)      │
│ [ ] Promo Products (120)      │
│ [ ] High Margin (88)          │
│                               │
│ [+ Create new classification] │
│                               │
├───────────────────────────────│
│          [Cancel]  [Save]     │
└───────────────────────────────┘
```

### New Classification Flow (inline in panel)

When user clicks "+ Create new classification":
- Panel expands to show name input and description field
- On save: classification created, panel returns to list with new item checked

### Interactions

| Action | Behavior |
|--------|----------|
| Click ✏ on row | Panel slides in from right (300ms ease-out); row gets blue left border highlight |
| Click × or press Esc | Panel closes; row highlight removed |
| Change classification checkbox | Auto-saves classification membership immediately (no wait for Save button) |
| Click Save | Saves enrichment fields only (dimensions, suggested price); shows checkmark feedback |
| Change filter | Table resets to page 1 |
| Pagination | Keeps panel open if editing; updates table; scrolls table to top |

### Pagination Spec

- **25 rows per page** (client-side, in-memory)
- Controls: `← Prev | Page X of Y | Next →` + "25 per page" label
- Filter changes reset to page 1
- "Showing 25–50 of 3,858 products" count displayed below filter bar

---

## Page 2 — VTEX Publisher

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER: "VTEX Publisher"                                            │
│                                                                      │
│  CONFIG BAR (always visible at top)                                  │
│  Account [tfcvgo        ] Policy [1  ] Warehouse [1_1]  [Publish →]  │
│                                                                      │
│  ── if no account: inline warning "Account required" ──             │
├──────────────────────────────────────────────────────────────────────│
│  SELECTION BAR                                                       │
│  [🔍 Search…] [Taxonomy ▼]  [Load Classification ▼]                 │
│                                                                      │
│  18 selected · [Select All Filtered] [Clear All]                     │
├──────────────────────────────────────────────────────────────────────│
│  TABLE (25 rows/page, checkboxes)                                    │
│  □ Name        SKU     Brand    Cost    Price   Stock                │
│  ─────────────────────────────────────────────────────────────────  │
│  ✓ Product A   SKU001  Brand X  R$12    R$20    100                  │
│  □ Product B   SKU002  Brand Y  R$8     R$15    50                   │
├──────────────────────────────────────────────────────────────────────│
│  [← Prev]  Page 1 of 155  [Next →]                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Behavior Changes

**"Load Classification" dropdown:**
- Opens a dropdown of all classifications with product counts
- Selecting one: auto-checks ALL products in that classification across ALL pages
- Does NOT filter the table — just adds them to selection
- Counter shows "18 selected (12 from VTEX Ready)"

**Publish button behavior:**
- Sticky at the top — always reachable, never below the fold
- Disabled + tooltip "Select at least one product" when 0 selected
- Shows badge: `[Publish 18 products →]` when products are selected
- On submit: inline success banner replaces config bar; redirects to batch page after 2s

**Selected state across pages:**
- Checked rows stay checked when paginating (current behavior preserved)
- "Select All Filtered" checks all filtered results across ALL pages (not just visible 25)
- Blue row highlight on selected rows

---

## Page 3 — Pricing Simulator

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER: "Pricing Simulator"                                         │
│                                                                      │
│  COMMAND BAR (always visible at top)                                 │
│  Policy [Shopee — 16% comm, 2% min margin ▼]                        │
│  Use suggested price [toggle]    [▶ Run Simulation]                  │
│                                                                      │
│  Policy detail row: Commission 16% · Fixed R$0 · Ship R$0 · Min 2%  │
├──────────────────────────────────────────────────────────────────────│
│  FILTER BAR                                                          │
│  [🔍 Search…] [Taxonomy ▼] [Classification ▼]                       │
│  N selected                                                          │
├──────────────────────────────────────────────────────────────────────│
│  PRODUCT TABLE (25 rows/page, with inline results if run)            │
│                                                                      │
│  Before simulation:                                                  │
│  □  Name        SKU     Brand    Cost    Price   Stock               │
│  ─────────────────────────────────────────────────────────────────  │
│  □  Product A   SKU001  Brand X  R$12    R$20    100                 │
│                                                                      │
│  After simulation:                                                   │
│  □  Name        SKU     Cost    Price   Sim.Price  Margin   Status   │
│  ─────────────────────────────────────────────────────────────────  │
│  □  Product A   SKU001  R$12    R$20    R$23.50  ████ 18%  healthy   │
│  □  Product B   SKU002  R$8     R$15    R$17.20  ██   8%   warning   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────│
│  [← Prev]  Page 1 of 155  [Next →]                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Inline Results Design

When simulation runs, the table transitions to show results inline:
- Margin % cell: color-coded pill (green ≥20%, amber 10–20%, red <10%)
- Margin bar: small horizontal bar (like a mini progress bar, 40px wide) inside the cell
- New columns added: "Sim. Price", "Margin", "Status"
- Columns that existed before (Cost, Price) become smaller/secondary

**Summary row** appears above the table after simulation:
```
┌──────────────────────────────────────────────────────────┐
│ Simulation: 18 products · Avg margin 14.2%               │
│ ✓ Healthy: 8    ⚠ Warning: 6    ✗ Critical: 4            │
└──────────────────────────────────────────────────────────┘
```

### Key Behavior Changes

- Policy picker at top, always visible — no scrolling to reach it
- "Run Simulation" button disabled until products AND policy are both selected
- Running simulation shows loading overlay on table rows (skeleton shimmer), not a page-level spinner
- Results are NOT cleared when changing filters — persisted until user clicks "Clear Results" or changes policy

---

## Shared Component: Paginated Table

All three pages use the same table pattern. This should become a shared primitive in `packages/ui/`.

### Props spec

```typescript
interface PaginatedTableProps<T> {
  items: T[];           // full filtered list
  pageSize?: number;    // default: 25
  renderHeader: () => React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
  loading?: boolean;
}
```

### Pagination component

```
[← Prev]  Showing 26–50 of 3,858  [Next →]   [25 ▼] per page
```

- Page size selector: 25, 50, 100
- Keyboard: left/right arrow keys when focused on pagination

---

## Shared Component: Detail Panel (slide-over)

Used by Products page initially. VTEX Publisher and Simulator can adopt later.

```typescript
interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number; // default: 380
}
```

- Renders as `position: fixed; right: 0; top: nav-height; bottom: 0`
- Main content layout shifts right by panel width when open (not overlay)
- `Esc` key closes
- `aria-label`, `role="complementary"`, focus trap

---

## Implementation Order

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Paginated table (shared) + add to all 3 pages | Medium | Critical — fixes performance |
| 2 | Config bar to top (VTEX Publisher + Simulator) | Small | High — fixes buried actions |
| 3 | Detail panel (slide-over) for Products | Medium | High — fixes edit UX |
| 4 | Classifications management in panel | Medium | High — new feature |
| 5 | "Load Classification" dropdown (VTEX Publisher) | Small | High — workflow shortcut |
| 6 | Inline results in Simulator table | Medium | Medium — visual improvement |
| 7 | Summary banner post-simulation | Small | Medium — at-a-glance insight |

---

## What Is NOT Changing

- No visual redesign of colors, typography, or component styles (deferred per user)
- No backend API changes — all pagination is client-side
- No changes to MarketplaceSettings page
- No changes to BatchDetailPage
