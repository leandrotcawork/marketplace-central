# Marketplace Central — Design Spec

## Context

A finishing materials company (porcelain, metals, ceramics) needs a pricing and multi-marketplace publishing platform. The app imports product catalogs from `.xlsx`, calculates margins per marketplace, compares with competitor prices (mock), uses AI for pricing recommendations, and simulates publishing to marketplaces. This is an MVP — no authentication, no backend, all client-side with localStorage persistence.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Framework | Next.js 15 (App Router) | Latest stable, Turbopack, React 19 |
| AI Provider | OpenAI GPT-4o | User preference, good cost-benefit for structured JSON analysis |
| AI API Key | Server-side via `.env` + API Route | Avoids exposing key in browser |
| Package Manager | Bun | Already installed, fastest option |
| Project Location | `~/Documents/marketplace-central` | User preference |
| Approach | Monolith Sequential | Single project, 7 screens built sequentially |

## Architecture

```
[Browser]
  ├── Pages (7 routes — App Router)
  ├── Components (isolated per feature)
  ├── Stores (Zustand — 3 stores with localStorage persist)
  ├── Libs (calculations, formatters, mock-data, openai-client, xlsx-parser)
  └── Next.js API Route (/api/analyze) → OpenAI GPT-4o
```

### Data Flow

1. XLSX upload → SheetJS parse (client-side) → `productStore`
2. Marketplace config → `marketplaceStore` (6 pre-configured + custom)
3. Margin calculations: pure functions in `lib/calculations.ts`
4. Competitor data: generated from `productStore` + `marketplaceStore` with realistic variation
5. AI analysis: client → `/api/analyze` (API Route) → OpenAI → `analysisStore`
6. All stores use Zustand `persist` middleware → localStorage

### Dependencies

- `next`, `react`, `react-dom`, `typescript`, `tailwindcss`
- `shadcn/ui` (via CLI init)
- `zustand` (global state)
- `recharts` (charts)
- `xlsx` (SheetJS — XLSX parsing)
- `openai` (official SDK)
- `framer-motion` (animations)
- `@tanstack/react-table` (table virtualization)
- `lucide-react` (icons — comes with shadcn/ui)

## Data Model

### Product
```typescript
interface Product {
  id: string            // uuid
  sku: string
  name: string
  category: string
  cost: number          // BRL
  basePrice: number     // BRL
  stock: number
  unit: string          // "m²", "unidade", etc.
}
```

### Marketplace
```typescript
interface Marketplace {
  id: string
  name: string          // "Mercado Livre", "Amazon Brasil", etc.
  commission: number    // decimal (0.16 = 16%)
  fixedFee: number      // BRL per sale
  active: boolean
  notes?: string        // e.g., "frete gratis acima de R$79"
}
```

Pre-configured marketplaces:
- Mercado Livre: 16%, R$0 fixed
- Amazon Brasil: 15%, R$8 fixed (FBA)
- Shopee: 14%, R$2 fixed
- Magalu: 16%, R$0 fixed
- Leroy Merlin: 18%, R$0 fixed
- Madeira Madeira: 15%, R$0 fixed

### MarginResult
```typescript
interface MarginResult {
  productId: string
  marketplaceId: string
  sellingPrice: number
  commission: number    // BRL value
  margin: number        // BRL value
  marginPercent: number
  health: 'good' | 'warning' | 'critical'  // >20%, 10-20%, <10%
}
```

Calculation:
```
margin = sellingPrice - cost - (sellingPrice * commissionRate) - fixedFee
marginPercent = (margin / sellingPrice) * 100
```

### CompetitorPrice
```typescript
interface CompetitorPrice {
  productId: string
  competitorName: string
  marketplace: string
  price: number
  diff: number          // % difference from your price
  scrapedAt: string     // ISO date
}
```

### AIAnalysis
```typescript
interface AIAnalysis {
  productId: string
  recommendations: Record<string, number>  // marketplaceId → suggested price
  viability: Record<string, number>        // marketplaceId → score 1-10
  justification: string
  strategy: 'penetracao' | 'premium' | 'competitivo'
  alerts: string[]
}
```

### Publication
```typescript
interface Publication {
  id: string
  productId: string
  marketplaceId: string
  price: number
  margin: number
  status: 'draft' | 'ready' | 'published'
  publishedAt?: string
}
```

## Zustand Stores

### useProductStore
- `products: Product[]`
- `addProduct(product)`, `updateProduct(id, partial)`, `removeProduct(id)`
- `importFromXLSX(data)`, `clearAll()`
- Persist to localStorage key `marketplace-central-products`

### useMarketplaceStore
- `marketplaces: Marketplace[]` (pre-populated with 6)
- `toggleActive(id)`, `updateMarketplace(id, partial)`, `addCustom(marketplace)`
- Persist to localStorage key `marketplace-central-marketplaces`

### useAnalysisStore
- `competitorPrices: CompetitorPrice[]`
- `aiAnalyses: AIAnalysis[]`
- `publications: Publication[]`
- `setCompetitorData(data)`, `addAnalysis(analysis)`, `addPublication(pub)`, `updatePublicationStatus(id, status)`
- Persist to localStorage key `marketplace-central-analysis`

## Screens

### 1. Catalogo (`/catalogo`)

**Components:** FileUpload, ProductTable, ProductForm

- Drag-and-drop zone for `.xlsx` upload
- SheetJS parses client-side, validates columns: SKU, Nome, Categoria, Custo, Preco Base, Estoque, Unidade
- Editable table via `@tanstack/react-table` with inline editing
- Red cell highlights for invalid/missing data (negative cost, empty fields)
- Category dropdown filter (auto-extracted from data) + text search by name/SKU
- "Adicionar Produto" button opens ProductForm modal
- Product counter badge

### 2. Marketplaces (`/marketplaces`)

**Components:** MarketplaceCard

- 6 pre-configured marketplace cards in a responsive grid
- Each card: name, commission %, fixed fee, active toggle, edit fields
- "Adicionar Marketplace" button for custom entries
- Toggle active/inactive for simulation inclusion

### 3. Simulador (`/simulador`)

**Components:** MarginTable, MarginIndicator

- Cross-table: rows = products, columns = active marketplaces
- Each cell: selling price, commission (R$), margin (R$ and %), health indicator
- Health colors: green (>20%), yellow (10-20%), red (<10%)
- Inline price editing for scenario simulation
- Top summary: total products, average margin, critical products count
- Export button (CSV download)

### 4. Concorrencia (`/concorrencia`)

**Components:** CompetitorSearch, PriceComparison

- Search by product triggers mock scraping (800ms simulated delay)
- `lib/mock-competitors.ts` generates 3-5 competitors per marketplace with ±5% to ±25% price variation
- Results table: product, competitor, price, marketplace, diff %, date
- Side-by-side comparison: your price vs lowest vs average
- Recharts horizontal bar chart showing price position in market range
- Labels: "Mais barato", "Na media", "Mais caro"

### 5. Analise IA (`/analise-ia`)

**Components:** AnalysisCard, ViabilityGauge

- Product selection (checkboxes or "select all")
- "Analisar" button calls `/api/analyze`
- API Route (`app/api/analyze/route.ts`): reads `OPENAI_API_KEY` from `.env`, calls GPT-4o with structured prompt, returns JSON
- AnalysisCard per product: current vs suggested price (with delta arrow), strategy badge, expandable justification
- ViabilityGauge: styled progress bar 1-10 per marketplace
- "Aplicar Sugestao" updates basePrice in productStore

**OpenAI Prompt:**
```
Voce e um analista de pricing para marketplace brasileiro de acabamentos.
Analise os dados abaixo e retorne APENAS JSON valido.

Produto: {name}
Custo: R${cost}
Preco atual: R${basePrice}
Margens por marketplace: {margins object}
Precos de concorrentes: {competitors array}

Retorne JSON: {
  "recomendacao_preco": { "marketplace_id": preco_sugerido, ... },
  "viabilidade": { "marketplace_id": score_1_a_10, ... },
  "justificativa": "texto",
  "estrategia": "penetracao" | "premium" | "competitivo",
  "alerta": ["risco1", ...]
}
```

### 6. Dashboard (`/dashboard`)

**Components:** KPICard, Charts

- 5 KPI cards: total products, avg margin, best marketplace, at-risk products (<10% margin), AI opportunities
- Recharts charts:
  - Bar chart: average margin per marketplace
  - Scatter plot: margin vs stock volume
  - Pie chart: product distribution by strategy
  - Heatmap: colored grid products x marketplaces (margin = color)
- Top 10 opportunities table (largest delta between current and AI-suggested price)
- All data reactive to global state

### 7. Publicar (`/publicar`)

**Components:** PublishList, PublishReview

- Product list with checkboxes
- Expanded view per product: marketplace toggles, editable price, calculated margin, status badge
- Publication flow: select → choose marketplaces → review → "Publicar" (2s animation → "Publicado")
- Publication history stored in analysisStore
- Post-publication summary: products count, marketplaces count, average margin

## Design System

### Theme: Industrial-Premium (Dark)

**Colors (CSS Variables):**
```css
--bg-primary: #0F1117;
--bg-secondary: #1A1D27;
--bg-tertiary: #242836;
--border: #2E3347;
--text-primary: #F0F0F5;
--text-secondary: #8B8FA3;
--accent-primary: #3B82F6;
--accent-success: #10B981;
--accent-warning: #F59E0B;
--accent-danger: #EF4444;
--accent-purple: #8B5CF6;
```

**Typography (via `next/font/google`):**
- Headers: DM Sans (bold)
- Body: IBM Plex Sans
- Mono/Data: JetBrains Mono (monetary values, tables)

**Component Patterns:**
- Sidebar: fixed left, 260px expanded / 72px collapsed, Lucide icons, status badges per screen
- Cards: subtle borders, hover glow (`box-shadow: 0 0 20px rgba(59,130,246,0.1)`)
- Tables: alternating rows, sticky headers, hover highlight
- Margin badges: colored pills, pulse animation on critical values
- Modals: backdrop blur, slide-up entrance
- Loading: skeleton screens (not spinners)
- Page transitions: fade via Framer Motion
- Responsive: desktop-first, sidebar collapses at `< 1024px`, tables scroll horizontally

**Sidebar Status Logic:**
- Catalogo: green when products.length > 0
- Marketplaces: green when at least 1 active marketplace
- Simulador: green when user has visited with products + marketplaces
- Concorrencia: green when competitor data exists
- Analise IA: green when AI analyses exist
- Dashboard: always accessible (shows empty state)
- Publicar: green when at least 1 publication exists

## File Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # redirect to /catalogo
│   ├── catalogo/page.tsx
│   ├── marketplaces/page.tsx
│   ├── simulador/page.tsx
│   ├── concorrencia/page.tsx
│   ├── analise-ia/page.tsx
│   ├── dashboard/page.tsx
│   ├── publicar/page.tsx
│   └── api/
│       └── analyze/route.ts        # OpenAI proxy
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── PageHeader.tsx
│   ├── catalogo/
│   │   ├── FileUpload.tsx
│   │   ├── ProductTable.tsx
│   │   └── ProductForm.tsx
│   ├── marketplaces/
│   │   └── MarketplaceCard.tsx
│   ├── simulador/
│   │   ├── MarginTable.tsx
│   │   └── MarginIndicator.tsx
│   ├── concorrencia/
│   │   ├── CompetitorSearch.tsx
│   │   └── PriceComparison.tsx
│   ├── analise-ia/
│   │   ├── AnalysisCard.tsx
│   │   └── ViabilityGauge.tsx
│   ├── dashboard/
│   │   ├── KPICard.tsx
│   │   └── Charts.tsx
│   └── publicar/
│       ├── PublishList.tsx
│       └── PublishReview.tsx
├── stores/
│   ├── productStore.ts
│   ├── marketplaceStore.ts
│   └── analysisStore.ts
├── lib/
│   ├── calculations.ts
│   ├── xlsx-parser.ts
│   ├── mock-competitors.ts
│   ├── openai.ts
│   └── formatters.ts
├── types/
│   └── index.ts
└── styles/
    └── globals.css
```

## Verification

1. **XLSX Upload**: import a sample `.xlsx` with 5+ products, verify table renders correctly with editable cells
2. **Marketplace Config**: toggle marketplaces on/off, edit commission, verify changes persist after reload
3. **Margin Calculation**: verify formula: `margin = price - cost - (price * commission) - fixedFee`. Check health indicators match thresholds
4. **Competitor Mock**: search a product, verify 3-5 competitors appear per active marketplace with realistic price variation
5. **AI Analysis**: select products, click analyze, verify OpenAI returns structured JSON, verify "Aplicar Sugestao" updates prices
6. **Dashboard**: verify all charts render with current data, KPIs are accurate
7. **Publish Flow**: select products + marketplaces, publish, verify status changes and history records
8. **Persistence**: reload browser, verify all data persists via localStorage
9. **Responsive**: resize to tablet width, verify sidebar collapses and tables scroll
