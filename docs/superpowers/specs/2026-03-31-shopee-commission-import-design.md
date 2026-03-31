# Shopee Commission Import — Design Spec

Date: 2026-03-31

## Summary
Add a Shopee commission import flow that calculates commission per product based on a price-tier contract table (no API integration). The import produces per-product previews and grouped summaries in the same shape used by existing marketplace import routes.

## Goals
- Provide a Shopee import route that returns commission previews based on price tiers.
- Keep logic consistent with existing marketplace import flows.
- Persist imported rules via existing store logic (no new persistence layer).

## Non-Goals
- No Shopee API integration, authentication, or live commission fetching.
- Do not consider Pix subsidy in calculations.
- No new UI components; reuse existing import panel.

## Commission Rules (Contract)
Interpretation (price based on product base price):
- <= R$79,99: 20% + R$4
- R$80,00–R$99,99: 14% + R$16
- R$100,00–R$199,99: 14% + R$20
- R$200,00–R$499,99: 14% + R$26
- >= R$500,00: 14% + R$26

Pix subsidy is ignored per requirement.

## Architecture
New/updated pieces:
- `lib/clients/shopee.ts`
  - A small helper to resolve commissionPercent and fixedFeeAmount given a base price.
- `app/api/marketplace-commission-import/shopee/route.ts`
  - Mirrors existing import routes (Amazon/Magalu/Madeira).
  - Builds `MarketplaceCommissionImportProductPreview[]` and grouped previews.
  - Marks entries as `importable` when price is valid; `error` otherwise.
  - Uses `sourceType: "contract"`, `sourceRef: "Contrato Shopee CNPJ — tabela por faixa de preço"`.
- `lib/marketplace-seed.ts`
  - Keep Shopee base commission at 0/0 (no single base rate), but set:
    - `sourceType: "contract"`
    - `sourceRef: "Contrato Shopee CNPJ — tabela por faixa de preço"`
    - `notes: "Comissão tiered por faixa de preço. Use import para regras precisas."`

## Data Flow
1. User triggers Shopee commission import in the existing UI panel.
2. Import route loads products and computes commission per product using tier table.
3. Route returns product previews and group summaries.
4. Store applies import (group rules and per-product overrides) as it does for other marketplaces.

## Error Handling
- If product base price is missing or <= 0, mark preview as `error` with a clear message.
- Group status becomes `error` if all products in the group are invalid; otherwise `importable`.

## Testing
- Manual: run import for Shopee with a mix of prices across all tiers.
- Verify group summaries reflect the tiered values.
- Validate calculations in the simulator after import.

## Open Questions
None.
