# Leroy Merlin — API Integration Reference

**Channel ID:** `leroy`
**Auth strategy:** `api_key`
**Rollout stage:** `wave_2` / **Execution mode:** `planned`
**Platform:** Mirakl Seller API v2
**Base URL:** `https://leroymerlin.mirakl.net/api`
**Developer portal:** https://developer.mirakl.com
**Sandbox:** Planned — requires homologation with Leroy Merlin

---

## Capabilities

| Capability | Status | Notes |
|---|---|---|
| publish | supported | POST /api/offers (offer-centric model) |
| priceSync | supported | POST /api/offers — price in offer payload |
| stockSync | supported | POST /api/offers — quantity in offer payload |
| orders | supported | GET /api/orders, accept + ship endpoints |
| messages | partial | Thread-based messaging — requires homologation |
| questions | partial | Via threads — homologation required |
| freightQuotes | planned | /api/shipping/zones + carrier config |
| webhooks | blocked | Depends on Leroy Merlin homologation |
| sandbox | planned | Will be provided after seller agreement |

---

## 1. Authentication (API Key)

Mirakl uses a static API Key — no OAuth flow, no token refresh.

```http
// All requests include:
Authorization: {LEROY_API_KEY}
// (Note: Mirakl uses raw API key in Authorization header, NOT "Bearer" prefix)
```

### Storage

- `api_key` encrypted via `encryptSecretPayload()` in `marketplace_connections.secret_payload`
- `shop_id` stored in `marketplace_connections.external_account_id`
- No expiry — rotate on security events only

### Environment variables

```env
LEROY_API_KEY=              # Provided by Leroy Merlin after seller onboarding
LEROY_SHOP_ID=              # Your shop identifier on Leroy's Mirakl instance
LEROY_BASE_URL=https://leroymerlin.mirakl.net/api
```

---

## 2. Mirakl Offer Model (Key Concept)

Mirakl separates **Products** (catalog master data) from **Offers** (seller-specific price/stock/conditions).

```
Product (Leroy's catalog):
  product_sku: "LER-12345"
  name: "Furadeira XYZ"
  ean: "7891234567890"
  category: "Ferramentas"
  [attributes managed by Leroy]

Offer (Your seller listing on that product):
  offer_sku: "PROD-001"           ← Your SKU
  product_sku: "LER-12345"        ← Leroy's product catalog reference
  price: 299.90
  quantity: 10
  condition: "NEW"
  description: "Seu texto de venda específico"
  seller_id: {LEROY_SHOP_ID}
```

> **Critical:** You create an **offer** (your price + stock) on an **existing product** (Leroy's catalog).
> You can also propose new products via `POST /api/products` but they go through Leroy's approval.

---

## 3. Create / Update Offer (Product + Price + Stock)

The `POST /api/offers` endpoint handles both creation and update (upsert by `offer-sku`).

```http
POST /api/offers
Authorization: {LEROY_API_KEY}
Content-Type: application/json

{
  "offers": [
    {
      "offer-sku": "PROD-001",           // Your internal SKU
      "product-sku": "LER-12345",        // Leroy catalog product SKU (find via product search)
      "price": "299.90",
      "quantity": 10,
      "state": "11",                     // "11" = New (Mirakl condition codes)
      "description": "Vendido e entregue por Nome da Sua Loja.",
      "logistic-class": "STD",           // Freight class — configure with Leroy
      "available-start-date": "2026-01-01",
      "available-end-date": "2026-12-31",
      "discount-price": "",              // Promotional price (leave empty if none)
      "discount-start-date": "",
      "discount-end-date": "",
      "shop-sku": "PROD-001",            // Your shop-facing SKU reference
      "min-quantity-alert": 2           // Reorder alert threshold
    }
  ]
}

Response: 200 OK (bulk accept — errors reported per offer in response body)
{
  "offer_errors": [],                   // Empty = all accepted
  "offers_created": ["PROD-001"],
  "offers_updated": []
}
```

### Mirakl condition codes

| Code | Meaning |
|---|---|
| `11` | New |
| `1` | Used — Like New |
| `2` | Used — Very Good |
| `3` | Used — Good |

---

## 4. Inventory Update Only

Use the same `POST /api/offers` with only `offer-sku` + `quantity` to update stock:

```http
POST /api/offers
{
  "offers": [
    { "offer-sku": "PROD-001", "quantity": 25 },
    { "offer-sku": "PROD-002", "quantity": 8 }
  ]
}
```

---

## 5. Price Update Only

Use the same endpoint with only `offer-sku` + `price`:

```http
POST /api/offers
{
  "offers": [
    { "offer-sku": "PROD-001", "price": "319.90" }
  ]
}
```

---

## 6. Product Catalog Search

Find Leroy's catalog `product-sku` for a given EAN (needed to create an offer):

```http
GET /api/products/skus?ean=7891234567890

Response:
{
  "products": [
    {
      "product-sku": "LER-12345",
      "title": "Furadeira XYZ 650W",
      "category": "Ferramentas/Furadeiras",
      "ean": "7891234567890"
    }
  ]
}
```

If no product found, you must propose a new product (see below).

### Propose new product (for items not in Leroy's catalog)

```http
POST /api/products
{
  "products": [
    {
      "shop-sku": "PROD-001",
      "category": "Ferramentas",
      "title": "Furadeira XYZ 650W",
      "brand": "Nome da Marca",
      "ean": "7891234567890",
      "description": "Descrição do produto...",
      "images": ["https://..."],
      "attributes": {
        "potencia_w": "650",
        "voltagem": "220V"
      }
    }
  ]
}
```

Product proposals go through Leroy's review before becoming available for offers.

---

## 7. Orders

### Fetch orders

```http
GET /api/orders
  ?start-update-date=2026-01-01T00:00:00Z
  &order-states=WAITING_ACCEPTANCE,SHIPPING
  &max=100
  &page-token={nextPageToken}

Response: { "orders": [...], "total_count": 50, "next_page_token": "..." }
```

Key order fields:

| Field | Description |
|---|---|
| `order_id` | Mirakl order identifier |
| `order_lines[].offer_sku` | Your SKU |
| `order_lines[].quantity` | Qty ordered |
| `order_lines[].price` | Unit price |
| `order_lines[].id` | Order line ID (used for accept/ship) |
| `customer.firstname/lastname` | Buyer name |
| `shipping.address` | Delivery address |
| `status.state` | Order state |

### Accept order lines

```http
PUT /api/order-lines/accept
{
  "order_lines": [
    { "id": "order-line-id-1", "order_line_state": "ACCEPTED" },
    { "id": "order-line-id-2", "order_line_state": "REFUSED", "order_line_additional_fields": [{ "code": "REFUSAL_REASON", "value": "OUT_OF_STOCK" }] }
  ]
}
```

### Ship order line

```http
PUT /api/order-lines/ship
{
  "order_lines": [
    {
      "id": "order-line-id-1",
      "tracking_number": "BR123456789BR",
      "carrier_name": "Correios",
      "carrier_tracking_url": "https://www.correios.com.br/rastreamento/..."
    }
  ]
}
```

---

## 8. Messages (Threads — Partial)

> Requires homologation with Leroy Merlin before threads are activated on your seller account.

### List message threads

```http
GET /api/threads
  ?entity_type=ORDER
  &entity_id={order_id}
```

### Reply to a thread

```http
POST /api/threads/{thread_id}/messages
{
  "body": "Olá! Seu pedido foi enviado com o código de rastreio BR...",
  "to": ["CUSTOMER"]                  // or ["OPERATOR"] for Leroy staff
}
```

---

## 9. Webhooks (Blocked — Pending Homologation)

> Webhooks are blocked until Leroy Merlin completes homologation with our integration.
> Once unblocked, register via Mirakl's notification subscription API.

**Planned webhook events:**

| Event | Description |
|---|---|
| `ORDER_CREATED` | New order placed by buyer |
| `ORDER_LINE_UPDATED` | Order line state change |
| `OFFER_UPDATED` | Offer status change (approved, rejected) |
| `MESSAGE_RECEIVED` | New message in a thread |

---

## 10. Integration Architecture

### Connection flow (wave_2)

```
/api/marketplace-connections/leroy/connect
  → User provides API Key from Leroy seller portal
  → Validate: GET /api/account (Mirakl basic health check)
  → encrypt API key → store in marketplace_connections
  → return connection status
```

### Publish flow

```
POST /api/marketplace-publish
  body: { channelId: 'leroy', items: ProductItem[] }

Per item:
  1. GET /api/products/skus?ean={ean} → find Leroy product_sku
  2. If found: POST /api/offers with product_sku
  3. If not found: POST /api/products to propose new product
     → store as "pending_catalog_review"
     → create offer when product approved
  4. Store { sku, offer_sku, product_sku } in publish_results
```

### Stock + price sync

```
POST /api/offers with { offer-sku, quantity } for stock
POST /api/offers with { offer-sku, price } for price
Can batch multiple offers in same request (Mirakl accepts arrays)
```

---

## 11. Wave 2 Readiness Checklist

Before going live with Leroy Merlin:

- [ ] Seller agreement signed with Leroy Merlin
- [ ] API key received from Leroy Merlin seller portal
- [ ] Sandbox credentials provided by Leroy
- [ ] Freight carrier config agreed (logistic-class values)
- [ ] Webhook homologation completed
- [ ] Product catalog mapping tested (EAN → product_sku)
- [ ] Category + attribute mapping validated with Leroy's taxonomy
- [ ] Order acceptance SLA agreed (Mirakl has default 2-day acceptance window)

---

## Known Limitations / Gotchas

- **Offer-centric model:** You cannot publish without a matching `product-sku` in Leroy's catalog. Pre-check by EAN.
- **No webhooks yet:** Poll `/api/orders` for new orders until webhooks are homologated.
- **Messages partial:** Thread API exists but may be gated per seller account. Test after homologation.
- **Freight logistic-class:** Must match Leroy's configured classes. Get the list from Leroy seller portal.
- **String prices:** Mirakl uses strings for price ("299.90") — not floats. Always serialize to exactly 2 decimal places.
- **Mirakl API is operator-customized:** Some endpoints and fields may differ from generic Mirakl docs. Always test against leroymerlin.mirakl.net specifically.
