# Critical Flows Audit — Cart, Checkout, Payment Verification

Branch: `feat/v2-api-unification` (backend)
Repos: `bazaar-backend`, `bazaar-web@main`, `Bazaar-Admin-Dashboard@main`, `Bazaar-Mobile-App@main` (b5e76a3)
Scope: v1 routes only (v2 inert per branch policy).
Confidence: HIGH for web/backend; MEDIUM for mobile (Dart, regex parsing of JSON readers).

Legend: OK / DRIFT-CLIENT / DRIFT-BACKEND / GONE / NEW.

---

## Flow 1 — Cart

### Backend routes
- Web: `src/routes/ecommerce/cartRoutes.js:6-10` mounted under `/api/cart`.
- Mobile: `src/routes/mobile/cartRoutes.js:6-10` mounted under `/api/cart` (separate controller).
- Both delegate to `cartService` (facade) → `src/services/cart/use-cases/{getCart,modifyCart}.js`.

Backend response shapes:
- `getCart` (web, no gift logic): `{ success, cartCount, cart }` (`controllers/ecommerce/cartController.js:7`).
- `getCart` (mobile, gift logic): `{ success, cartCount, cart, cartSubtotal, giftEligible, giftAdded, giftProductInStock, promoMessage }` (`controllers/mobile/cartController.js:8`, `services/cart/use-cases/getCart.js:139-147`).
- `addToCart` / `increase` / `decrease` / `remove`: `{ success, message, cartCount, cart }` (`services/cart/use-cases/modifyCart.js:83,106,126,154,178`).
- `decrease` web variant explicitly emits `{ success, message, cart }` only — no `cartCount` (`controllers/ecommerce/cartController.js:56`).
- Cart-line schema (`models/Cart.js:3-22`): `product (ObjectId), quantity, product_type_id, image, name, originalPrice, productId, totalAvailableQty, variantId, variantName, variantPrice`. **No `price` field** — `price` is only synthesized inside the gift-logic branch.

### Web client — `bazaar-web/src/components/CartContext.jsx`
| URL | Method | Site | Reads |
|---|---|---|---|
| `/cart/get-cart` | GET | `:41` | `data.cart` |
| `/cart/add-to-cart` | POST | `:59` | `data.cart`, `data.message` (errors) |
| `/cart/remove-to-cart` | POST | `:91` | `data.cart`, `data.message` |
| `/cart/increase` | POST | `:124` | `data.cart`, `data.message` |
| `/cart/decrease` | POST | `:158` | `data.cart`, `data.message` |
| Cart line UI (`Cart/Cart.jsx:195-259`) | — | — | `variantId`, `productId`, `image`, `name`, `variantName`, `variantPrice`, `quantity`, `totalAvailableQty` |

Verdict: **OK**. Apply-coupon / remove-coupon / clear-cart are not separate cart endpoints in backend or web — coupon is applied at checkout via `/check-coupon`; "clear cart" is implicit (post-payment cart deletion). No drift.

### Mobile client — `Bazaar-Mobile-App/lib/controllers/cart_controller.dart`
| URL | Method | Site | Reads |
|---|---|---|---|
| `/api/cart/get-cart` | GET | `:45` | parsed via `CartResponseModel.fromJson` |
| `/api/cart/add-to-cart` | POST | (controller helper, calls `addToCart`) | success status only |
| `/api/cart/increase` | POST | `:207` | status, message |
| `/api/cart/decrease` | POST | `:236` | status, message |
| `/api/cart/remove-to-cart` | POST | (helper) | status, message |

`CartResponseModel` (`lib/data/models/cart_response.dart:11-44`): reads `cartCount`, `cart`, `cartSubtotal`, `giftAdded`, `promoMessage`. Per-item (`:91-115`): `_id` or `productId`, `quantity`, `originalPrice`, `variantPrice`, `variantName`, `variantId`, `category_id`, `category_name`, `isGiftWithPurchase`, `price`, `name`, `image`, plus `fullProduct` or `product`.

Verdict: **OK with one caveat**.
- `category_id`/`category_name` and `price`/`isGiftWithPurchase` are emitted only by the gift-logic branch of `getCart` (`use-cases/getCart.js:48-55, 87-93`), and mobile **does** call with `includeGiftLogic: true`. Match.
- However, `addToCart`/`increase`/`decrease`/`remove` flow through `modifyCart`, which returns raw `cart.items` from the Mongoose schema — those items do **not** have `category_id`/`category_name`/`price`/`isGiftWithPurchase`. Mobile's `CartItem.fromJson` is null-tolerant on these fields, but the cart UI may briefly show "uncategorized / no isGiftWithPurchase" between a mutation and the next full `get-cart` refresh. Low risk; flagged as **BUG-042** (informational).

---

## Flow 2 — Checkout / Payment Session Creation

### Web client — `bazaar-web/src/components/Checkout/Checkout.jsx`

| URL | Method | Site | Backend route | Backend resp | Verdict |
|---|---|---|---|---|---|
| `/user/address` (GET) | `:251` | `routes/ecommerce/orderRoutes.js:10` → `controllers/ecommerce/orderController.js:74-94` → `{ success, flag, address[] }` | OK |
| `/user/address` (POST) | `:334` | `orderRoutes.js:11` → `{ success, message, addresses }` | reads `data.success`/`data.message` | OK |
| `/user/address/:id` (DELETE) | `Address.jsx:202` | `orderRoutes.js:12` → `{ success, message, addresses }` | OK |
| `/user/address/:id/set-primary` (PATCH) | `Address.jsx:259` | `orderRoutes.js:13` → `{ success, message, addresses }` | OK |
| `/shipping-cost?country&city&area&subtotal` (GET) | `:450` | `publicRoutes.js:92` → `controllers/ecommerce/shippingCountryController.js:186-200` → `{ success, shippingCost, freeShippingThreshold, ... }` | reads `data.success`, `data.shippingCost`, `data.freeShippingThreshold` | OK |
| `/check-coupon` (POST) | `:511` | `publicController.js:201-210` → `{ message, type, discountPercent, capAED?, bankPromoId? }` (no `success` field) | reads `data.message`, `data.type`, `data.discountPercent`, `data.capAED`, `data.bankPromoId` keyed off HTTP status | OK |
| `redeem-coupon` (POST, no leading slash) | `:552` | `publicRoutes.js:109` → couponService.redeemCoupon | reads `response.data?.message` | OK (axios resolves) |
| `/user/validate-inventory` (POST) | `:907` | `routes/ecommerce/orderRoutes.js:14` → `{ success, isValid, message, results[] }`; results items have `productName`, `isValid`, `message`, `dbIndex` | reads all of those | OK |
| `/create-card-checkout` (POST) | `:648` | `publicController.js:723-736` → `services/checkout/use-cases/createStripeCheckout.js:115` → `{ id }` | reads `data.id` | OK |
| `/create-tabby-checkout` (POST) | `:785` | `publicController.js:738-773` → `createTabbyCheckout.js:141` → `{ checkout_url, status }`; on rejection 400 with `{ message, status: 'rejected' }` | reads `data.status`, `data.checkout_url`, `data.message` | OK |
| `/create-nomod-checkout` (POST) | `:861` | `createNomodCheckout.js:104` → `{ status: 'created', checkout_url, checkout_id }` | reads `data.status === "created"`, `data.checkout_url` | OK |

Money math:
- Web sends `price: Math.round(item.variantPrice)` (`:616, :686, :747`). Backend Stripe pricing reads `Number(item.price)` and converts to cents (`createStripeCheckout.js:49,73,85`). `Math.round` on the client truncates to whole AED before sending — backend then re-rounds via `Math.round(item.price * 100)`. **No double rounding bug** (rounds-then-multiplies preserves the integer), but the client-side `Math.round` discards fractional fils. AED units are typically integers in this storefront so this is intentional, but flagged as **BUG-043** (informational money-precision drift between mobile, which sends raw `double.tryParse(variantPrice)`, and web, which rounds).
- `discountAmount` is sent as `Number(Number(discountAmount).toFixed(2))` — backend processes as number. OK.

### Mobile client — `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart`

| URL | Method | Site | Backend route | Verdict |
|---|---|---|---|---|
| `/api/order/address` (GET) | `:911` | `routes/mobile/orderRoutes.js:19` → mobile `orderController.address` (analogous shape) | OK |
| `/api/order/address` (POST) | `:887` | `orderRoutes.js:20` | OK |
| `/api/order/address/:id` (DELETE) | `:1038` | `orderRoutes.js:22` | OK |
| `/api/order/address/:id/set-primary` (PATCH) | `:1063` | `orderRoutes.js:23` | OK |
| `/api/shipping-cost` (GET) | `:243` | `publicRoutes.js:92` | reads `shippingCost`, `freeShipping` (sic), `freeShippingThreshold`, `currency`. Backend emits `shippingCost`, `freeShippingThreshold` but not a top-level `freeShipping` boolean (`use-cases/calculateShippingCost.js:14-22, 46-52`). Mobile `data['freeShipping'] == true` is always false → mobile relies on its own threshold check via `freeShippingThreshold`. **DRIFT-CLIENT** flagged as **BUG-044**, low impact (fallback works). |
| `/api/order/checkout-session` (POST, Stripe + COD finalization) | `:528` | `routes/mobile/orderRoutes.js:14` → mobile `orderController.checkoutSession:7-49` → `{ message, orderId }` | mobile only checks `statusCode == 200/201`, ignores body. OK |
| `/api/order/checkout-session-tabby` (POST) | `:663` | `orderRoutes.js:15` → `{ message, paymentId, status }` | mobile checks status code only. OK |
| `/api/check-coupon` (POST) | `:1091` | `publicRoutes.js:108` (mobile mounts the same handler at `/api/check-coupon` via `couponsRoutes.js:9`) → `{ message, type, discountPercent, ... }` (no `success` key) | mobile reads `data['success'] == true` — **always false**. **DRIFT-CLIENT, BUG-041, MEDIUM**: applying any valid coupon shows the error toast and fails to set `isDiscountApplied`. |
| `/api/order/checkout-session-nomod` (POST) | not called from this controller | — | not exercised by mobile main |
| `/api/order/verify-tabby-status` (GET) | not called from this controller | server route exists (`orderRoutes.js:16`) but mobile uses its own Tabby SDK + `createCheckoutSession` to persist | **NEW** (server endpoint never hit by mobile). Low impact. |
| `/api/order/verify-nomod-payment` (GET) | not called | same as above | **NEW** |

Stripe init for mobile: mobile bypasses the backend and creates the Stripe PaymentIntent directly via Stripe REST API (`checkout_controller.dart:766-810`) — `/api/order/stripe/init` exists (`orderRoutes.js:11`) but is **NEW** (unused by current mobile main). Flagged as **BUG-045** (architectural — mobile holds the Stripe secret key in `.env`).

Address shape parity (mobile `AddressRequest.fromJson`): `name`, `email`, `mobile`, `address`, `floorNo`, `apartmentNo`, `buildingName`, `landmark`, `area`, `city`, `state`, `country`, `isPrimary`, `_id`. Matches web shape.

---

## Flow 3 — Payment Verification + Webhook

### Web

| URL | Method | Site | Backend resp | Verdict |
|---|---|---|---|---|
| `/verify-card-payment` | POST | `SuccessPage.jsx:58` | `verifyStripePayment.js:279` → `{ message, orderId }` | OK |
| `/verify-tabby-payment` | POST | `SuccessPage.jsx:72` | `verifyTabbyPayment.js:97` → `{ message, orderId }` | OK |
| `/verify-nomod-payment` | POST | `SuccessPage.jsx:86` | `verifyNomodPayment.js:53,140` → `{ message }` or `{ message, orderId }` | OK |

Web only consumes `error.response?.data?.message` — does not depend on `orderId`. OK.

### Mobile
- Mobile does **not** call any of the verify endpoints. Tabby is verified client-side by polling `https://api.tabby.ai/api/v2/payments/:id` (`checkout_controller.dart:1380-1391`) — secret key embedded in mobile env. Then `createCheckoutSession` is called to persist the order. NEW (verify endpoints unused by mobile).

### Tabby Webhook

Mounted at `app.post('/tabby/webhook', bodyParser.raw, ecommerceTabbyWebhook)` (`server.js:144`). **No auth middleware**.

**Critical: BUG-003 confirmed and OPEN.** `controllers/ecommerce/publicController.js:858`:
```
exports.tabbyWebhook = async (req, res) => {
  try {
    const user_id = req.user._id;   // ← TypeError: cannot read _id of undefined
```
The webhook is unauthenticated, so `req.user` is `undefined` and the handler throws synchronously **before** any signature/IP check. Tabby sees a 500 → retry storms; orders may never be reconciled.

The mobile `tabbyWebhook` export (`controllers/mobile/orderController.js:335-369`) is correctly written (no `req.user` access), but **is not mounted anywhere** — dead code.

Order creation post-payment, confirmation email, inventory decrement: all live inside `verifyStripePayment`, `verifyTabbyPayment`, `verifyNomodPayment`, and `handleTabbyWebhook` use-cases. Web flow is end-to-end via SuccessPage → verify endpoints. Mobile flow is via `/api/order/checkout-session*` finalizers. The webhook is a redundant safety net for Tabby — currently broken.

---

## Drift / Risk Summary

### Critical / High
1. **BUG-003** (already filed, OPEN) — Tabby webhook crashes on every call due to unguarded `req.user._id`. With v2 not in scope, the v1 handler is the one taking real Tabby traffic. **Pre-production blocker.**
2. **BUG-041** — Mobile coupon application gates on `data['success']` which the backend never returns. Every valid coupon entered in the mobile app is rejected with "Something went wrong". **MEDIUM, customer-visible.**

### Medium
3. **BUG-044** — Mobile reads `data['freeShipping']` from `/api/shipping-cost` but backend never emits that key. Mobile falls back to its own threshold compare, which works only because backend also returns `freeShippingThreshold`. Cosmetic / latent.
4. **BUG-045** — Mobile creates Stripe PaymentIntents directly against Stripe REST API using a shipped secret key, bypassing the backend's `/api/order/stripe/init`. This is a Stripe security best-practice violation regardless of the audit scope. (Pre-existing.)

### Low / Informational
5. **BUG-042** — `addToCart`/`increase`/`decrease`/`remove` return raw cart items without the gift-logic enrichment fields (`category_id`, `category_name`, `price`, `isGiftWithPurchase`). Mobile UI tolerates nulls but may flicker until next full `get-cart`.
6. **BUG-043** — Web checkout sends per-item `price: Math.round(item.variantPrice)`. Mobile sends raw `double.tryParse(variantPrice)`. Money rounding differs across platforms; for AED-only UAE catalogue this is currently a non-issue but is a latent precision-drift footgun.

---

## Verdict for shipping the branch

Of the three flows audited:
- **Cart** flows: OK on all clients.
- **Checkout** flows: OK for web. Mobile has BUG-041 (coupon broken) and BUG-044 (cosmetic).
- **Payment verification**: OK for web. Mobile bypasses backend verify (BUG-045 latent). **Tabby webhook is broken (BUG-003) regardless of client.**

**Recommendation: do not ship until BUG-003 is fixed.** The Tabby webhook is the safety net for cases where Tabby's redirect to `/success` never reaches the user (mobile network drop, browser close); a broken webhook means real orders may be paid but never recorded. BUG-041 should ship a fix in the same release because it makes coupons unusable on mobile.

Audited 21 v1 endpoints across 3 flows, 3 clients. Counts: 14 OK, 4 DRIFT-CLIENT (BUG-003/041/043/044), 3 NEW (mobile-unused server routes), 0 GONE.
