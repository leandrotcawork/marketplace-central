# Classifications Management Page — Design Spec

## Purpose

A dedicated page for creating, editing, and managing classifications. Users can create a classification, give it a name and optional AI context, and add/remove products using a full product table with search, filter, and bulk selection. Replaces the need to manage classification membership one product at a time via the Products page panel.

## Route & Navigation

- **Route:** `/classifications`
- **Sidebar:** New nav item "Classifications" between "Products" and "VTEX Publisher"
- **Icon:** `Tags` from lucide-react
- The existing classification checkboxes in the Products page detail panel remain functional (quick toggle use case).

## Layout

Two-column layout, full height of the main content area:

```
┌─────────────────────────────────────────────────────────────────────┐
│  LEFT COLUMN (280px)           │  RIGHT COLUMN (remaining width)   │
│                                │                                   │
│  [+ New Classification]        │  Name: [VTEX Ready          ]     │
│                                │  AI Context: [optional text  ]    │
│  ● VTEX Ready         (42)    │                                   │
│    Marketplace Promo   (18)    │  [🔍 Search…] [Taxonomy ▼]       │
│    Clearance           (7)     │  42 selected · Select All · Clear │
│                                │                                   │
│                                │  ┌────────────────────────────┐   │
│                                │  │ ☑ Product table (25/page)  │   │
│                                │  │   with checkboxes          │   │
│                                │  │   ☑ = in classification    │   │
│                                │  └────────────────────────────┘   │
│                                │  Showing 1–25 of 3858  Prev Next  │
└─────────────────────────────────────────────────────────────────────┘
```

### Left Column — Classification List

- **"+ New Classification" button** at the top
- List of all classifications, each showing:
  - Name (text, truncated if long)
  - Product count badge (right-aligned)
  - Trash icon (visible on hover, right side)
- Selected classification has highlighted background (`bg-blue-50`, `border-l-2 border-blue-500`)
- Sorted alphabetically by name
- Scrollable if many classifications

### Right Column — Detail View

Shown only when a classification is selected (or a new one is being created).

**Empty state (no selection):** Centered text: "Select a classification or create a new one."

**Header section:**
- **Name** — text input. Saves on blur or Enter key. Required field.
- **AI Context** — optional textarea (2 rows). Saves on blur. For notes about the classification's purpose.

**Product table section (below header):**
- Filter bar: search input + taxonomy dropdown
- Selection count + "Select All Filtered" + "Clear All" buttons
- `PaginatedTable` with checkboxes, 25 rows per page
- Columns: checkbox, Name, SKU, Brand, Cost, Price, Stock
- **Checked = product is in the classification.** Unchecking removes it.
- Changes to product membership save immediately via API (no separate save button)
- Products already in the classification are pre-checked when the page loads

## Interactions

### Creating a Classification

1. User clicks "+ New Classification"
2. A new entry appears in the left list, selected, named "Untitled"
3. Right column opens with name field focused and empty
4. User types a name
5. Classification is **created via API on the first product check** (not before, to avoid empty classifications in the DB)
6. If user clicks away without adding any products, the "Untitled" entry is discarded (no API call made)

### Editing a Classification

1. Click a classification in the left list
2. Right column loads its data: name, AI context, and pre-checked products
3. Name/context changes save on blur or Enter via `PUT /classifications/{id}`
4. Checking a product calls `PUT /classifications/{id}` with the updated `product_ids` array
5. Unchecking a product does the same (removes the product_id from the array)

### Deleting a Classification

1. Hover over a classification in the left list — trash icon appears
2. Click trash icon — confirm dialog: "Delete {name}? This won't delete the products."
3. Confirmed — `DELETE /classifications/{id}`, remove from list, right column shows empty state

## API Endpoints Used

All endpoints already exist:

| Action | Method | Endpoint |
|--------|--------|----------|
| List all | `GET` | `/classifications` |
| Create | `POST` | `/classifications` |
| Get one | `GET` | `/classifications/{id}` |
| Update | `PUT` | `/classifications/{id}` |
| Delete | `DELETE` | `/classifications/{id}` |
| List products | `GET` | `/catalog/products` |
| List taxonomy | `GET` | `/catalog/taxonomy` |

## Client Interface

```typescript
interface ClassificationsClient {
  listClassifications: () => Promise<{ items: Classification[] }>;
  createClassification: (req: CreateClassificationRequest) => Promise<Classification>;
  updateClassification: (id: string, req: UpdateClassificationRequest) => Promise<Classification>;
  deleteClassification: (id: string) => Promise<void>;
  listCatalogProducts: () => Promise<{ items: CatalogProduct[] }>;
  listTaxonomyNodes: () => Promise<{ items: TaxonomyNode[] }>;
}
```

All methods already exist in `createMarketplaceCentralClient()` from `packages/sdk-runtime`.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/feature-classifications/src/ClassificationsPage.tsx` | Main page component |
| Create | `packages/feature-classifications/src/ClassificationsPage.test.tsx` | Tests |
| Create | `packages/feature-classifications/src/index.ts` | Package exports |
| Create | `packages/feature-classifications/package.json` | Package config |
| Create | `packages/feature-classifications/tsconfig.json` | TypeScript config |
| Modify | `apps/web/src/app/Layout.tsx` | Add nav item |
| Modify | `apps/web/src/app/AppRouter.tsx` | Add route + wrapper |

## Component Decomposition

The page is a single component `ClassificationsPage` with internal state management. No sub-components needed beyond what `PaginatedTable` and `Button` provide from `@marketplace-central/ui`. The left list and right detail are rendered as two divs within a flex container.

## State Management

```
- classifications: Classification[]          // loaded on mount
- products: CatalogProduct[]                 // loaded on mount
- taxonomyNodes: TaxonomyNode[]              // loaded on mount
- selectedId: string | null                  // which classification is selected
- isCreatingNew: boolean                     // creating a new (unsaved) classification
- draftName: string                          // name field value
- draftAiContext: string                     // ai_context field value
- search: string                             // product table search
- taxonomyFilter: string                     // product table taxonomy filter
- savingName: boolean                        // debounce indicator
```

Product membership (which products are checked) is derived from the selected classification's `product_ids` array. No separate selection state needed — `classifications` state is the source of truth.

## Error Handling

- Failed API calls show a red toast/banner below the header section
- If creating fails, the "Untitled" entry stays and user can retry
- If delete fails, classification stays in the list with an error message
- Network errors on product toggle: revert the checkbox optimistically, show error

## Tech Stack

React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, lucide-react. Uses `PaginatedTable` and `Button` from `@marketplace-central/ui`.
