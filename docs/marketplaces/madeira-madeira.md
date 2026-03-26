# Madeira Madeira — API Integration Reference

**Channel ID:** `madeira`
**Auth strategy:** `token` (Bearer token)
**Rollout stage:** `wave_2` / **Execution mode:** `planned`
**Base URL:** TBD — provided via Postman collection from partner
**Developer portal:** Partner-only — request via seller account manager
**Sandbox:** Planned — requires sandbox access from Madeira Madeira team

> **Status:** Most capabilities are `planned` pending sandbox access and official Postman documentation from the partner. The **freight quote** endpoint is the only currently `supported` integration point.

---

## Capabilities

| Capability | Status | Notes |
|---|---|---|
| publish | planned | Endpoint known, awaiting sandbox validation |
| priceSync | planned | Endpoint known, awaiting sandbox validation |
| stockSync | planned | Endpoint known, awaiting sandbox validation |
| orders | planned | Endpoint known, awaiting sandbox validation |
| messages | blocked | Not documented — blocked until partner provides docs |
| questions | blocked | Not documented — blocked until partner provides docs |
| freightQuotes | **supported** | GET /v1/freight/quote — only live endpoint |
| webhooks | partial | Some event types available — details pending |
| sandbox | planned | Sandbox URL + credentials provided per partner agreement |

---

## 1. Authentication (Bearer Token)

```http
// All requests include:
Authorization: Bearer {MADEIRA_API_TOKEN}
```

> Unlike OAuth2, Madeira Madeira issues a **static bearer token** tied to your seller account. Tokens are long-lived (90+ days or permanent) and rotated manually via the seller portal.

### Storage

- `api_token` encrypted via `encryptSecretPayload()` in `marketplace_connections.secret_payload`
- `seller_id` stored in `marketplace_connections.external_account_id`
- Monitor expiry manually — no programmatic refresh flow

### Environment variables

```env
MADEIRA_API_TOKEN=          # From Madeira Madeira seller portal
MADEIRA_SELLER_ID=
MADEIRA_BASE_URL=           # Provided in Postman collection — not published publicly
```

---

## 2. Freight Quote (Supported)

This is the **only endpoint currently in production use**.

```http
GET /v1/freight/quote
Authorization: Bearer {MADEIRA_API_TOKEN}

Query parameters:
  ?origin_zip=01310100              // Sender ZIP code
  &destination_zip=30130010         // Buyer ZIP code
  &weight=1500                      // grams
  &length=30                        // cm
  &width=20
  &height=15
  &declared_value=299.90            // Item value for insurance

Response:
{
  "quotes": [
    {
      "carrier": "Correios",
      "service": "SEDEX",
      "price": 32.50,
      "delivery_days": 3,
      "deadline": "2026-01-19"
    },
    {
      "carrier": "Correios",
      "service": "PAC",
      "price": 18.90,
      "delivery_days": 7,
      "deadline": "2026-01-23"
    },
    {
      "carrier": "JadLog",
      "service": "Expresso",
      "price": 28.00,
      "delivery_days": 2,
      "deadline": "2026-01-18"
    }
  ]
}
```

---

## 3. Product Creation (Planned)

> Awaiting sandbox access + Postman collection confirmation. Endpoint shape below is based on partner communication and may change.

```http
POST /v1/products
Authorization: Bearer {MADEIRA_API_TOKEN}
Content-Type: application/json

{
  "sku": "PROD-001",
  "title": "Nome do produto",
  "description": "Descrição completa...",
  "brand": "Nome da Marca",
  "ean": "7891234567890",
  "category_id": "...",              // From Madeira's category tree
  "price": 299.90,
  "stock": 10,
  "attributes": {
    "material": "MDF",
    "cor": "Branco"
  },
  "images": [
    { "url": "https://...", "main": true }
  ],
  "dimensions": {
    "weight_kg": 1.5,
    "length_cm": 30,
    "width_cm": 20,
    "height_cm": 15
  }
}

Expected response:
{
  "product_id": "mdmad-abc123",
  "sku": "PROD-001",
  "status": "pending"               // Goes through approval
}
```

---

## 4. Stock Update (Planned)

```http
PUT /v1/products/{sku}/stock
{
  "quantity": 25,
  "warehouse": "default"
}
```

---

## 5. Price Update (Planned)

```http
PUT /v1/products/{sku}/price
{
  "price": 319.90,
  "promotional_price": 289.90,      // Optional
  "promo_from": "2026-02-01",
  "promo_until": "2026-02-28"
}
```

---

## 6. Orders (Planned)

### List orders

```http
GET /v1/orders
  ?status=pending
  &page=1
  &limit=50
  &created_after=2026-01-01T00:00:00Z
```

### Get single order

```http
GET /v1/orders/{order_id}
```

Expected key fields:

| Field | Description |
|---|---|
| `order_id` | Madeira order identifier |
| `status` | `pending` \| `confirmed` \| `shipped` \| `delivered` \| `cancelled` |
| `items[].sku` | Your SKU |
| `items[].quantity` | Qty |
| `items[].price` | Unit price |
| `customer.name`, `customer.cpf` | Buyer info |
| `shipping.address` | Delivery address |
| `freight.carrier` | Selected carrier |
| `freight.tracking_code` | Populated after ship |

### Confirm order

```http
PUT /v1/orders/{order_id}/accept
{
  "estimated_ship_date": "2026-01-17"
}
```

### Mark as shipped

```http
PUT /v1/orders/{order_id}/ship
{
  "tracking_code": "BR123456789BR",
  "carrier": "Correios",
  "service": "PAC",
  "shipped_at": "2026-01-17T10:00:00Z"
}
```

---

## 7. Webhooks (Partial)

> Specific event types available — pending full documentation from partner.

```http
// Register webhook (expected endpoint):
POST /v1/webhooks
{
  "url": "https://yourdomain.com/api/webhooks/madeira",
  "events": ["order.created", "order.status.changed"],
  "secret": "{MADEIRA_WEBHOOK_SECRET}"
}
```

**Known supported events (tentative):**

| Event | Description |
|---|---|
| `order.created` | New order placed |
| `order.status.changed` | Order status transition |
| `product.approved` | Product listing approved |
| `product.rejected` | Product listing rejected |

---

## 8. Messages (Blocked)

> Not yet documented. Blocked until Madeira Madeira provides official API documentation for their messaging system.

---

## 9. Integration Architecture

### Connection flow (wave_2)

```
/api/marketplace-connections/madeira/connect
  → User provides Bearer token from Madeira seller portal
  → Validate: GET /v1/account or basic health check
  → encrypt token → store in marketplace_connections
  → return connection status
```

### Freight flow (available now)

```
GET /api/freight-quote
  body: { channelId: 'madeira', origin, destination, dimensions, value }

  → GET /v1/freight/quote with mapped params
  → Return quotes array to caller
```

### Full publish flow (wave_2)

```
POST /api/marketplace-publish
  body: { channelId: 'madeira', items: ProductItem[] }

Per item:
  1. Map ProductItem → Madeira product body
  2. POST /v1/products → get product_id
  3. Store as "pending" until product.approved webhook
  4. Update stock + price after approval
```

---

## 10. Wave 2 Readiness Checklist

Before going live with Madeira Madeira:

- [ ] Seller agreement signed
- [ ] Bearer token issued from Madeira seller portal
- [ ] Sandbox URL + sandbox token received from partner
- [ ] Postman collection received and validated
- [ ] Category tree mapped to our product categories
- [ ] Product creation tested in sandbox (full roundtrip)
- [ ] Stock + price update tested in sandbox
- [ ] Order flow tested in sandbox (create → accept → ship)
- [ ] Webhook events confirmed and tested
- [ ] Freight carrier list validated against current Madeira supported carriers

---

## Known Limitations / Gotchas

- **Partner-only docs:** API documentation is not publicly available. All development depends on the Postman collection provided by the partner. Request updates as the API evolves.
- **Static token:** No OAuth refresh — token must be rotated manually. Set a calendar reminder for token expiry.
- **Freight is ready now:** The freight quote endpoint is the only one safe to call against production today. Use it for pre-sell freight estimates.
- **Messages blocked:** Do not attempt to implement messaging until partner provides documentation.
- **Webhook partial:** Implement order polling (`GET /v1/orders`) as fallback until webhooks are confirmed working.
