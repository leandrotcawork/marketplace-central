# Magalu — API Integration Reference

**Channel ID:** `magalu`
**Auth strategy:** `oauth2` (client_credentials)
**Rollout stage:** `v1` / **Execution mode:** `live`
**Base URL:** `https://api.magalu.com`
**Sandbox URL:** `https://sandbox.magalu.com`
**Developer portal:** https://developers.magalu.com

---

## Capabilities

| Capability | Status | Notes |
|---|---|---|
| publish | supported | POST /v1/sku — full product creation |
| priceSync | supported | PATCH /v1/sku/{id}/price |
| stockSync | supported | PATCH /v1/sku/{id}/stock |
| orders | supported | Full order lifecycle with status transitions |
| messages | supported | Chat + SAC tickets (post-purchase) |
| questions | supported | Q&A — fetch + answer |
| freightQuotes | planned | API endpoint exists but not yet integrated |
| webhooks | supported | Event subscriptions for orders, SKUs, questions |
| sandbox | supported | sandbox.magalu.com — full feature parity |

---

## 1. Authentication (OAuth2 — Client Credentials)

```http
POST https://api.magalu.com/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(CLIENT_ID:CLIENT_SECRET)}

grant_type=client_credentials
&scope=product:write product:read order:read order:write messaging:read messaging:write

Response:
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "product:write product:read order:read ..."
}
```

> Note: Client Credentials flow — no user redirect. Tokens are scoped to the seller account. Refresh by re-posting the same request.

### Storage

- `access_token` encrypted via `encryptSecretPayload()` in `marketplace_connections.secret_payload`
- `seller_id` stored in `marketplace_connections.external_account_id`
- No refresh token — re-authenticate when expired
- Proactively refresh every 50 minutes

### Environment variables

```env
MAGALU_CLIENT_ID=
MAGALU_CLIENT_SECRET=
MAGALU_SELLER_ID=
MAGALU_USE_SANDBOX=false
```

---

## 2. Product Creation (SKU)

```http
POST /v1/sku
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "sku": "PROD-001",                    // Your internal SKU
  "title": "Nome do produto",
  "description": "Descrição completa...",
  "brand": "Nome da Marca",
  "category": "Ferramentas/Furadeiras",
  "ean": "7891234567890",
  "ncm": "84672200",                    // Required for Brazilian fiscal compliance
  "attributes": [
    { "key": "Voltagem", "value": "220V" },
    { "key": "Potência", "value": "650W" }
  ],
  "images": [
    { "url": "https://...", "main": true },
    { "url": "https://...", "main": false }
  ],
  "dimensions": {
    "weight": 1500,                     // grams
    "length": 30,                       // cm
    "width": 20,
    "height": 15
  }
}

Response 201:
{
  "sku_id": "mglu-abc123",
  "status": "pending_review",           // review before going active
  "sku": "PROD-001"
}
```

### Get SKU status

```http
GET /v1/sku/{sku_id}
// status: pending_review | approved | rejected | active | inactive
```

### Update SKU data

```http
PATCH /v1/sku/{sku_id}
{
  "title": "Nome atualizado",
  "description": "Nova descrição"
}
```

---

## 3. Price Update

```http
PATCH /v1/sku/{sku_id}/price
{
  "price": 299.90,
  "promotional_price": 249.90,          // optional
  "promotional_start": "2026-02-01T00:00:00Z",
  "promotional_end": "2026-02-28T23:59:59Z"
}

Response 200: { "sku_id": "...", "price": 299.90 }
```

---

## 4. Stock Update

```http
PATCH /v1/sku/{sku_id}/stock
{
  "quantity": 50,
  "warehouse_id": "default"             // optional — use default warehouse
}

Response 200: { "sku_id": "...", "quantity": 50 }
```

---

## 5. Orders

### List orders

```http
GET /v1/orders
  ?status=paid
  &page=1
  &per_page=50
  &created_at_start=2026-01-01
  &created_at_end=2026-01-31

Response: { "data": [...], "total": 150, "page": 1 }
```

### Get single order

```http
GET /v1/orders/{order_id}
```

Key fields:

| Field | Description |
|---|---|
| `order_id` | Magalu order identifier |
| `status` | `new` \| `paid` \| `approved` \| `shipped` \| `delivered` \| `cancelled` |
| `items[].sku` | Your SKU |
| `items[].quantity` | Qty ordered |
| `items[].price` | Unit price |
| `buyer.name`, `buyer.cpf` | Buyer identity |
| `shipping.address` | Delivery address |
| `shipping.method` | Carrier + service level |

### Update order status

```http
POST /v1/orders/{order_id}/status

// Confirm order (accept):
{ "status": "approved" }

// Mark as shipped:
{
  "status": "shipped",
  "tracking": {
    "carrier": "Correios",
    "service": "PAC",
    "tracking_code": "BR123456789BR",
    "shipped_at": "2026-01-16T10:00:00Z"
  }
}

// Mark as delivered:
{ "status": "delivered", "delivered_at": "2026-01-20T15:30:00Z" }

// Cancel:
{ "status": "cancelled", "reason": "Produto fora de estoque" }
```

---

## 6. Q&A (Questions)

### Fetch unanswered questions

```http
GET /v1/questions
  ?status=pending
  &page=1
  &per_page=20

Response:
{
  "data": [
    {
      "question_id": "q-abc123",
      "sku_id": "mglu-abc123",
      "question": "O produto tem garantia?",
      "buyer": { "name": "João S." },
      "created_at": "2026-01-15T09:00:00Z",
      "status": "pending"
    }
  ]
}
```

### Answer a question

```http
POST /v1/questions/{question_id}/answers
{
  "answer": "Sim! O produto possui garantia de 12 meses do fabricante."
}

Response 200: { "question_id": "...", "status": "answered" }
```

---

## 7. Messaging (Chat + SAC)

### Post-purchase chat messages

```http
// List conversations for an order
GET /v1/orders/{order_id}/messages

// Send message to buyer
POST /v1/messages
{
  "order_id": "order-abc123",
  "text": "Olá! Seu pedido já foi enviado. Código de rastreio: BR..."
}
```

### SAC Tickets

```http
// List open tickets
GET /v1/tickets?status=open

// Get ticket detail
GET /v1/tickets/{ticket_id}

// Reply to ticket
POST /v1/tickets/{ticket_id}/messages
{
  "text": "Prezado cliente, estamos verificando a situação do seu pedido..."
}

// Close ticket
PUT /v1/tickets/{ticket_id}
{ "status": "closed", "resolution": "Problema resolvido pelo vendedor" }
```

---

## 8. Webhooks

### Register webhook endpoint

```http
POST /v1/webhooks
{
  "url": "https://yourdomain.com/api/webhooks/magalu",
  "events": [
    "order.status.changed",
    "sku.approved",
    "sku.rejected",
    "question.created",
    "ticket.created"
  ],
  "secret": "{MAGALU_WEBHOOK_SECRET}"   // for HMAC validation
}

Response: { "webhook_id": "wh-abc123", "status": "active" }
```

### Event types

| Event | Description |
|---|---|
| `order.status.changed` | Any order status transition |
| `order.created` | New order placed |
| `sku.approved` | SKU passed review, now active |
| `sku.rejected` | SKU rejected (includes rejection reason) |
| `sku.price.changed` | External price change (competitor pricing) |
| `question.created` | New buyer question posted |
| `ticket.created` | New SAC ticket opened |
| `ticket.updated` | SAC ticket status updated |

### Webhook payload

```json
{
  "event": "order.status.changed",
  "webhook_id": "wh-abc123",
  "timestamp": "2026-01-16T10:00:00Z",
  "data": {
    "order_id": "order-abc123",
    "status": "shipped",
    "previous_status": "approved"
  },
  "signature": "sha256=..."
}
```

### Signature validation

```typescript
// HMAC-SHA256(MAGALU_WEBHOOK_SECRET, JSON.stringify(payload.data))
// Compare to payload.signature (after "sha256=")
```

---

## 9. Integration Architecture

### Connection flow

```
Magalu uses client_credentials — no user redirect needed.
POST /api/marketplace-connections/magalu/connect
  → validate CLIENT_ID + CLIENT_SECRET
  → POST /oauth/token to get access_token
  → encrypt + store in marketplace_connections
  → return connection status
```

### Publish flow

```
POST /api/marketplace-publish
  body: { channelId: 'magalu', items: ProductItem[] }

Per item:
  1. Map ProductItem → Magalu SKU body (product-mapper.ts)
  2. POST /v1/sku → get sku_id
  3. SKU enters "pending_review" state
  4. Store { sku, sku_id, status: 'pending_review' } in publish_results
  5. Webhook: sku.approved → update status to 'active'
```

### Stock + price sync

```
Stock: PATCH /v1/sku/{sku_id}/stock { quantity }
Price: PATCH /v1/sku/{sku_id}/price { price }
Both: fire independently — no batching API available
```

### Known limitations / gotchas

- **SKU review required:** New SKUs enter `pending_review`. Don't surface as "published" until `sku.approved` webhook fires.
- **NCM required:** Brazilian fiscal code is mandatory. Map from product metadata or provide per-category default.
- **Sandbox parity:** sandbox.magalu.com mirrors production — use for all development and CI.
- **No batching:** Stock and price updates are one-call-per-SKU. For large catalogs, use request queuing with rate limiting.
- **Client Credentials only:** No per-user OAuth — credentials are seller-level. One set of credentials per Magalu seller account.
