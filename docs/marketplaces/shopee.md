# Shopee — API Integration Reference

**Channel ID:** `shopee`
**Auth strategy:** `unknown` (likely HMAC signature — pending confirmation)
**Rollout stage:** `blocked` / **Execution mode:** `blocked`
**Status: BLOCKED** — pending official Open Platform documentation and partner validation

---

## Current Status

> **All capabilities are blocked.** Do not attempt any API integration until the readiness checklist below is complete.

| Capability | Status | Reason |
|---|---|---|
| publish | blocked | Awaiting docs |
| priceSync | blocked | Awaiting docs |
| stockSync | blocked | Awaiting docs |
| orders | blocked | Awaiting docs |
| messages | blocked | Awaiting docs |
| questions | blocked | Awaiting docs |
| freightQuotes | blocked | Awaiting docs |
| webhooks | blocked | Awaiting docs |
| sandbox | blocked | Awaiting partner onboarding |

---

## What We Know (Preliminary)

### Platform

Shopee uses the **Shopee Open Platform** for third-party seller integrations in Brazil. Access requires:

1. Applying as a developer via the Shopee Open Platform portal
2. Receiving a `partner_id` + `partner_key` from Shopee
3. Completing seller authorization (seller OAuth flow)

### Likely Auth Mechanism

Based on the Shopee Open Platform pattern used in other markets:

```
// Every request must include a signed URL:
// Signature = HMAC-SHA256(partner_key, "{partner_id}{api_path}{timestamp}{access_token}{shop_id}")

GET /api/v2/item/get_item_list
  ?partner_id={SHOPEE_PARTNER_ID}
  &timestamp={unix_timestamp}
  &access_token={SELLER_ACCESS_TOKEN}
  &shop_id={SELLER_SHOP_ID}
  &sign={hmac_signature}
```

> **This is unconfirmed.** The Brazilian Shopee Open Platform may use a different version or additional parameters. Do not implement until we have official documentation.

### Likely API Capabilities (once unblocked)

Based on Shopee Open Platform v2 documentation from other markets:

| Operation | Likely endpoint | Notes |
|---|---|---|
| Create product | POST /api/v2/product/add_item | With title, description, images, price, stock |
| Update stock | POST /api/v2/product/update_stock | By item_id + model_id |
| Update price | POST /api/v2/product/update_price | By item_id + model_id |
| Get orders | GET /api/v2/order/get_order_list | Order status filter |
| Order detail | GET /api/v2/order/get_order_detail | Full order + items |
| Ship order | POST /api/v2/logistics/ship_order | Mark as shipped, add tracking |
| Messages | GET /api/v2/message/get_message | Buyer-seller chat |
| Reply message | POST /api/v2/message/send_message | Send to buyer |
| Webhooks | Register via Open Platform portal | Push events on order/product changes |

---

## Readiness Checklist

Complete all items before implementing Shopee integration:

- [ ] Apply for Shopee Open Platform Brazil developer account
- [ ] Receive `partner_id` + `partner_key` from Shopee
- [ ] Confirm API version (v2 vs custom Brazil build)
- [ ] Confirm auth mechanism (HMAC signature details, required params)
- [ ] Download and review official API documentation for Brazil
- [ ] Receive sandbox credentials
- [ ] Validate which capabilities are available to our seller tier
- [ ] Confirm webhook event types and registration mechanism
- [ ] Test auth signature in sandbox
- [ ] Complete Shopee seller account linkage flow

---

## When Unblocked: Implementation Steps

Once all readiness items are complete:

1. Update `marketplace-seed.ts`: change `executionMode` to `planned`, `authStrategy` to `hmac` (or confirmed value), update capabilities
2. Implement auth: `encryptSecretPayload({ partnerId, partnerKey, accessToken, shopId })`
3. Create HMAC signing utility in `lib/marketplace-shopee-auth.ts`
4. Implement product mapper: `mapToShopeeItem()` in `lib/product-mapper.ts`
5. Add Shopee cases to API route handlers
6. Update this document with confirmed endpoints and auth details

---

## Contact

To unblock: contact Shopee Brazil seller support or apply at https://open.shopee.com (check for a Brazil-specific portal).
