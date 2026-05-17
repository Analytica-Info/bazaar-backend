# V2 URL Contract

Canonical v2 URL contract for the Bazaar platform BFF API.
All paths are relative to the `/v2` prefix.

This document covers Wave 1 (auth + user/me routes) and the Coupon
v2 engine. Future waves will append order, cart, and product routes.

---

## Wave 1 — Auth + Me routes

| Method | Path | Auth | Platform | Purpose |
|--------|------|------|----------|---------|
| POST | `/auth/register` | none | both | Register new account |
| POST | `/auth/login` | none | both | Email + password login |
| POST | `/auth/login/google` | none | both | Google OAuth login |
| POST | `/auth/login/apple` | none | both | Apple Sign-In login |
| POST | `/auth/logout` | cookie | web | Clear session cookie |
| GET | `/auth/session` | none | both | Check session validity (web: cookie; mobile: Bearer header) |
| POST | `/auth/password/forgot` | none | both | Send password-reset code |
| POST | `/auth/password/verify-code` | none | both | Verify password-reset code |
| POST | `/auth/password/reset` | none | both | Reset password with code |
| POST | `/auth/recovery/verify` | none | both | Verify account recovery code + set new password |
| POST | `/auth/recovery/resend` | none | both | Resend account recovery code |
| POST | `/auth/refresh` | none | mobile | Exchange refresh token for new token pair |
| GET | `/me` | required | both | Get authenticated user data bundle |
| PATCH | `/me` | required | both | Update profile (name, email, phone, avatar) |
| DELETE | `/me` | required | both | Delete account |
| PATCH | `/me/password` | required | both | Change password |
| GET | `/me/dashboard` | required | both | User dashboard stats |
| GET | `/me/dashboard/current-month-categories` | required | web | Category breakdown for current month |
| GET | `/me/reviews` | required | both | List user's written reviews |
| GET | `/me/payments` | required | both | List payment history |
| GET | `/me/payments/:id` | required | both | Get single payment record |
| GET | `/me/payments/tabby/history` | required | mobile | Tabby BNPL purchase history |
| GET | `/orders` | required | both | List user's orders |
| GET | `/orders/:id` | required | web | Get single user order |

---

## Migration Notes — Wave 1 (mobile-team brief)

All old paths have been removed and replaced. No backward-compat shims exist on v2.
v1 routes (`/api/*`) are untouched and continue to serve the production mobile build.

| Old path (v2) | New path (v2) | Notes |
|---------------|---------------|-------|
| `GET /auth/user-data` | `GET /me` | Read self |
| `GET /user/profile` | `GET /me` | Folded into GET /me (web had both; getUserData is more complete) |
| `POST /auth/update-profile` | `PATCH /me` | Verb POST → PATCH |
| `DELETE /auth/account` | `DELETE /me` | |
| `PUT /auth/update-password` | `PATCH /me/password` | Verb PUT → PATCH; path is password sub-resource |
| `GET /auth/check` (web) | `GET /auth/session` | Unified across platforms |
| `POST /auth/check-access-token` (mobile) | `GET /auth/session` | Unified; mobile flips POST → GET, reads Authorization header |
| `POST /auth/recovery-account` | `POST /auth/recovery/verify` | Path matches handler intent |
| `POST /auth/resend-recovery-code` | `POST /auth/recovery/resend` | Symmetric with verify |
| `POST /auth/refresh-token` (mobile) | `POST /auth/refresh` | Shorter |
| `POST /auth/google-login` | `POST /auth/login/google` | Nested under /auth/login |
| `POST /auth/apple-login` | `POST /auth/login/apple` | Nested under /auth/login |
| `POST /auth/forgot-password` | `POST /auth/password/forgot` | Nested under /auth/password |
| `POST /auth/verify-code` | `POST /auth/password/verify-code` | Nested |
| `POST /auth/reset-password` | `POST /auth/password/reset` | Nested |
| `GET /user/dashboard` | `GET /me/dashboard` | |
| `GET /user/reviews` | `GET /me/reviews` | |
| `POST /user/reviews` | `POST /products/:id/reviews` | Duplicate of shared `submitProductReview`; deleted in favour of canonical product-nested path. Mobile/web: move `product_id` from body to URL, rename multipart field `'file'` → `'image'`, send at least one rating field. |
| `GET /user/current-month-categories` | `GET /me/dashboard/current-month-categories` | Nested under dashboard |
| `GET /user/payment-history` | `GET /me/payments` | Resource-style |
| `GET /user/payment-history/:id` | `GET /me/payments/:id` | |
| `GET /user/tabby-buyer-history` (mobile) | `GET /me/payments/tabby/history` | Provider-specific subpath |
| `GET /user/orders` (web) | `GET /orders` | Orders are auth-scoped; no /user prefix |
| `GET /user/orders/:id` (web) | `GET /orders/:id` | |
| `GET /user/orders` (mobile duplicate) | deleted | Mobile canonical was already `GET /orders` |

---

## Wave 2 — Orders + Addresses + Cart

### Final state table

| Method | Path | Auth | Platform | Purpose |
|--------|------|------|----------|---------|
| GET | `/me/addresses` | required | both | List user's saved delivery addresses |
| POST | `/me/addresses` | required | both | Create a new delivery address |
| DELETE | `/me/addresses/:id` | required | both | Delete a saved address |
| PATCH | `/me/addresses/:id` | required | both | Set/clear primary address (`{ primary: true/false }`) |
| POST | `/orders/inventory-checks` | required | both | Check stock availability before checkout |
| POST | `/orders/checkouts/nomod` | required | both | Create a Nomod checkout session |
| POST | `/orders/checkouts/nomod/verify` | required | both | Verify Nomod payment and create order |
| POST | `/orders/checkouts/stripe` | required | mobile | Create a Stripe checkout session |
| POST | `/orders/checkouts/tabby` | required | mobile | Create a Tabby BNPL checkout session |
| POST | `/orders/checkouts/tabby/verify` | required | mobile | Verify Tabby payment (paymentId from body) |
| POST | `/orders/checkouts/stripe/init` | required | mobile | Initialise a Stripe PaymentIntent |
| GET | `/payment-methods` | required | mobile | List available payment methods (top-level resource) |
| POST | `/orders/:id/proof-of-delivery` | required | mobile | Upload proof-of-delivery image (multipart) |
| PATCH | `/orders/:id` | required | mobile | Status-only order update (no file) |

---

### Migration brief — Wave 2 (mobile team)

| Old path (v2) | New path (v2) | Notes |
|---------------|---------------|-------|
| `GET /orders/address` | `GET /me/addresses` | Relocated to user sub-resource |
| `POST /orders/address` | `POST /me/addresses` | Relocated to user sub-resource |
| `DELETE /orders/address/:addressId` | `DELETE /me/addresses/:id` | URL param renamed `:addressId` → `:id` |
| `PATCH /orders/address/:addressId/set-primary` | `PATCH /me/addresses/:id` | Action suffix dropped; body `{ primary: true }` required |
| `POST /orders/validate-inventory` | `POST /orders/inventory-checks` | Action → resource-style |
| `POST /orders/checkout/stripe` | `POST /orders/checkouts/stripe` | Plural "checkouts" |
| `POST /orders/checkout/tabby` | `POST /orders/checkouts/tabby` | Plural "checkouts" |
| `GET /orders/verify/tabby` | `POST /orders/checkouts/tabby/verify` | **GET → POST**; paymentId now in request body |
| `POST /orders/checkout/nomod` | `POST /orders/checkouts/nomod` | Plural "checkouts"; now available on both platforms |
| `GET /orders/verify/nomod` (mobile) | `POST /orders/checkouts/nomod/verify` | **GET → POST**; paymentId now in request body |
| `POST /orders/verify/nomod` (web) | `POST /orders/checkouts/nomod/verify` | Unified with mobile; body unchanged (`{ paymentId }`) |
| `POST /orders/stripe/init` | `POST /orders/checkouts/stripe/init` | Nested under checkouts |
| `GET /orders/payment-methods` | `GET /payment-methods` | Promoted to top-level resource |
| `PATCH /orders/:orderId/status` (with file) | `POST /orders/:id/proof-of-delivery` | File-upload split out |
| `PATCH /orders/:orderId/status` (no file) | `PATCH /orders/:id` | Status-only route; param renamed `:orderId` → `:id` |
| `POST /cart` (add item) | `POST /cart/items` | Path moves to sub-resource |
| `DELETE /cart` (body `{ product_id }`) | `DELETE /cart/items/:productId` | Product ID moves from body to URL param |
| `POST /cart/increase` | `PATCH /cart/items/:productId` with `{ delta: +N }` | Merged with decrease; positive delta |
| `POST /cart/decrease` | `PATCH /cart/items/:productId` with `{ delta: -N }` | Merged with increase; negative delta |

### Request-shape change callouts (5 breaking changes for mobile)

1. **DELETE /cart/items/:productId** — was `DELETE /cart` with body `{ product_id }`. Now no body; productId is a URL segment.
2. **PATCH /cart/items/:productId** — replaces `POST /cart/increase` and `POST /cart/decrease`. Body: `{ delta: ±N }` where `abs(delta)` ≤ 100.
3. **PATCH /me/addresses/:id** — replaces `PATCH /orders/address/:addressId/set-primary`. Body now `{ primary: true }` (was an empty-body PATCH).
4. **POST /orders/checkouts/tabby/verify** — was `GET /orders/verify/tabby?paymentId=…`. Now POST with `{ paymentId: "…" }` in the request body.
5. **POST /orders/checkouts/nomod/verify** — was `GET /orders/verify/nomod?paymentId=…` (mobile). Now POST with `{ paymentId: "…" }` in the request body.

---

## Coupon v2 engine

Polymorphic coupon engine (predicate + reward registries, atomic
reservation lifecycle). See `COUPON_V2_IMPLEMENTATION.md` for the
engine architecture; this section is the public URL contract only.

| Method | Path | Auth | Platform | Purpose |
|--------|------|------|----------|---------|
| GET  | `/coupons` | optional | both | Coupon availability metadata (issuance count) |
| POST | `/coupons/validate` | optional | both | Pure validation — returns structured verdict + reward |
| POST | `/coupons/apply` | optional | both | Atomically reserve a coupon (idempotent via `idempotency_key`) |
| POST | `/coupons/release` | required | both | Release a reservation (idempotent) |
| POST | `/coupons/redeem` | required | both | Confirm redemption against a placed order |
| GET  | `/coupons/eligible` | optional | both | List coupons the cart currently qualifies for |

### Migration Notes — Coupons

The previous v2 paths under `/coupons/v2/{validate,apply,release,eligible}`
were a transitional namespace while the legacy `POST /coupons/validate`
shim (wrapping the v1 `checkCouponCode` service) was still in place.
The shim has been removed; the canonical v2 engine now owns the
unqualified namespace.

| Old path (v2 transitional) | New path (v2 canonical) | Notes |
|---|---|---|
| `POST /coupons/v2/validate` | `POST /coupons/validate` | Shim removed; v2 engine is the sole handler |
| `POST /coupons/v2/apply`    | `POST /coupons/apply`    | |
| `POST /coupons/v2/release`  | `POST /coupons/release`  | |
| `POST /coupons/v2/eligible` | `GET /coupons/eligible`  | Method also corrected to GET (read-only) |
| `POST /coupons/v2/redeem`   | `POST /coupons/redeem`   | Stays required-auth |

v1 routes (`/api/check-coupon`, etc.) are untouched and continue to
serve production mobile builds. UAE10 / bank-promo legacy codes remain
on v1.

### Wire-shape contract

All `reward` payloads in responses follow the flat shape:

```jsonc
{ "type": "flat" | "percent" | "free_shipping" | "tiered_percent" | "bxgy" | "free_gift",
  ...payload }
```

No nested `.meta`. No storage-layer schema field names
(`gift_product_id`, `gift_value_aed`, `gift_product_name`,
`percent_off`, `pct_off`, `subtotal_threshold`, etc.) — these belong
to the Mongoose schema on `CouponV2.reward` and are translated to the
public wire fields (`product_id`, `msrp_aed`, `percent`, `cap_aed`,
`min_aed`, etc.) by `src/services/coupon/wire/serializeReward.js`.
Regression-guard tests in
`tests/controllers/v2/shared/couponController.wireShape.test.js`
enforce this at the route boundary for every reward type.

---

## Wave 3 — Products + Categories + Coupons (count/auth) + Wishlist + Notifications + Notify-Me + Shipping

### Final state table — Wave 3 routes

| Method | Path | Auth | Platform | Purpose |
|--------|------|------|----------|---------|
| GET | `/categories` | none | both | List full category tree (or search when `?q=` present) |
| GET | `/categories/:id/products` | none | both | List products at depth 1/2/3 (`?depth=N`, default 1) |
| GET | `/products` | none | both | List products with optional filtering |
| POST | `/products/search` | none | both | Full-text product search (body-based filters) |
| GET | `/products/:id` | optional | both | Product detail |
| GET | `/products/:id/similar` | none | both | Similar products (id in URL) |
| GET | `/products/:id/reviews` | optional | both | List product reviews |
| POST | `/products/:id/reviews` | required | both | Submit product review |
| GET | `/products/:id/reviews/me` | required | both | Current user's review on a product |
| GET | `/coupons/issuance-count` | optional | both | Coupon issuance count metadata |
| POST | `/coupons/apply` | **required** | both | Atomically reserve a coupon (auth tightened from optional) |
| GET | `/wishlist` | required | both | Get user's wishlist |
| POST | `/wishlist/items` | required | both | Add product to wishlist |
| DELETE | `/wishlist/items/:productId` | required | both | Remove product from wishlist |
| GET | `/notifications` | required | both | List in-app notifications (paginated) |
| PATCH | `/notifications` | required | both | Mark notifications as read (`{ read: true, ids?: [...] }`) |
| POST | `/notifications/:id/clicks` | required | mobile | Record a tap on a specific notification |
| POST | `/notifications/subscriptions` | optional | both | Subscribe to coming-soon vertical launch |
| GET | `/shipping/countries` | none | both | List active shipping countries |
| GET | `/shipping/countries/:code/cities` | none | both | List cities for a country |
| GET | `/shipping/quote` | none | both | Calculate shipping quote |
| GET | `/home` | none | both | Home manifest |
| GET | `/rails/:railName` | optional | both | Paginated smart-category rail |
| GET | `/banners` | none | both | List banners |
| GET | `/verticals` | none | both | List verticals |

---

### Migration brief — Wave 3 (10 request-shape callouts for mobile team)

| # | Old path (v2) | New path (v2) | Breaking change |
|---|---------------|---------------|-----------------|
| 1 | `GET /products/categories` | `GET /categories` | Path move |
| 2 | `GET /products/categories/search?q=` | `GET /categories?q=` | Merged into same endpoint |
| 3 | `GET /products/category/:id` + sub-category + sub-sub-category | `GET /categories/:id/products?depth=N` | Three endpoints → one; depth defaults to 1 |
| 4 | `GET /products/similar?id=p1&product_type_id=pt1` | `GET /products/:id/similar?product_type_id=pt1` | Id moves from query to URL segment |
| 5 | `GET /products/:id/my-review` | `GET /products/:id/reviews/me` | Path rename |
| 6 | `GET /coupons` (returns count) | `GET /coupons/issuance-count` | Path rename |
| 7 | `POST /coupons/apply` — auth.optional | `POST /coupons/apply` — **auth.required** | Anonymous calls now return 401 |
| 8 | `POST /wishlist` body `{ productId }` | `POST /wishlist/items` body `{ productId }` | Path moves to sub-resource; body unchanged |
| 9 | `DELETE /wishlist` body `{ product_id }` | `DELETE /wishlist/items/:productId` | Product ID moves from body to URL param |
| 10 | `POST /notifications/mark-read` body `{ ids }` | `PATCH /notifications` body `{ read: true, ids?: [...] }` | Verb POST → PATCH; body adds `read` field |
| 11 | `POST /notifications/track-click` body `{ notificationId }` | `POST /notifications/:id/clicks` | Id moves from body to URL; mobile-only |
| 12 | `POST /notify-me` | `POST /notifications/subscriptions` | Path absorbed into /notifications namespace; body unchanged |
| 13 | `GET /shipping/cost` | `GET /shipping/quote` | Path rename; query params unchanged |

---

## Final canonical v2 surface (all waves combined)

Source-of-truth for mobile, web, and admin teams. All paths are relative to `/v2`.

### Auth

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| POST | `/auth/register` | none | both |
| POST | `/auth/login` | none | both |
| POST | `/auth/login/google` | none | both |
| POST | `/auth/login/apple` | none | both |
| POST | `/auth/logout` | cookie | web |
| GET | `/auth/session` | none | both |
| POST | `/auth/password/forgot` | none | both |
| POST | `/auth/password/verify-code` | none | both |
| POST | `/auth/password/reset` | none | both |
| POST | `/auth/recovery/verify` | none | both |
| POST | `/auth/recovery/resend` | none | both |
| POST | `/auth/refresh` | none | mobile |

### Me / User

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/me` | required | both |
| PATCH | `/me` | required | both |
| DELETE | `/me` | required | both |
| PATCH | `/me/password` | required | both |
| GET | `/me/dashboard` | required | both |
| GET | `/me/dashboard/current-month-categories` | required | web |
| GET | `/me/reviews` | required | both |
| GET | `/me/payments` | required | both |
| GET | `/me/payments/:id` | required | both |
| GET | `/me/payments/tabby/history` | required | mobile |
| GET | `/me/addresses` | required | both |
| POST | `/me/addresses` | required | both |
| DELETE | `/me/addresses/:id` | required | both |
| PATCH | `/me/addresses/:id` | required | both |

### Orders + Payments

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/orders` | required | both |
| GET | `/orders/:id` | required | web |
| POST | `/orders/inventory-checks` | required | both |
| POST | `/orders/checkouts/nomod` | required | both |
| POST | `/orders/checkouts/nomod/verify` | required | both |
| POST | `/orders/checkouts/stripe` | required | mobile |
| POST | `/orders/checkouts/stripe/init` | required | mobile |
| POST | `/orders/checkouts/tabby` | required | mobile |
| POST | `/orders/checkouts/tabby/verify` | required | mobile |
| POST | `/orders/:id/proof-of-delivery` | required | mobile |
| PATCH | `/orders/:id` | required | mobile |
| GET | `/payment-methods` | required | mobile |

### Cart

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/cart` | required | both |
| POST | `/cart/items` | required | both |
| DELETE | `/cart/items/:productId` | required | both |
| PATCH | `/cart/items/:productId` | required | both |

### Products + Categories

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/categories` | none | both |
| GET | `/categories/:id/products` | none | both |
| GET | `/products` | none | both |
| POST | `/products/search` | none | both |
| GET | `/products/:id` | optional | both |
| GET | `/products/:id/similar` | none | both |
| GET | `/products/:id/reviews` | optional | both |
| POST | `/products/:id/reviews` | required | both |
| GET | `/products/:id/reviews/me` | required | both |

### Wishlist

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/wishlist` | required | both |
| POST | `/wishlist/items` | required | both |
| DELETE | `/wishlist/items/:productId` | required | both |

### Coupons

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/coupons/issuance-count` | optional | both |
| POST | `/coupons/validate` | optional | both |
| POST | `/coupons/apply` | **required** | both |
| POST | `/coupons/release` | required | both |
| POST | `/coupons/redeem` | required | both |
| GET | `/coupons/eligible` | optional | both |

### Notifications + Subscriptions

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/notifications` | required | both |
| PATCH | `/notifications` | required | both |
| POST | `/notifications/:id/clicks` | required | mobile |
| POST | `/notifications/subscriptions` | optional | both |

### Shipping

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/shipping/countries` | none | both |
| GET | `/shipping/countries/:code/cities` | none | both |
| GET | `/shipping/quote` | none | both |

### Public / Home

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/home` | none | both |
| GET | `/rails/:railName` | optional | both |
| GET | `/banners` | none | both |
| GET | `/verticals` | none | both |

### Mobile Config

| Method | Path | Auth | Platform |
|--------|------|------|----------|
| GET | `/config` | none | mobile |
