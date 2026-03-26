# Mercado Livre — API Integration Reference

**Channel ID:** `mercado-livre`
**Auth strategy:** `oauth2`
**Rollout stage:** `v1` / **Execution mode:** `live`
**Base URL:** `https://api.mercadolibre.com`
**Developer portal:** https://developers.mercadolivre.com.br

---

## Capabilities

| Capability | Status | Notes |
|---|---|---|
| publish | supported | Full item creation |
| priceSync | partial | Price review mechanism may block immediate updates |
| stockSync | supported | Available quantity at item + variation level |
| orders | supported | Full order lifecycle |
| messages | partial | Only through pack threads (post-purchase) |
| questions | supported | Full Q&A — fetch + answer |
| freightQuotes | partial | Mercado Envios — carrier list available, label generation partial |
| webhooks | supported | All major topics supported |
| sandbox | blocked | MeLi has no official sandbox environment |

---

## 1. Authentication (OAuth2 — Authorization Code + PKCE)

### Flow

```
1. Redirect user to:
   GET https://auth.mercadolibre.com.br/authorization
     ?response_type=code
     &client_id={APP_ID}
     &redirect_uri={REDIRECT_URI}
     &code_challenge={code_challenge}
     &code_challenge_method=S256

2. MeLi redirects back to REDIRECT_URI with ?code={auth_code}

3. Exchange code for tokens:
   POST https://api.mercadolibre.com/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &client_id={APP_ID}
   &client_secret={APP_SECRET}
   &code={auth_code}
   &redirect_uri={REDIRECT_URI}
   &code_verifier={code_verifier}

   Response:
   {
     "access_token": "APP_USR-...",
     "token_type": "bearer",
     "expires_in": 21600,          // 6 hours
     "scope": "offline_access read write",
     "user_id": 123456789,
     "refresh_token": "TG-..."
   }

4. Refresh (before expiry):
   POST https://api.mercadolibre.com/oauth/token
   grant_type=refresh_token
   &client_id={APP_ID}
   &client_secret={APP_SECRET}
   &refresh_token={refresh_token}
```

### Storage

- `access_token` + `refresh_token` stored encrypted via `encryptSecretPayload()` in `marketplace_connections.secret_payload`
- `user_id` stored in `marketplace_connections.external_account_id`
- Refresh proactively when `expires_at - now < 30min`
- All calls use header: `Authorization: Bearer {access_token}`

### Environment variables

```env
ML_APP_ID=
ML_APP_SECRET=
ML_REDIRECT_URI=https://yourdomain.com/api/marketplace-connections/mercado-livre/callback
```

---

## 2. Product Listing (Items)

### Create item

```http
POST /items
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "title": "Nome do produto",
  "category_id": "MLB1051",           // Required — get from /categories
  "price": 299.90,
  "currency_id": "BRL",
  "available_quantity": 10,
  "buying_mode": "buy_it_now",
  "condition": "new",
  "listing_type_id": "gold_special",  // gold_pro | gold_special | gold_premium | free
  "description": {
    "plain_text": "Descrição completa..."
  },
  "pictures": [
    { "source": "https://..." }
  ],
  "attributes": [
    { "id": "BRAND", "value_name": "Nome da Marca" },
    { "id": "MODEL", "value_name": "Modelo" },
    { "id": "EAN", "value_name": "7891234567890" }
  ],
  "shipping": {
    "mode": "me2",                    // Mercado Envios 2
    "free_shipping": false,
    "local_pick_up": false
  }
}

Response 201:
{
  "id": "MLB1234567890",
  "status": "active",
  "permalink": "https://www.mercadolivre.com.br/..."
}
```

### Get category suggestions from title

```http
GET /sites/MLB/domain_discovery/search?q={title}&limit=5
```

### Get required attributes for a category

```http
GET /categories/{category_id}/attributes
```

### Update item

```http
PUT /items/{item_id}
{ "price": 289.90, "available_quantity": 15 }
```

### Pause / reactivate item

```http
PUT /items/{item_id}
{ "status": "paused" }   // or "active"
```

---

## 3. Inventory (Stock) Update

### Simple item (no variations)

```http
PUT /items/{item_id}
{ "available_quantity": 25 }
```

### Item with variations

```http
PUT /items/{item_id}/variations/{variation_id}
{ "available_quantity": 10 }
```

### Batch (up to 20 items via Multiget)

```http
PUT /items?ids=MLB1,MLB2,MLB3
[
  { "id": "MLB1", "available_quantity": 5 },
  { "id": "MLB2", "available_quantity": 3 }
]
```

---

## 4. Price Update

> **WARNING:** `priceSync` is `partial`. MeLi may apply a price review for items where the new price deviates significantly from market price. The item enters `under_review` state until approved. Implement polling or webhook listener for `item.price_review.closed` topic.

```http
PUT /items/{item_id}
{ "price": 349.90 }

// If price goes under review:
// item.status = "under_review"
// Poll GET /items/{item_id} or await webhook

// For variation-level pricing:
PUT /items/{item_id}/variations/{variation_id}
{ "price": 349.90 }
```

---

## 5. Orders

### Fetch orders (recent + by status)

```http
GET /orders/search?seller={user_id}&sort=date_desc&order.status=paid
GET /orders/search?seller={user_id}&q={search_term}
```

### Get single order

```http
GET /orders/{order_id}
```

Key fields:

| Field | Description |
|---|---|
| `order_items[].item.id` | MeLi item ID |
| `order_items[].quantity` | Qty sold |
| `order_items[].unit_price` | Unit price at purchase |
| `buyer.id` + `buyer.nickname` | Buyer info |
| `payments[].status` | `approved` \| `pending` \| `cancelled` |
| `shipping.id` | Shipping ID (for tracking) |
| `status` | `paid` \| `cancelled` \| `pending` |

### Confirm shipping / update status

```http
// MeLi handles most status transitions automatically via Mercado Envios
// For non-ME shipments (custom shipping):
PUT /shipments/{shipping_id}
{
  "tracking_number": "BR123456789BR",
  "tracking_method": "Correios PAC"
}
```

### Get order items

```http
GET /orders/{order_id}/order_items
```

---

## 6. Messages (Post-Purchase)

> Messages are tied to **packs** (grouped orders). `questions` capability covers pre-purchase Q&A separately.

### Get pack ID for an order

```http
GET /packs/search?order.id={order_id}
// or order object contains: order.pack_id
```

### List messages in a pack thread

```http
GET /messages/packs/{pack_id}/sellers/{seller_id}
```

### Send message to buyer

```http
POST /messages/action_guide/packs/{pack_id}/seller
Content-Type: multipart/form-data

{
  "from": { "user_id": {seller_user_id} },
  "to": [{ "user_id": {buyer_user_id} }],
  "text": "Olá, seu pedido foi enviado! Código de rastreio: BR..."
}
```

> **Limitation:** `messages` capability is `partial` — MeLi may restrict message content and frequency. Only send operational/order-related messages.

---

## 7. Pre-Purchase Q&A (Questions)

### Fetch unanswered questions

```http
GET /questions/search?seller_id={user_id}&status=unanswered&sort_fields=date_created&sort_types=DESC
```

### Get single question

```http
GET /questions/{question_id}
```

Key fields: `question.text`, `question.item_id`, `question.from.id`, `question.date_created`

### Answer a question

```http
POST /answers
{
  "question_id": 12345678,
  "text": "Olá! Sim, o produto possui garantia de 12 meses..."
}
```

> After answering, `question.answer.status = "active"` and the answer is public on the listing.

---

## 8. Freight / Shipping

### Get shipping methods for item

```http
GET /items/{item_id}/shipping_options?zip_code={buyer_zip}
```

### Create shipment label (Mercado Envios)

```http
// Labels are generated automatically by MeLi when buyer completes purchase
// For manual label request (custom logistics):
POST /shipments/{shipping_id}/print_label
// Returns PDF URL
```

### Track shipment

```http
GET /shipments/{shipping_id}
// Fields: status, substatus, tracking_number, carrier
```

---

## 9. Webhooks

### Register application webhook

Configure in MeLi Developer Portal: App > Notifications > Configure Notifications URL

`POST https://yourdomain.com/api/webhooks/mercado-livre`

### Webhook topics to subscribe

| Topic | Description |
|---|---|
| `items` | Item status changes (active, paused, closed, under_review) |
| `orders_v2` | New orders, payment status, cancellations |
| `questions` | New pre-purchase questions |
| `messages` | New post-purchase messages |
| `payments` | Payment status updates |
| `shipments` | Shipping status updates |

### Payload shape

```json
{
  "resource": "/orders/1234567890",
  "user_id": 123456789,
  "topic": "orders_v2",
  "application_id": 987654321,
  "attempts": 1,
  "sent": "2026-01-15T10:00:00.000Z",
  "_id": "abc123"
}
```

> Note: Webhook payload only contains `resource` path. You must `GET {resource}` to fetch the actual data.

### Webhook signature validation

```typescript
// MeLi sends X-Signature header: ts={timestamp},v1={hmac}
// Validate: HMAC-SHA256(secret, "x.{notification_id}:y.{user_id}:t.{timestamp}")
```

---

## 10. Integration Architecture

### Connection flow (our app)

```
/api/marketplace-connections/mercado-livre/auth
  → redirects to MeLi OAuth

/api/marketplace-connections/mercado-livre/callback?code=...
  → exchange code → encrypt tokens → store in marketplace_connections
  → redirect to /marketplaces

/api/marketplace-connections/mercado-livre/refresh (cron or on-demand)
  → decrypt → refresh → re-encrypt → update marketplace_connections
```

### Publish flow

```
POST /api/marketplace-publish
  body: { channelId: 'mercado-livre', items: ProductItem[] }

Per item:
  1. GET category from /sites/MLB/domain_discovery/search
  2. Map ProductItem → MeLi item body (product-mapper.ts)
  3. POST /items → get item_id
  4. Store item_id in publish_results table
  5. Return { success, externalId: item_id }
```

### Stock sync flow

```
PUT /api/marketplace-publish/stock
  body: { channelId: 'mercado-livre', updates: { sku, qty }[] }

Per update:
  1. Resolve item_id from publish_results by sku
  2. PUT /items/{item_id} { available_quantity: qty }
```

### Known limitations / gotchas

- **No sandbox:** All development must use real MeLi credentials against production (use low-quantity test listings).
- **Price review:** Never assume a price PUT is instant. Always handle `under_review` status.
- **Category required:** MeLi won't accept items without a valid `category_id`. Auto-suggest from title then confirm.
- **Listing type affects visibility and fee:** `gold_special` is the standard paid tier.
- **Token expiry is 6h:** Refresh tokens proactively. Refresh tokens expire after 6 months of non-use.
- **API rate limits:** 3 calls/sec per user. Use exponential backoff on 429.
