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
