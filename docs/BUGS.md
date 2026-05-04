# Bugs Surfaced by Test Coverage Work

Living tracker of production bugs discovered while writing tests across PR1–PR9. Status legend: `OPEN`, `FIXED`, `WONTFIX`, `DUPLICATE`.

---

## HIGH severity

### BUG-001 — StripeProvider.refund() returns 500 instead of 400 on missing payment_intent
- **File:** `src/services/payments/StripeProvider.js`
- **Status:** **FIXED** (PR3)
- **Symptom:** Null guard `throw { status: 400, ... }` was inside the `try` block; the outer `catch` rewrapped using `error.statusCode || 500`, masking the 400.
- **Fix applied:** Moved the guard before the `try` block.
- **Source:** PR2 finding, PR3 fix.

### BUG-002 — checkoutService.processCheckout throws ValidationError on every call
- **File:** `src/services/checkoutService.js`, `exports.processCheckout` (~line 1545)
- **Route:** `POST /checkout` (`src/routes/ecommerce/publicRoutes.js:98`, no auth)
- **Status:** **FIXED** (PR8)
- **Symptom:** `Order.create()` called without required schema fields: `txn_id`, `status`, `amount_subtotal`, `amount_total`, `discount_amount`, `payment_method`. Every call hit Mongoose `ValidationError` → re-thrown as 500.
- **Fix applied:** Populate the missing fields with reasonable defaults (txn_id=paymentIntent.id, status="pending", payment_method="stripe", etc.).
- **Source:** PR7 finding, PR8 fix.

### BUG-003 — tabbyWebhook reads `req.user._id` unguarded on a public route
- **File:** `src/controllers/ecommerce/publicController.js` (~line 857)
- **Route:** Tabby webhook endpoint (public — no auth middleware)
- **Status:** **OPEN**
- **Symptom:** `const user_id = req.user._id;` on a route that may be called without authentication. Throws `TypeError: Cannot read properties of undefined (reading '_id')`. The error is currently swallowed by the surrounding try/catch, but the webhook then runs in a degraded state.
- **Impact:** Tabby webhooks may be silently mis-recorded if Tabby ever calls the endpoint (which they should — it's a webhook).
- **Recommended fix:** Use optional chaining (`req.user?._id`) and accept that webhooks have no user; pull user from the payment record instead.
- **Source:** PR9 finding.

### BUG-004 — verifyTabbyPayment reads `req.user._id` unguarded
- **File:** `src/controllers/ecommerce/publicController.js` (~line 792)
- **Status:** **OPEN**
- **Symptom:** `const user_id = req.user._id;` without optional chaining, unlike sibling `createCardCheckout` which uses `req.user?._id`. Throws TypeError when called without auth; caught and logged as a generic error.
- **Recommended fix:** Use optional chaining + explicit 401 response when user is required.
- **Source:** PR9 finding.

---

## MEDIUM severity

### BUG-005 — couponService expiry uses strict `<` instead of `<=`
- **File:** `src/services/couponService.js`, `checkCouponCode()`
- **Status:** **OPEN** (product decision)
- **Symptom:** `if (expiry < now)` accepts a coupon at exactly the expiry timestamp. Off-by-one at millisecond resolution.
- **Impact:** Low — millisecond window — but ops/finance may expect strict expiry semantics.
- **Recommended fix:** Change to `<=`. Confirm with product first; existing test pins current behavior.
- **Source:** PR4 finding.

### BUG-006 — contactUs validation message has stray suffix "123"
- **File:** `src/controllers/ecommerce/publicController.js` (~line 1010)
- **Status:** **OPEN**
- **Symptom:** Validation error message reads `"Email is required123"`. Looks like a leftover from debugging.
- **Impact:** Low; user-facing string only. Embarrassing in production.
- **Recommended fix:** Remove `123` suffix.
- **Source:** PR9 finding.

### BUG-007 — productDetails vs fetchProductDetails use divergent API response shapes
- **File:** `src/controllers/ecommerce/publicController.js`
- **Status:** **OPEN**
- **Symptom:** Public `productDetails` reads `response.data`; private `fetchProductDetails` reads `response.data.data`. Two implementations against (probably) different Lightspeed API versions.
- **Impact:** Silent breakage if Lightspeed ships a unifying version change. One handler will start returning empty or undefined data.
- **Recommended fix:** Pick one shape, normalize at a single boundary, write a contract test pinning the expected envelope.
- **Source:** PR9 finding.

---

## LOW severity

### BUG-008 — Duplicate Mongoose index `{id:1}` warning at startup
- **Files:** Unknown (not Cart, not PendingPayment — those were fixed in PR3)
- **Status:** **OPEN**
- **Symptom:** Mongoose emits `[DEP0173]` duplicate-index warning on every test run. Source not yet identified.
- **Recommended fix:** Run with `node --trace-warnings` to locate, then remove the redundant `.index()` call.
- **Source:** PR3 follow-up note.

### BUG-009 — pino thread-stream worker leaks across tests
- **File:** `src/utilities/logger.js`
- **Status:** **OPEN** (masked by `--forceExit`)
- **Symptom:** Pino's `thread-stream` keeps a worker alive after every test process. `--forceExit` masks it.
- **Impact:** None at runtime; only test hygiene noise.
- **Recommended fix:** Use sync transport in test env, or call `logger.flush()` + dispose in a Jest globalTeardown.
- **Source:** PR1 note, persists.

---

### BUG-010 — orderService/checkoutService ENVIRONMENT=true gated blocks uncoverable in shared test context
- **File:** `src/services/orderService.js` (lines 1000-1037, 2041-2553), `src/services/checkoutService.js` (lines 756-779, 1367-1385)
- **Status:** **OPEN** (by design — not a runtime bug)
- **Symptom:** `const ENVIRONMENT = process.env.ENVIRONMENT` is captured at module-import time. Jest runs multiple test files sharing the same Node process; files that set `ENVIRONMENT=test` are already loaded before tests run. The ENVIRONMENT=true blocks cannot be reached within a test file that imported the service before setting the env var.
- **Impact:** Branch/line coverage gap (~119 lines in checkoutService, ~88 lines in orderService). Runtime is unaffected.
- **Recommended fix:** Either (a) refactor to read `process.env.ENVIRONMENT` inline at call-time instead of module-scope, or (b) maintain separate `*.env.test.js` files that set the var before importing (as done for checkoutService.env.test.js in PR11).
- **Source:** Discovered during PR11 coverage push.

### BUG-012 — checkSpelling function in productService is dead code (never called)
- **File:** `src/services/productService.js:242`
- **Status:** OPEN
- **Symptom:** `checkSpelling(word)` is defined at line 242 but has zero call sites in the file. No function in `productService.js` ever invokes it. The function references the module-level `dictionary` (typo-js) and `spellingCache` (NodeCache). Its 28 lines (242-269) are permanently uncovered.
- **Impact:** Dead code: ~28 lines of untestable coverage debt, plus a misleading API surface. Any consumer expecting spelling-correction suggestions in search results gets none silently.
- **Recommended fix:** Either (a) call `checkSpelling` from `searchProducts` when `filteredProducts.length === 0` to surface spelling suggestions in the API response, or (b) delete the function if the feature is deferred.
- **Source:** PR12 finding.

### BUG-013 — logStatusFalseItems in productService has unreachable branches
- **File:** `src/services/productService.js:101-108`
- **Status:** OPEN
- **Symptom:** `logStatusFalseItems` has branches for `responseData.data.products` (line 102) and `responseData.data` as array (lines 104-108). No call site in the file passes a responseData with either of these shapes — all callers pass shapes with `.products`, `.filteredProducts`, or `.product + .id`. The branches are permanently uncovered.
- **Impact:** Dead branch coverage debt (~7 lines). Not a runtime risk, but the defensive checks are misleading.
- **Recommended fix:** Remove unused branches, or add a caller that exercises those shapes.
- **Source:** PR12 finding.

### BUG-014 — shared/productController.js: /v2/products/similar masked by /v2/products/:id route
- **File:** `src/routes/v2/shared/index.js` (line 23) and `src/controllers/v2/shared/productController.js` (lines 73-80)
- **Status:** **OPEN**
- **Symptom:** `router.get('/products/similar', ...)` is registered AFTER `router.get('/products/:id', ...)`. Express matches `/products/similar` to the `:id` route first, so `similarProducts` handler is never reached. Any request to `GET /v2/products/similar` calls `getProductDetails("similar")` instead of `getSimilarProducts(...)`.
- **Impact:** The similar-products endpoint silently calls the wrong handler. If a product with id="similar" doesn't exist, the caller receives a 404 from `getProductDetails` rather than similar-product data.
- **Recommended fix:** Move the `/products/similar` route registration before `/products/:id` in the shared router.
- **Source:** PR13 coverage work — `similarProducts` function (lines 73-80) cannot be covered because the route is unreachable.

### BUG-015 — couponService.fetchCouponDetails uses console.error instead of logger
- **File:** `src/services/couponService.js` (lines 59-62)
- **Status:** **OPEN** (low severity)
- **Symptom:** The catch block in `fetchCouponDetails` uses `console.error(...)` instead of the `logger` utility used elsewhere in the file (lines 56, 242, etc.). This bypasses the structured logging pipeline.
- **Impact:** Lightspeed API failures for UAE10 coupon lookups won't appear in the structured log stream. Ops teams monitoring the logger won't see these errors.
- **Recommended fix:** Replace `console.error(...)` with `logger.error({ err: error, id }, 'Error fetching coupon details:')`.
- **Source:** PR13 — observed during couponService test coverage pass.

### BUG-011 — verifyTabbyPayment in orderService calls axios.post for capture but no post mock guard
- **File:** `src/services/orderService.js` (line 1540)
- **Status:** **OPEN** (test isolation only)
- **Symptom:** When `verifyTabbyPayment` receives AUTHORIZED status, it calls `axios.post(...)` for the capture. Tests that mock `axios.get` but not `axios.post` can get undefined behavior if the post mock isn't set.
- **Impact:** None at runtime. Tests must explicitly mock `axios.post` when testing the AUTHORIZED→capture path.
- **Source:** Discovered during PR11 test writing.

---

## How to use

When a new bug is found:
1. Add a new `BUG-NNN` entry under the right severity.
2. Note source PR.
3. When fixed, mark `FIXED` and reference the fix PR/commit.

When a bug is fixed:
- Don't delete — keep it as historical record. Status field tracks current state.

---

## PR14 — Cross-client API map findings

The bugs below were surfaced by the PR14 audit (`docs/api-map/MAP.md`,
`docs/api-map/backend-routes.json`, and the per-client JSON files).
All entries are extractor-confirmed: regex-based, ~5% noise tolerance. See
`scripts/api-map/` for the extraction code.

### BUG-016 — bazaar-web calls /v2/recommendations/* but no backend routes exist (ORPHAN)
- **Severity:** HIGH (web side)
- **Backend file:** n/a (no route registered under `/v2/recommendations`)
- **Client(s) affected:** web (`bazaar-web/src/services/recommendations.js`)
- **Status:** OPEN — **client side, not backend.** Per project policy v2 is dev-only and clients should NOT be calling v2 yet. This file in `bazaar-web` is shipping prematurely (or is dead code that still imports). Either remove it from web, feature-flag it off, or confirm it's unreferenced.
- **Symptom:** `recommendationsApi` calls five endpoints under `/v2/recommendations/*`. None are registered anywhere in the backend. v2 is intentionally dev-only (see BUG-026), so this client code shouldn't be live.
- **Impact:** If any web page mounts these widgets in production, every recommendation request 404s. If the file is unreferenced, no runtime impact — just dead code carrying a false "uses v2" signal.
- **Recommended action:** Web team — verify whether `recommendations.js` is imported by any rendered component. If yes, gate behind a feature flag and disable until v2 ships. If no, delete the file. Backend should NOT add these routes ahead of the broader v2 rollout.
- **Source:** PR14 audit, `docs/api-map/MAP.md` ORPHAN row; reclassified per project owner.

### BUG-017 — bazaar-web calls POST /redeem-coupon without leading slash (works, but fragile)
- **Severity:** LOW
- **Backend file:** `src/routes/ecommerce/publicRoutes.js:109`
- **Client(s) affected:** web (`bazaar-web/src/components/Checkout/Checkout.jsx:552`)
- **Status:** OPEN
- **Symptom:** `axiosInstance.post("redeem-coupon", ...)` (no leading `/`). Works because axios resolves relative to baseURL, but is inconsistent with every other call in the codebase and breaks if baseURL ever lacks a trailing slash.
- **Impact:** Latent fragility; not a current outage.
- **Recommended fix:** Change to `axiosInstance.post("/redeem-coupon", ...)`.
- **Source:** PR14 audit.

### BUG-018 — Web reads `flashSale` field from /flash-sale-data but backend returns differently named keys (CLIENT-ONLY)
- **Severity:** MEDIUM
- **Backend file:** `src/controllers/ecommerce/publicController.js` (search for `flash-sale-data`)
- **Client(s) affected:** web
- **Status:** OPEN (extractor-suspected; confirm by reading both ends)
- **Symptom:** Client destructures `flashSale` from `response.data`, but the v1 controller (regex-extracted) does not show that key in any `res.json({...})` literal. Likely the controller returns `data.flashSale` nested, or the field name has drifted. Needs manual confirmation.
- **Impact:** If the field is genuinely absent, the flash-sale section renders blank.
- **Recommended fix:** Either rename the backend response key to `flashSale` for consistency, or fix the client to read the actual returned key. Add a v1 contract test to lock the chosen shape.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-019 — Web reads `shippingCost` and `freeShippingThreshold` from /shipping-cost but those fields are not in the controller's res.json literal (CLIENT-ONLY)
- **Severity:** MEDIUM
- **Backend file:** Search `src/controllers/**/*.js` for `shipping-cost` handler
- **Client(s) affected:** web
- **Status:** OPEN
- **Symptom:** Client expects `response.data.shippingCost` and `response.data.freeShippingThreshold`. The model has `freeShippingThreshold` (`src/models/ShippingCountry.js:21`), but the route's response shape (regex-extracted) does not surface those keys directly; they may be nested inside a Mongoose document spread.
- **Impact:** Free-shipping threshold UI on storefront may not render when expected.
- **Recommended fix:** Verify the controller, then either flatten the response or update the client. Pin with a v1 contract test.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-020 — Web reads `total_orders / shipped_orders / delivered_orders / canceled_orders` from /user/user-orders, fields not present in res.json literal (CLIENT-ONLY)
- **Severity:** HIGH
- **Backend file:** `src/routes/ecommerce/userRoutes.js:31` → `orders` controller
- **Client(s) affected:** web (account dashboard summary)
- **Status:** OPEN
- **Symptom:** Account-page header shows order counts (total / shipped / delivered / canceled). Client destructures those four fields from `response.data`. Backend handler (`orders` in ecommerce userController/orderController) returns the orders array but does not appear to return aggregate counts in `res.json({...})`.
- **Impact:** All four counters likely render as `undefined` (or 0 after defaulting). User-facing dashboard summary is wrong.
- **Recommended fix:** Add aggregate counts to the backend response, or move counting to the client. There is a `/v2/user/dashboard` route (`src/controllers/v2/web/userController.js`) — migrate the client to that and pin the shape with a contract test.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-021 — Web reads `randomProducts` from /random-products/:id but field name not in extracted shape (CLIENT-ONLY)
- **Severity:** MEDIUM
- **Backend file:** `src/controllers/ecommerce/publicController.js` (search `random-products`)
- **Client(s) affected:** web
- **Status:** OPEN (suspected)
- **Symptom:** Client destructures `randomProducts` from `response.data`. Backend route returns a list of products under a different key (or directly as the `data` array).
- **Impact:** "You may also like" sections may not populate.
- **Recommended fix:** Confirm by reading the controller and align names.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-022 — Web /user/user-review reads `products` but route returns reviews (CLIENT-ONLY)
- **Severity:** MEDIUM
- **Backend file:** `src/routes/ecommerce/userRoutes.js` user-review handler
- **Client(s) affected:** web
- **Status:** OPEN
- **Symptom:** Client destructures `products` from response. The route serves user reviews — likely returns `reviews` or `data: [...]`. Field name drift.
- **Impact:** "Your reviews" page on the account section may render empty.
- **Recommended fix:** Confirm and align. v2 has `/v2/user/reviews` — migrate.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-023 — Admin /admin/coupon reads `coupons` but extracted shape lacks the key (CLIENT-ONLY)
- **Severity:** MEDIUM
- **Backend file:** `src/routes/ecommerce/adminRoutes.js` admin coupon list handler
- **Client(s) affected:** admin (Bazaar-Admin-Dashboard)
- **Status:** OPEN (suspected)
- **Symptom:** Admin dashboard expects `response.data.coupons`. Backend response shape (regex-extracted) does not surface that key.
- **Impact:** Coupon list page in admin may render empty until the shape mismatch is confirmed/fixed.
- **Recommended fix:** Confirm controller. Likely the regex missed a nested ternary; or the response is `{ data: [...] }` and the admin should read `data` instead of `coupons`.
- **Source:** PR14 audit, CLIENT-ONLY row.

### BUG-024 — Admin /admin/email-config response shape mismatch (CLIENT-ONLY)
- **Severity:** LOW
- **Backend file:** `src/routes/ecommerce/emailRoutes.js`
- **Client(s) affected:** admin
- **Status:** OPEN (suspected)
- **Symptom:** Admin reads `emailConfig` field from both GET and POST sync-env responses. Backend res.json literal lacks the key.
- **Impact:** Email-config admin page may misrender.
- **Recommended fix:** Confirm and align.
- **Source:** PR14 audit.

### BUG-025 — Admin /admin/notifications/:id reads `notification` field; backend likely returns flat object (CLIENT-ONLY)
- **Severity:** LOW
- **Backend file:** `src/routes/ecommerce/adminRoutes.js` notifications detail handler
- **Client(s) affected:** admin
- **Status:** OPEN (suspected)
- **Symptom:** Admin expects `response.data.notification`. Backend likely returns the notification object directly.
- **Impact:** Notification detail page may not render.
- **Recommended fix:** Confirm and align.
- **Source:** PR14 audit.

### BUG-026 — All v2 routes are UNUSED by every shipping client (expected during dev)
- **Severity:** N/A (intended state)
- **Backend file:** `src/routes/v2/**`
- **Client(s) affected:** web, admin, mobile
- **Status:** **WONTFIX-FOR-NOW** — v2 is in active development. Client integration is intentionally deferred until backend modularization, scalability, and performance work is complete.
- **Symptom:** PR14 cross-reference confirms 0 calls from `bazaar-web`, `Bazaar-Admin-Dashboard`, or `Bazaar-Mobile-App` to any `/v2/*` route. The 60 v2 routes exist only for the contract test suite.
- **Impact:** None today — this is the planned phase. v1 remains the production surface during v2 hardening. The contract test suite locks the v2 shape so it doesn't drift while awaiting integration.
- **Recommended action:** Do NOT route real client traffic to v2 yet. When backend modernization is complete, schedule client migration sprints — web (auth + cart + orders + user) and mobile auth first — and burn down v1 only after each client is confirmed off it.
- **Source:** PR14 audit summary; reclassified per project owner.

### BUG-028 — fetchProductDetails price field divergence: tax_inclusive (checkout) vs tax_exclusive (order/mobile)
- **Files:** `src/services/shared/lightspeedClient.js` (canonical), formerly `src/services/checkoutService.js` and `src/services/order/adapters/lightspeedClient.js`
- **Severity:** Was HIGH; **revised: NO PRODUCTION IMPACT**
- **Status:** **RESOLVED — VERIFIED NO-OP** (2026-05-04)
- **Symptom (original concern):** Two copies of `fetchProductDetails` existed with different price fields. The dedup'd version uses `tax_inclusive`. Concern was that mobile may have relied on `tax_exclusive` and would now display the wrong price.
- **Verification (2026-05-04):**
  - `Bazaar-Mobile-App` `main` branch (commit `b5e76a3`) was inspected. Every price-display call site reads `priceStandard.taxInclusive` (`flash_sale_widget.dart:39`, `product_detail_screen.dart:749`, `similar_products_widget.dart:65,70`, `products_card.dart:284`, `product_details_controller.dart:43`). **Zero** `.taxExclusive` reads in any UI or controller. The model parses both fields from JSON but never reads `.taxExclusive`.
  - The dedup'd `fetchProductDetails` is used **only by post-checkout inventory diagnostic helpers** (`order/shared/quantities.js`, `checkout/shared/inventory.js`). It does **not** populate the canonical `Product.price` document that clients read.
  - The canonical product price visible to all clients comes from `src/services/product/sync/domain/lightspeedFetchers.js`, which has always used `tax_inclusive` (lines 108, 121, 277, 295, 384).
  - Stripe/Tabby/Nomod checkout amounts are computed from cart-line prices the client already saw — not from `fetchProductDetails`.
- **Outcome:** The dedupe is byte-equivalent for every user-facing flow. The only behavior that genuinely changed is which value appears in an internal "inventory updated" admin email — cosmetic, internal-only.
- **Source:** PR-MOD-3 dedup analysis; verified against `Bazaar-Mobile-App` `main` 2026-05-04.

### BUG-029 — updateQuantityMail admin email resolution divergence: dynamic (checkout) vs static env var (order/mobile)
- **Files:** `src/services/checkoutService.js` and `src/services/order/shared/quantities.js`
- **Severity:** MEDIUM
- **Status:** OPEN
- **Symptom:** Two copies of `updateQuantityMail` with different admin email resolution:
  - `checkoutService.js` calls `getAdminEmail()` (dynamic DB lookup) and includes a logo `<img>` tag
  - `order/shared/quantities.js` reads `process.env.ADMIN_EMAIL` directly (static) and has no logo
  These functions are NOT merged into shared/ because they serve different platforms and have meaningfully different behaviour.
- **Impact:** Mobile inventory-update emails have no logo and use a static email address that may diverge from the DB-stored admin email. If the admin email is changed in the DB but not in the env var, mobile emails go to the old address.
- **Recommended fix:** Migrate `order/shared/quantities.js::updateQuantityMail` to also use `getAdminEmail()` from `src/utilities/emailHelper.js`. Add the logo img tag for consistency.
- **Source:** PR-MOD-3 dedup analysis.

### BUG-027 — 150+ v1 backend routes have no client caller (UNUSED)
- **Severity:** MEDIUM (cleanup)
- **Backend file:** various, see `docs/api-map/MAP.md` UNUSED rows
- **Client(s) affected:** none
- **Status:** OPEN
- **Symptom:** 146 (method, path) backend rows have zero matching client calls. Many are admin endpoints whose dashboard counterpart was removed; some are obsolete v1 mobile endpoints; some are the v2 BFF (separately tracked in BUG-026).
- **Impact:** Coverage debt; dead-code surface area; security review burden.
- **Recommended fix:** Audit `docs/api-map/MAP.md` UNUSED list. For each, classify: keep (admin tool), deprecate (warn for one release), or delete. Land in a follow-up "v1 dead route reaper" PR.
- **Source:** PR14 audit summary.

---

### BUG-031 — Global errorHandler case #8 maps err.status to code `'ERROR'` instead of semantic codes
- **Severity:** MEDIUM (observability, client code correctness)
- **File:** `src/middleware/errorHandler.js` line 108–115 (case #8: legacy plain-object throws)
- **Status:** **FIXED** (feat/v2-api-unification)
- **Symptom:** When a service layer throws `{ status: 404, message: '...' }` and the error reaches the global `errorHandler` without being converted to a `DomainError`, case #8 emits `{ error: { code: 'ERROR', ... } }` instead of `{ error: { code: 'NOT_FOUND', ... } }`. The v2 `_shared/errors.js::handleError` helper and the new `toDomainError` function both do the correct HTTP→code mapping; the global handler does not.
- **Impact:** Any future controller that lets a plain-object service error reach `next(err)` (e.g. via `asyncHandler` without a `toDomainError` bridge) will emit `code: 'ERROR'` for 4xx errors instead of the semantic code clients expect. The current migration works around this with `toDomainError`, but the root cause in errorHandler remains.
- **Recommended fix:** In errorHandler case #8, apply the same `HTTP_CODE_MAP` lookup that `handleError` uses: `code = HTTP_CODE_MAP[err.status] || 'ERROR'`. One-line change, low risk.
- **Source:** PR15 asyncHandler migration — discovered while ensuring contract test error codes matched after migrating v2 controllers.

### BUG-032 — `mobile/productController.js::addReview` uses `console.error` instead of logger
- **Severity:** LOW (observability)
- **File:** `src/controllers/mobile/productController.js` (addReview and categoryImages handlers)
- **Status:** **FIXED** (feat/v2-api-unification)
- **Symptom:** Two catch blocks call `console.error(error)` instead of `logger.error(...)`. In production, this bypasses the structured JSON logging pipeline.
- **Impact:** Errors in review submission and category image upload are invisible in log aggregators.
- **Recommended fix:** Replace `console.error(error)` with `logger.error({ err: error }, 'Error in addReview:')` (and similarly for `categoryImages`).
- **Source:** PR15 code audit during asyncHandler migration.

### BUG-033 — Widespread `console.error` usage in mobile and ecommerce controllers bypasses structured logging
- **Severity:** LOW (observability)
- **Files:** `src/controllers/mobile/authController.js` (3 calls), `src/controllers/mobile/orderController.js` (3 calls), `src/controllers/mobile/smartCategoriesController.js` (4 calls), `src/controllers/ecommerce/adminController.js` (2 calls), `src/controllers/ecommerce/publicController.js` (7 calls), `src/controllers/ecommerce/smartCategoriesController.js` (4 calls), `src/controllers/ecommerce/userController.js` (7 calls)
- **Status:** **FIXED** (feat/v2-api-unification)
- **Symptom:** 30 `console.error(...)` calls scattered across mobile and ecommerce controllers bypassed the structured pino logger. Errors were invisible in log aggregators and structured log streams.
- **Fix applied:** All 30 occurrences replaced with `logger.error({ err: error }, 'descriptive message:')` matching the project-standard pino structured logging style.
- **Source:** PR15 sweep during errorHandler migration workstream.

---

### BUG-035 — Access token expiry inconsistency between login and refresh paths
- **Severity:** LOW (security hygiene / documentation gap)
- **Files:** `src/services/auth/use-cases/refresh.js`, `src/services/auth/use-cases/checkAccessToken.js`, `src/services/auth/domain/tokenIssuer.js`
- **Status:** **DOCUMENTED** (feat/v2-api-unification)
- **Symptom:** `refresh.js` issues new access tokens with `expiresIn: '2m'` (2 minutes). `checkAccessToken.js` and `tokenIssuer.js` use `'1h'`. The two paths intentionally produce tokens with different lifetimes.
- **Resolution:** The `'2m'` value on the refresh path is treated as intentional security behaviour — short-lived access tokens after rotation reduce blast-radius of leaked tokens. Both expiries are now surfaced as named config knobs in `src/config/runtime.js`:
  - `auth.accessTokenExpiry` (default `'1h'`) — controlled by `JWT_ACCESS_EXPIRY`
  - `auth.accessTokenRefreshExpiry` (default `'2m'`) — controlled by `JWT_ACCESS_REFRESH_EXPIRY`
  Both are documented in `.env.example`. If the short refresh expiry is found to be a bug, set `JWT_ACCESS_REFRESH_EXPIRY=1h` via env to align without a code change.
- **Source:** Magic-numbers audit (feat/v2-api-unification).

### BUG-036 — INVENTORY_CONCURRENCY = 5 duplicated across three independent files
- **Severity:** LOW (maintenance)
- **Files:** `src/services/order/shared/quantities.js`, `src/services/order/use-cases/validateInventoryBeforeCheckout.js`, `src/services/product/sync/domain/lightspeedFetchers.js`
- **Status:** **FIXED** (feat/v2-api-unification)
- **Symptom:** Each file independently defines `const INVENTORY_CONCURRENCY = 5`. If ops needs to tune concurrency (e.g., to reduce Lightspeed API rate-limit pressure), all three must be changed in sync.
- **Impact:** Low — all three happen to agree on 5. Risk is drift if one is changed during a future refactor.
- **Recommended fix:** Consolidate into `src/config/constants/business.js` as `INVENTORY_CONCURRENCY = 5` and import from there.
- **Source:** Magic-numbers audit (feat/v2-api-unification).

### BUG-037 — scripts/updateProductsNew.js has its own MAX_DISCOUNT_TTL independent of helpers/productDiscountSync.js
- **Severity:** LOW (config drift)
- **Files:** `src/scripts/updateProductsNew.js`, `src/helpers/productDiscountSync.js`
- **Status:** **FIXED** (feat/v2-api-unification)
- **Symptom:** The nightly product-update script (`updateProductsNew.js`) defines its own `MAX_DISCOUNT_TTL = 60 * 60 * 6` separately from `productDiscountSync.js`. Both resolved to the same value (21600 s) during this audit, so they agree today.
- **Impact:** If `CACHE_TTL_MAX_DISCOUNT` is changed via env, the script does not pick it up — it always uses its hardcoded 6-hour value. The runtime cache will expire at the configured TTL while the script re-populates it at 6 hours.
- **Recommended fix:** In `updateProductsNew.js`, replace `MAX_DISCOUNT_TTL = 60 * 60 * 6` with `require('../config/runtime').cache.maxDiscountTtl`.
- **Source:** Magic-numbers audit (feat/v2-api-unification).

### BUG-038 — PENDING_PAYMENT_EXPIRY_MINUTES env var is misleading (Mongo TTL index gotcha)
- **Severity:** LOW (operational footgun)
- **Files:** `src/config/runtime.js`, `src/models/PendingPayment.js`, `.env.example`
- **Status:** OPEN
- **Symptom:** `PENDING_PAYMENT_EXPIRY_MINUTES` is exposed as a tunable env var, but Mongoose TTL indexes are baked into MongoDB at index-creation time (`expireAfterSeconds: 1800`). Changing the env var changes only what `runtime.js` returns; the live Mongo TTL index is unchanged.
- **Impact:** Setting `PENDING_PAYMENT_EXPIRY_MINUTES=60` does NOT extend pending-payment lifetime. Mongo continues to delete docs after 30 minutes regardless. Ops would need to drop and recreate the index.
- **Recommended fix:** Either (a) demote to a constant in `src/config/constants/business.js` with a clear comment that it must match the Mongoose `expireAfterSeconds`, OR (b) add a startup script that reconciles the index TTL with the env value via `db.collection('pendingpayments').dropIndex(...)` + recreate.
- **Source:** Magic-numbers env-vs-constant evaluation (2026-05-04).

### BUG-039 — Mobile checkAccessToken response-shape mismatch (pre-existing, not a v2-unification regression)
- **Severity:** MEDIUM (silent logout)
- **Files:** `Bazaar-Mobile-App/lib/data/services/api_service.dart:126-145`, `bazaar-backend/src/services/auth/use-cases/checkAccessToken.js:16,45-50`
- **Status:** OPEN (pre-existing; surfaced by login-flow audit)
- **Symptom:** Mobile expects `accessToken` in every `check-access-token` response. Backend returns `{ valid: true, message, userId }` when the token is still valid; only includes `accessToken` on the refresh branch.
- **Impact:** Any spurious 401 retry that revalidates a still-good token gets misread by the mobile client as a failure → user is logged out unnecessarily. Behavior is identical on `main`, so this is NOT a regression introduced by the v2-unification branch.
- **Recommended fix (backend):** Always include `accessToken` in the response (echo current token when still valid). One-line fix in `checkAccessToken.js:16`.
- **Recommended fix (mobile):** Treat `valid: true` as success regardless of `accessToken` presence.
- **Source:** Login-flow audit (2026-05-04, docs/LOGIN-AUDIT.md).

### BUG-040 — Google OAuth requires three client IDs; missing any breaks one platform silently
- **Severity:** MEDIUM (deploy-time configuration risk)
- **Files:** `src/services/auth/adapters/googleVerifier.js:27-44`, `.env.example`
- **Status:** OPEN (operational checklist item)
- **Symptom:** `googleVerifier` switches the audience by User-Agent: Android UA → `ANDROID_GOOGLE_CLIENT_ID`, iOS UA → `IOS_GOOGLE_CLIENT_ID`, web → `GOOGLE_CLIENT_ID`. Mobile sets the UA correctly. If any of the three env vars is unset in production, that platform's Google login fails with an opaque "Invalid token" error.
- **Impact:** Silent failure for one platform if env is incomplete. Hard to diagnose because the other platforms continue working.
- **Recommended fix:** Add all three to the `validateEnv.js` REQUIRED list (or at least flag them as "required for Google OAuth" in the warning section). Pre-deploy checklist must verify all three are populated.
- **Source:** Login-flow audit (2026-05-04).

### BUG-041 — Mobile coupon validation gates on missing `success` key
- **Severity:** MEDIUM (customer-visible — coupons unusable on mobile)
- **Files:** `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart:1097-1117`, `bazaar-backend/src/services/coupon/use-cases/checkCouponCode.js:45,51,77-83`
- **Status:** OPEN (pre-existing; surfaced by critical-flows audit)
- **Symptom:** Mobile `applyCoupon` calls `POST /api/check-coupon` and branches on `data['success'] == true`. Backend response is `{ message, type, discountPercent, capAED?, bankPromoId? }` with **no `success` field** on the 200 path; `success` is implicit via HTTP status. Every valid coupon therefore fails the `success == true` check and shows a generic error toast; `isDiscountApplied` is never set.
- **Impact:** Mobile users cannot apply any coupon (FIRST15, UAE10, bank promos). Web works because it gates on HTTP 200 instead of `data.success`.
- **Recommended fix (backend):** Add `success: true` to the return shape of `checkCouponCode` in `src/services/coupon/use-cases/checkCouponCode.js:45,51,77`. Cheapest, cross-client safe.
- **Recommended fix (mobile):** Branch on HTTP 2xx instead of `data['success']` in `applyCoupon`.
- **Source:** Critical-flows audit (2026-05-01, docs/CRITICAL-FLOWS-AUDIT.md, Flow 2).

### BUG-042 — Cart mutation endpoints omit gift-logic enrichment fields
- **Severity:** LOW (transient UI flicker)
- **Files:** `bazaar-backend/src/services/cart/use-cases/modifyCart.js:83,106,126,154,178`, `bazaar-backend/src/services/cart/use-cases/getCart.js:48-55,87-93`, `Bazaar-Mobile-App/lib/data/models/cart_response.dart:91-115`
- **Status:** OPEN
- **Symptom:** `getCart` (with `includeGiftLogic: true`) enriches each cart line with `category_id`, `category_name`, `price`, `isGiftWithPurchase`. `modifyCart` use-cases (`addToCart` / `increaseQty` / `decreaseQty` / `removeFromCart`) return raw `cart.items` from the Mongoose schema with none of those fields.
- **Impact:** Mobile UI consuming `addToCart` / `increase` / `decrease` responses transiently sees nulls for category and `isGiftWithPurchase` until the next full `get-cart` refresh. Null-tolerant on mobile today, but latent if either client begins gating on these fields.
- **Recommended fix:** Have `modifyCart` use-cases return the same enrichment as `getCart({ includeGiftLogic: true })` — extract a shared `enrichCartItems(cart, options)` helper in `services/cart/domain/`.
- **Source:** Critical-flows audit (2026-05-01).

### BUG-043 — Per-item price precision drifts between web (rounded) and mobile (raw double)
- **Severity:** LOW (latent; AED-only catalogue today)
- **Files:** `bazaar-web/src/components/Checkout/Checkout.jsx:616,686,747`, `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart:489,628`, `bazaar-backend/src/services/checkout/use-cases/createStripeCheckout.js:49,73,85`
- **Status:** OPEN
- **Symptom:** Web sends `price: Math.round(item.variantPrice)` for every cart line on the checkout payload. Mobile sends `double.tryParse(product.variantPrice ?? '0')`. Backend `createStripeCheckout` then does its own `Math.round(Number(item.price) * 100)` for cents.
- **Impact:** For non-integer AED prices, web orders charge integer AED while mobile orders charge full precision — same SKU, different totals across platforms. Currently no fractional-AED prices in the catalogue, but this becomes a real-money divergence the day fractional pricing is enabled or a non-AED currency is added.
- **Recommended fix:** Consolidate price rounding on the backend; never trust client `price`. Either (a) re-derive unit price server-side from the cart in DB, or (b) pin client behavior to send raw `Number(variantPrice)` and let backend do all rounding.
- **Source:** Critical-flows audit (2026-05-01).

### BUG-044 — Mobile reads `data['freeShipping']` from /api/shipping-cost which backend never emits
- **Severity:** LOW (drift; fallback covers it)
- **Files:** `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart:265`, `bazaar-backend/src/services/shipping/use-cases/calculateShippingCost.js:14-22,46-52`
- **Status:** OPEN (pre-existing)
- **Symptom:** Mobile sets `isFreeShippingEligible.value = data['freeShipping'] == true`. Backend response is `{ shippingCost, ratePerKm, baseRate, freeShippingThreshold, currency }` — no `freeShipping` boolean.
- **Impact:** `isFreeShippingEligible` is always false on mobile. Mobile compensates because the same response includes `freeShippingThreshold`, which mobile compares against `discountedProductsTotal` to decide free shipping locally (`shippingCost` getter). Two-source-of-truth risk: when backend decides free shipping for a region not driven by threshold (e.g. promo code), mobile won't render it as free.
- **Recommended fix:** Either backend adds `freeShipping: bool` to the response (single line in `calculateShippingCost.js`), or mobile drops the `freeShipping` read and trusts `shippingCost === 0`.
- **Source:** Critical-flows audit (2026-05-01).

### BUG-045 — Mobile bypasses backend Stripe init and ships Stripe secret key in `.env`
- **Severity:** HIGH (security — Stripe best-practice violation; pre-existing)
- **Files:** `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart:44,710-810`, `bazaar-backend/src/routes/mobile/orderRoutes.js:11`, `bazaar-backend/src/controllers/mobile/orderController.js:168-184`
- **Status:** OPEN (pre-existing; surfaced by critical-flows audit)
- **Symptom:** Mobile imports `STRIPE_SECRET_KEY` via `dotenv.env['STRIPE_SECRET_KEY']` and calls `https://api.stripe.com/v1/customers`, `/v1/ephemeral_keys`, and `/v1/payment_intents` directly. Backend exposes `/api/order/stripe/init` which is intended for this exact purpose and is never invoked.
- **Impact:** Stripe explicitly forbids client-side use of secret keys. Anyone reverse-engineering the mobile app gets full Stripe API write access (refund any charge, list any customer, create payments). PCI / Stripe compliance issue regardless of the v2 unification work.
- **Recommended fix:** Mobile must call `POST /api/order/stripe/init` for PaymentIntent creation and remove `STRIPE_SECRET_KEY` from the mobile bundle. Rotate the existing key after the change ships.
- **Source:** Critical-flows audit (2026-05-01).

### BUG-046 — iOS Google login resolves to wrong audience (web client ID instead of iOS)
- **Severity:** MEDIUM (auth correctness; pre-existing)
- **Files:** `src/services/auth/adapters/googleVerifier.js:39`, `src/controllers/mobile/authController.js:67-81`
- **Status:** OPEN (pre-existing; surfaced 2026-05-04 during OAuth flow verification)
- **Symptom:** Mobile sends `User-Agent: "ios"` (literal three-letter string) for iOS clients (`Bazaar-Mobile-App/lib/controllers/auth_controller.dart:875`). The mobile controller forwards `userAgent` but does NOT pass `platform: 'mobile'`. The verifier's `resolveClient` falls into the UA-substring branch which checks `ua.includes('iphone') || ua.includes('ipad')` — neither matches the literal `"ios"`. iOS tokens are therefore verified against `GOOGLE_CLIENT_ID` (web audience), not `IOS_GOOGLE_CLIENT_ID`.
- **Impact:** If `GOOGLE_CLIENT_ID !== IOS_GOOGLE_CLIENT_ID` in production, iOS Google login fails with "Invalid token audience". If they happen to be the same value (currently unconfirmed), the bug is invisible.
- **Note:** Pre-existing — the same logic existed in `authService.js` before PR-MOD-6 (the verifier was extracted verbatim). NOT a regression from this branch.
- **Recommended fix (one line):** In `mobile/authController.js:75`, add `platform: 'mobile'` to the `authService.googleLogin({ ... })` call. The `if (platform === 'mobile')` branch in `resolveClient` then handles `userAgent === 'ios'` correctly. Apple already does this — match the pattern.
- **Alternative fix:** In `googleVerifier.js:39`, change `ua.includes('iphone') || ua.includes('ipad')` to `ua === 'ios' || ua.includes('iphone') || ua.includes('ipad')`. Less clean but no controller change.
- **Source:** OAuth flow verification (2026-05-04).

### BUG-052 — MIN_SUPPORTED_MOBILE_VERSION env var exists but is never enforced
- **Severity:** HIGH (safety valve is non-functional)
- **Files:** `.env.example`, `src/routes/mobile/configRoutes.js:10`, **no middleware exists**
- **Status:** OPEN
- **Symptom:** `MIN_SUPPORTED_MOBILE_VERSION=1.0.35` is set in `.env.example` and exposed via `/api/mobile/config`. However, **no backend middleware compares an incoming `X-App-Version` header against this value**. The env var is purely informational — it's echoed back to clients via the config endpoint and used in admin activity log displays, but it never blocks a request.
- **Impact:** The safety-valve mechanism for forcing old mobile app versions to update doesn't exist. Any breaking change to a v1 endpoint (or an inadvertent shape drift) will silently affect every previously-released app version, with no force-update prompt. Tens of thousands of users on stale versions could get logged out / shown broken UI / fail to checkout, with no graceful degradation path.
- **Recommended fix:** Add `src/middleware/versionGate.js` that runs early in the request pipeline, reads `X-App-Version` header (if present), and returns `426 Upgrade Required` when `clientVersion < MIN_SUPPORTED_MOBILE_VERSION`. Skip when header is absent (web/admin). Add a `MIN_SUPPORTED_MOBILE_VERSION_ENFORCE=false` flag for staged rollout.
- **Source:** Mobile-version-compatibility audit (2026-05-04).

### BUG-053 — Mobile app does not send X-App-Version header and does not consume /api/mobile/config
- **Severity:** HIGH (companion to BUG-052; blocks the version-gate from ever working)
- **Files:** `Bazaar-Mobile-App/lib/**` — no version-check code path exists
- **Status:** OPEN (mobile-side fix, tracked here for backend awareness)
- **Symptom:** A grep of `Bazaar-Mobile-App/lib/` for `minSupportedVersion`, `forceUpdate`, `package_info`, `in_app_update`, `upgrader`, `X-App-Version`, `versionGate` returned zero matches. The only `app_version` reference is a hardcoded string `"1.0.33"` in `lib/core/utils/payment_error_logger.dart:28` used in one error-log payload. Mobile does not call `/api/mobile/config` at startup, does not read its own version from `package_info_plus` or equivalent, does not send `X-App-Version` on any request, and has no force-update dialog.
- **Impact:** Even if the backend implements BUG-052's middleware, mobile clients will never trigger it. Backend must default to "skip when header absent" or all mobile traffic returns 426.
- **Recommended fix (mobile):** Add `package_info_plus` dependency. On app launch, call `/api/mobile/config`. If `appVersion < minSupportedVersion`, show non-dismissable update prompt with App Store / Play Store deep link. Add `X-App-Version: <currentVersion>` header to all backend requests (Dio interceptor or `ApiService` base headers).
- **Source:** Mobile-version-compatibility audit (2026-05-04).
