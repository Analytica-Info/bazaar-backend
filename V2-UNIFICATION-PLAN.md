# Bazaar Backend — v2 API Plan

**Date:** 2026-04-28  
**Status:** Planning — no code changes  
**Scope:** `/v2` versioned routes for web and mobile. Admin (`/admin/*`) and webhooks unchanged.

---

## Architectural Principle: BFF, Not Unified Controllers

The industry pattern used by Amazon, Shopify, Netflix, and Zalando is **Backend for Frontend (BFF)** — separate, thin HTTP adapter layers per client surface, all calling the same shared domain (service) layer. Merging controllers is the wrong direction.

```
Web BFF    (ecommerce controllers)  ──┐
                                       ├── src/services/  (shared domain logic)
Mobile BFF (mobile controllers)     ──┘
```

**What this means for Bazaar:**

- `src/controllers/ecommerce/` and `src/controllers/mobile/` stay separate — they are the correct BFF boundary
- `src/services/` (27 files) is the right shared layer — already correct
- The problem to solve is **not** duplication in controllers — it is:
  1. Inconsistent response envelopes across both surfaces
  2. Inconsistent error shapes and status codes
  3. Missing pagination on several endpoints
  4. No versioning prefix making deprecation impossible
  5. Performance gaps (unbounded queries, missing lean/projections, no caching)

v2 fixes all five without merging the controller trees.

---

## 1. Current State Inventory

### 1.1 Route mounting in `server.js`

| Mount prefix | Consumer | Auth model |
|---|---|---|
| `/admin`, `/admin/roles`, `/admin/permissions` | Admin Dashboard | `adminMiddleware` (Bearer + RBAC) — **OUT OF SCOPE** |
| `/user` | Storefront / User Dashboard | `authMiddleware('user')` (cookie JWT) |
| `/cart` | Storefront | `authMiddleware('user')` (cookie) |
| `/webhook` | ERP/Lightspeed | none (signed externally) — **OUT OF SCOPE** |
| `/` | Storefront + scripts | mixed |
| `/api/auth` | Flutter | Bearer JWT |
| `/api/products` | Flutter | Bearer |
| `/api/cart` | Flutter | Bearer |
| `/api/wishlist` | Flutter | Bearer |
| `/api/order` | Flutter | Bearer |
| `/api/notification` | Flutter | Bearer |
| `/api` | Flutter | mixed |
| `/api/mobile` | Flutter (version gate) | none |

**Inline routes in `server.js`** (should be extracted to route files in Phase 1):
- `POST /tabby/webhook` — raw body parsing, external contract, do not version
- `GET /health` — operational, do not version
- `POST /api/user/auth/logout`, `GET /api/user/auth/check`, `GET /api/user/profile` — web cookie auth

### 1.2 Auth middleware — already hybrid

`src/middleware/authMiddleware.js` already tries `req.cookies.user_token` first, falls back to `Authorization: Bearer`. One file serves both surfaces.

**Behavior to preserve on legacy routes:**
- `TokenExpiredError` returns **402** for cookie clients, **401** for Bearer clients — intentional, must not change on legacy paths
- Redis-throttled `lastSeen` update — already in place, must be ported to `authV2.js`
- Rate limiters on auth endpoints (20 attempts/15 min login, 5/15 min password reset)

v2 uses **401** exclusively with a discriminating `error.code` field.

### 1.3 Shared service layer — already correct

All 27 `src/services/` files are already the domain-logic source of truth. Both controller trees already delegate to the same services. **This is the right architecture and does not change.**

### 1.4 Already-shared controllers (keep as-is)

- `src/controllers/shared/wishlistController.js` — already used by both route trees
- `src/controllers/shared/bannerImageController.js` — already used by both route trees
- `src/controllers/ecommerce/shippingCountryController.js` — already imported by `routes/mobile/publicRoutes.js`

---

## 2. What v2 Actually Is

v2 is **three things only**:

1. A `/v2` route prefix that mounts the existing BFF controllers with consistent middleware
2. A shared `responseEnvelope.js` imported by both web and mobile controllers to standardise output
3. Service-layer improvements (pagination, caching, projections) that flow through to all callers

It is **not** a new unified controller layer.

### What changes vs what stays

| Layer | Change |
|---|---|
| `src/services/` | Hardening only — pagination params, caching, lean() |
| `src/controllers/ecommerce/` | Unchanged; v2 routes point at them directly |
| `src/controllers/mobile/` | Unchanged; v2 routes point at them directly |
| `src/controllers/shared/` | Unchanged |
| `src/middleware/authMiddleware.js` | Unchanged — legacy routes keep it |
| `src/middleware/authV2.js` | NEW — 401-only, lean user, optional/required variants |
| `src/middleware/platform.js` | NEW — sets `req.platform` for auth transport decision |
| `src/routes/v2/` | NEW — versioned route files pointing at existing controllers |
| `src/controllers/v2/_shared/responseEnvelope.js` | NEW — shared by both BFF trees |
| `src/controllers/v2/_shared/errors.js` | NEW — `ApiError` class |

---

## 3. Endpoint Inventory & Divergence

### 3.1 Controllers already using the same service (thin wrappers, no logic divergence)

These v2 routes will point directly at the existing shared or ecommerce controllers with no new controller file needed:

| v2 path | Points at |
|---|---|
| `/v2/wishlist/*` | `controllers/shared/wishlistController.js` (already shared) |
| `/v2/banners` | `controllers/shared/bannerImageController.js` (already shared) |
| `/v2/shipping/*` | `controllers/ecommerce/shippingCountryController.js` (already shared) |
| `/v2/notifications/*` | service layer — needs pagination added first (Phase 1) |
| `/v2/addresses/*` | same service; ecommerce and mobile controllers are identical |
| `/v2/orders/validate-inventory` | same service; same throw/return shape |

### 3.2 Controllers that differ by a single boolean flag

Cart operations differ only in option flags passed to `cartService`. In v2, a single `cartController` file reads `req.platform` to set the flag — this is the one case where a thin v2 controller wrapper makes sense:

| Flag | Web value | Mobile value |
|---|---|---|
| `includeGiftLogic` | `false` | `true` |
| `validateVariantQty` | `true` | `false` |
| `validateAvailableQty` | `true` | `false` |

A v2 cart controller is ~30 lines: read `req.platform`, derive the flags, delegate to `cartService`.

### 3.3 Auth — diverges on transport, not logic

Both call `authService.loginWithCredentials`. The only difference is the response transport:
- Web: set httpOnly cookie, return `{ message }`
- Mobile: return token bundle in body

In v2, `authController.js` uses `req.platform` to decide both. One file, ~80 lines.

### 3.4 Payment history — misleading naming, two different jobs

`GET /api/auth/payment-history` (mobile) calls `userService.getMobilePaymentHistory` which returns `{ payment: { order_history, buyer_history } }` — a **Tabby credit-assessment data feed** (last 10 orders + `registeredSince` + `successfulOrdersCount`). It is called internally during Tabby checkout setup. The endpoint name implies it is a user-facing history view but it is not.

`GET /user/user-payment-history` (web) calls `userService.getPaymentHistory` which returns all orders with full detail — a genuine user-facing view.

**v2 resolution:**
- `GET /v2/user/payment-history` → `userService.getPaymentHistory` (same for web and mobile — display only)
- Rename `getMobilePaymentHistory` → `getTabbyBuyerHistory` in `userService.js` to make intent explicit
- Remove `/api/auth/payment-history` from public routes in Phase 3 (it is an internal checkout helper, not a user-facing endpoint)

### 3.5 Genuinely mobile-only (carry over to v2 unchanged)

- Refresh token, check access token
- Stripe customer ID
- Payment intent, payment methods
- Proof of delivery upload
- Notification click tracking
- Feedback, mobile app log
- Version config (`/api/mobile/config`)

### 3.5 Genuinely web-only (carry over to v2, now also available to future mobile)

- User orders dashboard, review history
- **Orders list** — web and mobile already call the same `orderService.getOrders`; fully equivalent
- **Review history** — web calls `userService.getUserReviews`; mobile has no equivalent endpoint today; v2 exposes it to both
- **Payment history** — two different service methods with different purposes (see §3 divergence note)
- CMS data endpoints (read-only; write stays admin-only)
- Newsletter subscription

### 3.6 Not versioned (external contracts)

- `/admin/*` — admin stays as-is
- `/webhook/*`, `/tabby/webhook` — ERP and payment provider contracts, fixed URLs
- `/health` — operational, unversioned

---

## 4. Response Shape Standardisation

### 4.1 Canonical v2 envelope

All v2 responses use one of three shapes from `responseEnvelope.js`:

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Paginated:**
```json
{ "success": true, "data": [...], "total": N, "page": 1, "limit": 20 }
```

**Error:**
```json
{ "success": false, "error": { "code": "TOKEN_EXPIRED", "message": "...", "details": null } }
```

### 4.2 Auth error codes (v2 only — legacy preserves 402)

| Code | HTTP status | Meaning |
|---|---|---|
| `TOKEN_EXPIRED` | 401 | Token valid but expired — client should refresh |
| `TOKEN_INVALID` | 401 | Malformed or tampered — force re-login |
| `INSUFFICIENT_PERMISSION` | 403 | Authenticated but wrong role |
| `RESOURCE_NOT_FOUND` | 404 | Standard |
| `VALIDATION_ERROR` | 400 | With `details` array of field errors |
| `RATE_LIMITED` | 429 | Too many requests |

### 4.3 Login response (v2)

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "avatar": "..." },
    "tokens": { "accessToken": "...", "refreshToken": "..." },
    "coupon": { ... },
    "totalOrderCount": 0,
    "usedFirst15Coupon": false
  }
}
```

Web clients additionally receive `Set-Cookie: user_token=…` when `req.platform === 'web'`.

### 4.4 Current shape problems being fixed

| Endpoint | Current problem | v2 fix |
|---|---|---|
| `GET /api/user/profile` | Flat top-level keys, no `success` | `{ success, data: { user, coupon } }` |
| `GET /api/notification` | No pagination, all notifications in one response | Paginated with `total/page/limit` |
| `GET /api/order/get-orders` | Now returns `data: []` (fixed), but `total/page/limit` are top-level | Wrap in `{ success, data: [], total, page, limit }` — already backward-compat |
| Login web | Returns only `{ message }` | v2 returns full data bundle |
| Error responses | Mixed shapes across controllers | Unified `ApiError` with `.code` |

---

## 5. v2 Route Structure

```
/v2/auth/login                     POST
/v2/auth/register                  POST
/v2/auth/logout                    POST
/v2/auth/refresh-token             POST   (mobile; web ignores)
/v2/auth/check-access-token        GET    (mobile; web ignores)
/v2/auth/forgot-password           POST
/v2/auth/verify-code               POST
/v2/auth/reset-password            POST
/v2/auth/google                    POST
/v2/auth/apple                     POST
/v2/auth/account                   DELETE

/v2/user/me                        GET, PUT
/v2/user/customerId                GET, POST  (mobile)
/v2/user/orders                    GET        (paginated)
/v2/user/orders/:id                GET
/v2/user/payment-history           GET
/v2/user/dashboard                 GET        (web; mobile can now call too)
/v2/user/reviews                   GET

/v2/addresses                      POST
/v2/addresses/:id                  PUT, DELETE
/v2/addresses/:id/primary          PUT

/v2/cart                           GET
/v2/cart/add                       POST
/v2/cart/remove                    DELETE
/v2/cart/increase                  PUT
/v2/cart/decrease                  PUT

/v2/wishlist                       GET, POST
/v2/wishlist/:productId            DELETE

/v2/products                       GET
/v2/products/search                GET
/v2/products/by-variant            GET
/v2/products/:id                   GET
/v2/products/:id/similar           GET
/v2/products/:id/reviews           GET, POST
/v2/categories                     GET
/v2/brands                         GET

/v2/orders/validate-inventory      POST
/v2/orders/checkout/stripe         POST
/v2/orders/checkout/tabby          POST
/v2/orders/checkout/nomod          POST
/v2/orders/verify/stripe           POST
/v2/orders/verify/tabby            POST
/v2/orders/verify/nomod            POST
/v2/orders/:id/status              PUT
/v2/orders/:id/proof-of-delivery   POST

/v2/notifications                  GET  (paginated)
/v2/notifications/read             PUT
/v2/notifications/track-click      POST

/v2/coupons                        GET
/v2/coupons/check                  POST

/v2/banners                        GET
/v2/shipping/countries             GET
/v2/shipping/cities                GET
/v2/shipping/cost                  GET

/v2/cms/:section                   GET
/v2/config                         GET
/v2/public/contact                 POST
/v2/public/feedback                POST
/v2/public/log                     POST
/v2/public/newsletter              POST
```

---

## 6. Service Layer Improvements (Phase 1)

These fix real problems and benefit all callers — legacy routes included where safe to do so.

### 6.1 Pagination gaps (fix in service layer, not just v2)

| Service method | Problem | Fix |
|---|---|---|
| `notificationService.getUserNotifications` | No pagination — returns all docs | Add `{ page=1, limit=20 }` param; undefined = legacy behaviour |
| `userService.getPaymentHistory` | Verify no limit | Add pagination |
| `orderService.getOrders` | Fixed (2026-04-28) | Done ✓ |

### 6.2 Caching gaps

| Location | Problem | Fix |
|---|---|---|
| `server.js:220` `/api/user/profile` | `Coupon.findOne({ phone })` on every request | Cache by phone in Redis, 60s TTL; `cache.js` already available |
| `authService.loginWithCredentials` | `Order.countDocuments` on every login | Cache per-user order count, 5 min TTL |
| `/categories`, `/all-categories` | Heavy aggregation, no cache | Redis cache, 5 min TTL + `Cache-Control: public, max-age=300` on v2 |
| Product list (hot reads) | No HTTP cache headers | Add `Cache-Control: public, max-age=60` on public product list endpoints in v2 |

### 6.3 Query optimisation gaps

| Location | Problem | Fix |
|---|---|---|
| `authMiddleware.js:49` | `User.findById` returns full Mongoose doc | `authV2.js` uses `.lean()` — read-only path doesn't need hydration |
| `cartService` Product joins | No `.select()` on joined products | Add projection for fields actually rendered in cart |
| `productService` list | Verify lean() + projection on all list queries | Audit and enforce in v2 path |
| `notificationService` | No `.lean()` on list query | Add `.lean()` |

### 6.4 Service extractions needed

| Current location | Problem | Fix |
|---|---|---|
| `server.js:220` inline route | Coupon lookup + profile merge not in a service | Extract to `userService.getProfile()` |
| `userController.addReview` vs `productController.addReview` | Two implementations of the same operation | Pick one (likely `productController` is more complete), move to `reviewService` |
| `mobile/authController` inline order count | `Order.countDocuments` inline, not in service | Move to `userService.getOrderCount` with cache |

---

## 7. Migration Plan

### Phase 0 — Shared infrastructure (1–2 days, zero risk)

1. Create `src/controllers/v2/_shared/responseEnvelope.js`
2. Create `src/controllers/v2/_shared/errors.js` (`ApiError` class)
3. Create `src/middleware/platform.js`
4. Create `src/middleware/authV2.js` (401-only, optional/required, lean user)

No routes changed. No existing behaviour changed. Rollback: delete files.

### Phase 1 — Service layer hardening (3–5 days)

1. Add pagination to `notificationService.getUserNotifications`
2. Extract `userService.getProfile` from inline `server.js` route
3. Extract `userService.getOrderCount` with Redis cache from inline `authController` logic
4. Add Redis caching to category list and coupon-by-phone lookups
5. Reconcile `addReview` into single implementation
6. Add `.lean()` and projections to notification and cart service queries
7. Rename `userService.getMobilePaymentHistory` → `getTabbyBuyerHistory`; update the one caller (`mobile/authController.getPaymentHistory`) accordingly
8. All 539 existing tests must remain green; add tests for changed service methods

Rollback: per-PR revert. No public routes change.

### Phase 2 — `/v2` routes behind feature flag (5–8 days)

1. Create `src/routes/v2/` route files
2. Create `src/controllers/v2/` — only where a thin wrapper is needed (cart platform-flag logic, auth transport logic). All others point at existing controllers.
3. Mount in `server.js`:
   ```js
   if (process.env.V2_ENABLED === 'true') {
     app.use('/v2', platformMiddleware, v2Router);
   }
   ```
4. Enable `V2_ENABLED=true` on test server only
5. Add contract tests: for every v2 endpoint, assert it produces the same service-layer call as its legacy equivalent
6. One week of QA on test server before prod

Rollback: set `V2_ENABLED=false`, redeploy (< 2 min).

### Phase 3 — Client migration (4–8 weeks)

1. Enable `V2_ENABLED=true` on prod
2. Add deprecation signals to legacy routes:
   ```
   Deprecation: true
   Sunset: 2026-10-01
   Link: </v2/...>; rel="successor-version"
   ```
3. Web client migrates incrementally — cookie auth works on v2 via `req.platform` detection
4. Mobile client migrates in next release cycle (Abbas, 1.0.34+ cadence)
5. `requestMetrics` middleware (already in place) tracks per-legacy-route traffic to know when safe to remove

### Phase 4 — Legacy removal (deferred, data-driven)

Remove legacy routes after 30 consecutive days of < 1% traffic on each route. Requires full team sign-off. Irreversible without redeploy.

### Rollback table

| Phase | Mechanism | Time |
|---|---|---|
| 0 | Delete files | < 5 min |
| 1 | Git revert per PR | < 5 min |
| 2 | `V2_ENABLED=false` + redeploy | < 2 min |
| 3 | No rollback needed | N/A |
| 4 | Redeploy from git history | 10–15 min |

---

## 8. Proposed File Structure

### BFF separation is preserved in v2

We follow the Backend for Frontend pattern at every layer:

- `controllers/ecommerce/` — legacy web BFF (unchanged)
- `controllers/mobile/` — legacy mobile BFF (unchanged)
- `controllers/v2/web/` — v2 web BFF
- `controllers/v2/mobile/` — v2 mobile BFF
- `controllers/v2/_shared/` — truly platform-agnostic controllers (categories, banners, shipping, cms)

Both web and mobile clients use the **same `/v2` URL prefix**. The platform router in `routes/v2/index.js` detects the client via `middleware/platform.js` and dispatches to the correct BFF controller — web or mobile — without the caller knowing or caring.

This keeps each controller focused on one client. There is no `if (req.platform === 'web')` branching inside controller methods — that grows into a maintenance problem over time.

### Route dispatch pattern

```js
// routes/v2/index.js
const platform = require('../../middleware/platform');
const webRouter = require('./web');      // mounts web BFF controllers
const mobileRouter = require('./mobile'); // mounts mobile BFF controllers
const sharedRouter = require('./shared'); // mounts _shared controllers

router.use(platform);
router.use((req, res, next) => {
    if (req.platform === 'web') return webRouter(req, res, next);
    mobileRouter(req, res, next);       // 'mobile' and 'unknown' use mobile BFF
});
router.use(sharedRouter);               // shared routes apply to all platforms
```

### File structure

```
src/
├── routes/
│   ├── ecommerce/                  ← UNCHANGED (legacy web routes)
│   ├── mobile/                     ← UNCHANGED (legacy mobile routes)
│   └── v2/
│       ├── index.js                ← platform detection + dispatch to web/mobile/shared
│       ├── web/
│       │   ├── authRoutes.js
│       │   ├── cartRoutes.js
│       │   ├── userRoutes.js
│       │   ├── orderRoutes.js
│       │   └── notificationRoutes.js
│       ├── mobile/
│       │   ├── authRoutes.js
│       │   ├── cartRoutes.js
│       │   ├── userRoutes.js
│       │   ├── orderRoutes.js
│       │   ├── notificationRoutes.js
│       │   └── configRoutes.js       ← mobile-only
│       └── shared/
│           ├── productRoutes.js      ← same response for both clients
│           ├── wishlistRoutes.js
│           ├── bannerRoutes.js
│           ├── shippingRoutes.js
│           ├── couponRoutes.js
│           ├── cmsRoutes.js
│           └── publicRoutes.js
│
├── controllers/
│   ├── ecommerce/                  ← UNCHANGED (legacy web BFF)
│   ├── mobile/                     ← UNCHANGED (legacy mobile BFF)
│   ├── shared/                     ← UNCHANGED (wishlist, banner)
│   └── v2/
│       ├── _shared/
│       │   ├── responseEnvelope.js ← wrap(), paginated(), wrapError()
│       │   └── errors.js           ← ApiError class
│       │
│       ├── web/                    ← v2 web BFF
│       │   ├── authController.js   ← sets httpOnly cookie, returns minimal payload
│       │   ├── cartController.js   ← validateVariantQty:true, validateAvailableQty:true
│       │   ├── userController.js   ← me, dashboard, orders, reviews, payment-history
│       │   ├── orderController.js  ← web checkout flows (Stripe/Tabby/Nomod)
│       │   └── notificationController.js
│       │
│       ├── mobile/                 ← v2 mobile BFF
│       │   ├── authController.js   ← returns token bundle, refresh token, session
│       │   ├── cartController.js   ← includeGiftLogic:true, no qty validation
│       │   ├── userController.js   ← me, customerId, orders, reviews, payment-history
│       │   ├── orderController.js  ← mobile checkout + proof-of-delivery
│       │   ├── notificationController.js ← includes track-click
│       │   └── configController.js ← version gate (mobile-only)
│       │
│       └── shared/                 ← platform-agnostic controllers
│           ├── productController.js
│           ├── wishlistController.js
│           ├── bannerController.js
│           ├── shippingController.js
│           ├── couponController.js
│           ├── cmsController.js
│           └── publicController.js
│
├── services/                       ← UNCHANGED structure; method improvements only
│
└── middleware/
    ├── authMiddleware.js           ← UNCHANGED (legacy routes)
    ├── authV2.js                   ← NEW — 401-only, lean user, optional/required
    └── platform.js                 ← NEW — sets req.platform = 'web'|'mobile'|'unknown'
```

### What goes where — decision rule

| Controller file | Put in | Reason |
|---|---|---|
| auth (login, register, logout) | `web/` and `mobile/` separately | Transport diverges: cookie vs token bundle |
| cart | `web/` and `mobile/` separately | Option flags diverge: gift logic, qty validation |
| user (me, orders, dashboard) | `web/` and `mobile/` separately | Web has richer dashboard; mobile has customerId endpoint |
| order (checkout, verify) | `web/` and `mobile/` separately | Payment flows have platform-specific steps |
| notifications | `web/` and `mobile/` separately | Mobile has track-click; web does not |
| products, wishlist, banners | `shared/` | Same data, same shape, no platform flags |
| shipping, coupons, cms, public | `shared/` | Identical across clients |
| config | `mobile/` only | Version gate is mobile-only |

**Total new controller files: 18** (5 web + 6 mobile + 7 shared). All call into the existing `src/services/` layer.

---

## 9. What This Achieves

| Problem | Solution |
|---|---|
| Inconsistent response envelopes | `responseEnvelope.js` imported by all v2 routes |
| Mixed error shapes and status codes | `ApiError` + standardised codes in `authV2.js` |
| Missing pagination | Added to notification and payment history services |
| No versioning prefix | `/v2` prefix + deprecation headers on legacy |
| Unbounded queries causing memory spikes | Pagination enforced in service layer |
| Redundant DB/API calls on auth | Caching added for coupon-by-phone and order count |
| Hard to find errors (no source labelling) | `requestMetrics` already in place; v2 adds `X-API-Version: 2` response header |
| Two controller trees maintained separately | No change — correct BFF pattern, kept separate |

---

## 10. What This Does NOT Do (by design)

- **Does not merge ecommerce and mobile controllers** — BFF separation is correct
- **Does not change admin routes** — out of scope
- **Does not change webhooks** — external contracts
- **Does not introduce GraphQL** — appropriate for a future phase if mobile needs field-level control
- **Does not remove legacy routes** until traffic data confirms it is safe

---

## Frontend Migration Notes (post-review fixes)

These changes were made after the initial implementation in response to a frontend integration review. Web and mobile clients integrating against `/v2` should be aware of the following contracts.

### Required headers

All `/v2` requests should set `X-Client: web` or `X-Client: mobile`. Requests with no `X-Client` header, no `user_token` cookie, and no `Authorization: Bearer` header will receive `400 UNKNOWN_PLATFORM`. The middleware also infers platform from cookie (web) and bearer token (mobile) for backwards-compatible browser cases, but explicit `X-Client` is recommended.

### Response envelope (uniform across all v2 endpoints)

Success:
```json
{ "success": true, "data": { ... }, "message": "optional" }
```

Paginated success:
```json
{ "success": true, "data": [ ... ], "meta": { "total": 100, "page": 1, "limit": 20, "pages": 5 } }
```
Pagination-related extras (e.g. `unreadCount` on notifications) live inside `meta`, not at the top level.

Error (always — no exceptions):
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": { ... } } }
```
`details` is optional. Error codes are stable identifiers — clients should branch on `error.code`, not `error.message`.

### Auth contracts

**Mobile** receives tokens in the response body. Login, google-login, apple-login all return:
```json
{ "success": true, "data": { "accessToken": "...", "refreshToken": "...", "user": {...}, "coupon": ..., "totalOrderCount": ..., "usedFirst15Coupon": ... } }
```
Refresh-token response also uses `accessToken` (not `token`). All authenticated mobile requests must send `Authorization: Bearer <accessToken>`.

**Web** uses an httpOnly `user_token` cookie set automatically by login/google-login/apple-login. The body returns the same user/coupon shape as mobile (without tokens):
```json
{ "success": true, "data": { "user": {...}, "coupon": ..., "totalOrderCount": ..., "usedFirst15Coupon": ... } }
```

`GET /v2/auth/check` (web only) returns `{ authenticated: boolean }` and **does not** return user data. Clients that need user data should call `GET /v2/auth/user-data`.

### Rate limits

The following v2 paths inherit existing rate limiters in `server.js`:

- 20 req/15min: `/v2/auth/login`, `/v2/auth/register`, `/v2/auth/google-login`, `/v2/auth/apple-login`, `/v2/auth/refresh-token`
- 5 req/15min: `/v2/auth/forgot-password`, `/v2/auth/reset-password`, `/v2/auth/verify-code`, `/v2/auth/resend-recovery-code`

429 responses use the legacy `{ success: false, message: "..." }` shape (shared with v1).

### CORS / cookies (web)

Cookies are issued with `secure: true`, `sameSite: 'none'`, and `domain` from the `DOMAIN` env var. The web frontend must:
- Use HTTPS (cookies will not be sent on plain HTTP)
- Send `credentials: 'include'` on fetch / `withCredentials: true` on axios
- Be served from a subdomain of `DOMAIN`

### Feature flag

The v2 router is mounted only when `V2_ENABLED=true`. v1 routes remain fully operational and unchanged.
