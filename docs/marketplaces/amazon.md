# Amazon Brasil — API Integration Reference

**Channel ID:** `amazon`
**Auth strategy:** `lwa` (Login with Amazon + AWS Signature V4)
**Rollout stage:** `v1` / **Execution mode:** `live`
**SP-API Base URL (production):** `https://sellingpartnerapi-na.amazon.com`
**SP-API Base URL (sandbox):** `https://sandbox.sellingpartnerapi-na.amazon.com`
**Developer portal:** https://developer.amazonservices.com.br

---

## Capabilities

| Capability | Status | Notes |
|---|---|---|
| publish | supported | Listings Items API v2021-08-01 |
| priceSync | supported | Via Listings Items API price attribute |
| stockSync | supported | Via Listings Items API quantity attribute |
| orders | supported | Orders API v0 |
| messages | partial | Buyer-Seller Messaging — role-dependent, limited message types |
| questions | blocked | No seller Q&A concept on Amazon (buyers leave reviews/seller feedback) |
| freightQuotes | blocked | Amazon handles shipping; MFN labels via Merchant Fulfillment API |
| webhooks | supported | Notifications API — event subscriptions |
| sandbox | supported | sandbox.sellingpartnerapi-na.amazon.com |

---

## 1. Authentication (LWA + AWS SigV4)

Amazon SP-API requires **two** auth layers:

1. **LWA (Login with Amazon)** — OAuth2 access token (proves you're an authorized seller)
2. **AWS Signature V4** — Signs every HTTP request (proves the request wasn't tampered)

### Step 1: LWA — Get access token

```http
POST https://api.amazon.com/auth/o2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&client_id={LWA_CLIENT_ID}
&client_secret={LWA_CLIENT_SECRET}
&redirect_uri={REDIRECT_URI}

Response:
{
  "access_token": "Atza|...",
  "refresh_token": "Atzr|...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

Refresh:
```http
POST https://api.amazon.com/auth/o2/token
grant_type=refresh_token
&refresh_token={refresh_token}
&client_id={LWA_CLIENT_ID}
&client_secret={LWA_CLIENT_SECRET}
```

### Step 2: AWS SigV4 signing

Every SP-API request needs AWS Signature V4 headers using IAM credentials tied to the SP-API role.

```typescript
// Required headers on every request:
// x-amz-access-token: {lwa_access_token}
// x-amz-date: {ISO8601 datetime}
// Authorization: AWS4-HMAC-SHA256 Credential=.../aws4_request, SignedHeaders=..., Signature=...

// Use AWS SDK v3 SignatureV4 or @aws-sdk/signature-v4
import { SignatureV4 } from '@aws-sdk/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'

const signer = new SignatureV4({
  service: 'execute-api',
  region: 'us-east-1',       // SP-API is always us-east-1 for Brazil
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,  // if using STS role assumption
  },
  sha256: Sha256,
})

const signedRequest = await signer.sign(request)
```

### Storage

- `access_token` + `refresh_token` encrypted via `encryptSecretPayload()` in `marketplace_connections.secret_payload`
- `seller_id` stored in `marketplace_connections.external_account_id`
- AWS credentials stored as separate env vars (not per-connection — shared IAM role)

### Environment variables

```env
AMAZON_LWA_CLIENT_ID=
AMAZON_LWA_CLIENT_SECRET=
AMAZON_REDIRECT_URI=https://yourdomain.com/api/marketplace-connections/amazon/callback
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# AWS_SESSION_TOKEN= (only for temporary credentials via STS)
AMAZON_SELLER_ID=
AMAZON_MARKETPLACE_ID=A2Q3Y263D00KWC   # Brazil marketplace ID
```

---

## 2. Product Listings

Amazon uses the **Listings Items API (v2021-08-01)** to create and manage products.

### Create or update a listing

```http
PUT /listings/2021-08-01/items/{sellerId}/{sku}
  ?marketplaceIds=A2Q3Y263D00KWC
x-amz-access-token: {access_token}

{
  "productType": "PRODUCT",            // or category-specific: "HOME_BED_BATH", "TOOLS", etc.
  "requirements": "LISTING",
  "attributes": {
    "item_name": [{ "value": "Nome do produto", "language_tag": "pt_BR", "marketplace_id": "A2Q3Y263D00KWC" }],
    "brand": [{ "value": "Nome da Marca", "language_tag": "pt_BR" }],
    "bullet_point": [
      { "value": "Ponto de destaque 1", "language_tag": "pt_BR" },
      { "value": "Ponto de destaque 2", "language_tag": "pt_BR" }
    ],
    "item_description": [{ "value": "Descrição longa...", "language_tag": "pt_BR" }],
    "list_price": [{ "value": { "currency": "BRL", "amount": 299.90 }, "marketplace_id": "A2Q3Y263D00KWC" }],
    "purchasable_offer": [{
      "audience": "ALL",
      "currency": "BRL",
      "our_price": [{ "schedule": [{ "value_with_tax": 289.90 }] }],
      "marketplace_id": "A2Q3Y263D00KWC"
    }],
    "fulfillment_availability": [{
      "fulfillment_channel_code": "DEFAULT",   // MFN (merchant fulfilled)
      "quantity": 10,
      "marketplace_id": "A2Q3Y263D00KWC"
    }],
    "externally_assigned_product_identifier": [{
      "type": "ean",
      "value": "7891234567890"
    }],
    "condition_type": [{ "value": "new_new" }]
  }
}

Response 200 (success) or 400 (validation errors with issues array)
```

### Get listing

```http
GET /listings/2021-08-01/items/{sellerId}/{sku}
  ?marketplaceIds=A2Q3Y263D00KWC
  &includedData=attributes,issues,offers,fulfillmentAvailability
```

### Delete listing

```http
DELETE /listings/2021-08-01/items/{sellerId}/{sku}
  ?marketplaceIds=A2Q3Y263D00KWC
```

### Get product type definition (required attributes)

```http
GET /definitions/2020-09-01/productTypes/{productType}
  ?marketplaceIds=A2Q3Y263D00KWC
  &locale=pt_BR
// Returns JSON Schema for required + optional attributes
```

---

## 3. Catalog Search

```http
GET /catalog/2022-04-01/items
  ?marketplaceIds=A2Q3Y263D00KWC
  &identifiers=7891234567890
  &identifiersType=EAN
  &includedData=attributes,identifiers,images,productTypes,summaries

Response: { "items": [ { "asin": "B09...", "attributes": {...}, ... } ] }
```

Use to find existing ASIN before creating a new listing (Amazon prefers listing under existing ASIN when EAN matches).

---

## 4. Inventory Update

Stock is updated via the `fulfillment_availability` attribute in the Listings Items API:

```http
PATCH /listings/2021-08-01/items/{sellerId}/{sku}
  ?marketplaceIds=A2Q3Y263D00KWC

{
  "productType": "PRODUCT",
  "patches": [{
    "op": "replace",
    "path": "/attributes/fulfillment_availability",
    "value": [{
      "fulfillment_channel_code": "DEFAULT",
      "quantity": 25,
      "marketplace_id": "A2Q3Y263D00KWC"
    }]
  }]
}
```

---

## 5. Price Update

Price is updated via the `purchasable_offer` attribute:

```http
PATCH /listings/2021-08-01/items/{sellerId}/{sku}
  ?marketplaceIds=A2Q3Y263D00KWC

{
  "productType": "PRODUCT",
  "patches": [{
    "op": "replace",
    "path": "/attributes/purchasable_offer",
    "value": [{
      "audience": "ALL",
      "currency": "BRL",
      "our_price": [{ "schedule": [{ "value_with_tax": 319.90 }] }],
      "marketplace_id": "A2Q3Y263D00KWC"
    }]
  }]
}
```

---

## 6. Orders

### Fetch orders

```http
GET /orders/v0/orders
  ?MarketplaceIds=A2Q3Y263D00KWC
  &OrderStatuses=Unshipped,PartiallyShipped,Shipped
  &CreatedAfter=2026-01-01T00:00:00Z
  &MaxResultsPerPage=100

Response: { "Orders": [...], "NextToken": "..." }
```

Key order fields:

| Field | Description |
|---|---|
| `AmazonOrderId` | Amazon order identifier |
| `OrderStatus` | `Pending` \| `Unshipped` \| `PartiallyShipped` \| `Shipped` \| `Canceled` |
| `PurchaseDate` | ISO8601 |
| `OrderTotal.Amount` + `.CurrencyCode` | Order value |
| `FulfillmentChannel` | `MFN` (merchant) or `AFN` (FBA) |
| `BuyerInfo.BuyerEmail` | Masked unless buyer opted in |

### Get order items

```http
GET /orders/v0/orders/{AmazonOrderId}/orderItems
```

### Confirm shipment (mark as shipped)

```http
POST /orders/v0/orders/{AmazonOrderId}/shipment
{
  "marketplaceId": "A2Q3Y263D00KWC",
  "fulfillmentDate": "2026-01-16T10:00:00Z",
  "fulfillmentInstruction": {
    "fulfillmentSupplySourceId": "DEFAULT"
  },
  "shipmentItems": [{
    "amazonOrderItemCode": "12345678901234",
    "quantity": 1,
    "carrierName": "Correios",
    "shippingMethod": "PAC",
    "shipmentTrackingId": "BR123456789BR"
  }]
}
```

---

## 7. Buyer-Seller Messaging (partial)

> **Limitation:** Only specific message types are allowed. Generic messages require Amazon approval.
> Available without special approval: `legalDisclosure`, `negativeFeedbackRemoval`, `unexpectedProblem`, `confirmOrderDetails`, `confirmDeliveryDetails`.

### List available message actions for an order

```http
GET /messaging/v1/orders/{amazonOrderId}/messages
  ?marketplaceIds=A2Q3Y263D00KWC
```

### Send a message

```http
POST /messaging/v1/orders/{amazonOrderId}/messages/confirmDeliveryDetails
  ?marketplaceIds=A2Q3Y263D00KWC

{
  "text": "Olá! Seu pedido #{amazonOrderId} foi entregue. Por favor confirme o recebimento."
}
```

> Note: `questions` capability is `blocked` — Amazon does not have a seller-facing Q&A system. Customer questions appear in product reviews, not a separate Q&A API.

---

## 8. Notifications (Webhooks)

Amazon uses an SQS/SNS subscription model, not a direct HTTP webhook.

### Create destination (your SQS queue or HTTP endpoint)

```http
POST /notifications/v1/destinations
{
  "name": "marketplace-central-notifications",
  "resourceSpecification": {
    "sqs": {
      "arn": "arn:aws:sqs:us-east-1:123456789012:marketplace-central"
    }
  }
}
```

### Subscribe to notification types

```http
POST /notifications/v1/subscriptions/{notificationType}
{
  "payloadVersion": "1.0",
  "destinationId": "{destinationId}"
}
```

### Key notification types

| Type | Description |
|---|---|
| `ORDER_STATUS_CHANGE` | Order placed, shipped, cancelled |
| `LISTINGS_ITEM_STATUS_CHANGE` | Listing approved, suppressed, inactive |
| `LISTINGS_ITEM_ISSUES_CHANGE` | New compliance/quality issues on listing |
| `PRICING_HEALTH` | Price health alerts (featured offer eligibility) |
| `ITEM_PRODUCT_TYPE_CHANGE` | Product type reclassification |
| `FULFILLMENT_ORDER_STATUS` | FBA fulfillment status (if using FBA) |

### Poll from SQS

Since we use HTTP (not SQS), set up an API route as the SQS endpoint or use EventBridge to forward to HTTP:

```
/api/webhooks/amazon  ← receives SQS-forwarded events
```

---

## 9. Integration Architecture

### Connection flow

```
/api/marketplace-connections/amazon/auth
  → redirects to Amazon OAuth (LWA)

/api/marketplace-connections/amazon/callback?code=...&selling_partner_id=...
  → exchange code → encrypt tokens → store in marketplace_connections
  → seller_id stored in external_account_id

Token refresh (every ~50min):
  → decrypt → POST /auth/o2/token (refresh) → re-encrypt → update
```

### Publish flow

```
POST /api/marketplace-publish
  body: { channelId: 'amazon', items: ProductItem[] }

Per item:
  1. Search catalog by EAN → find existing ASIN or create new listing
  2. If ASIN found: PUT /listings/2021-08-01/items/{sellerId}/{sku} under ASIN
  3. If no ASIN: PUT with full product data (creates new ASIN)
  4. Check response.issues[] for validation errors
  5. Store { sku, asin, listingId } in publish_results
```

### Stock + price sync flow

```
PATCH /listings/2021-08-01/items/{sellerId}/{sku} — single PATCH per item
Use: fulfillment_availability patch for stock
Use: purchasable_offer patch for price
Can combine both patches in same request
```

### Known limitations / gotchas

- **Two auth layers:** LWA token + AWS SigV4 must both be valid for every request. Handle independently.
- **Product type required:** Every listing needs a `productType`. Use `/definitions` to get required fields per type.
- **EAN matching:** Amazon will match to existing ASIN by EAN — you may end up listing under an existing product. Test with EAN lookup first.
- **Listing issues:** The API returns an `issues` array even on 200. Parse and surface issues to the user (suppressed listings, compliance warnings, etc.).
- **Messages are restricted:** Do not attempt to send non-operational messages without Amazon's explicit approval for that message type.
- **Brazil marketplace ID:** Always use `A2Q3Y263D00KWC` for Brazil — do not use North America marketplace IDs.
- **Rate limits:** Vary per endpoint. Most are 0.5–2 req/sec. Always respect `x-amzn-RateLimit-Limit` header.
- **Sandbox:** sandbox.sellingpartnerapi-na.amazon.com accepts static test data — use it for integration testing.
