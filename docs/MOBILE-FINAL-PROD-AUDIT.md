# Mobile Final Production Audit — pre-merge gate

- Backend: `feat/v2-api-unification` @ HEAD `9a162a2` (NOTE: prompt cited `04f4e0d` as commit-to-audit but local HEAD is `9a162a2`. The diff between them is three additive payment commits — all backwards-compatible: `b581096` add Stripe webhook, `4d2cb8e` make `/checkout-session-nomod` actually call Nomod, `9a162a2` only flag Nomod success when paid. See `git log 0296f0f..HEAD`.)
- Mobile: `Bazaar-Mobile-App` main @ `b5e76a3`.
- Prior audit reference: `docs/MOBILE-V1-BACKCOMPAT-AUDIT.md` (against backend `0296f0f`).
- Verdict: **SHIP**.

---

## Check 1 — Endpoint reachability

Mounted route bases (`src/server.js:365-374`): `/api/auth`, `/api/products`, `/api/wishlist`, `/api/cart`, `/api/order`, `/api/notification`, `/api` (coupons, public, banners), `/api/mobile`.

Re-confirmed all 41 reachable + 3 dead constants from prior audit. Net effective MISSING for live binaries: 0.

**New on this branch (verified):**
- `POST /api/order/create-tabby-session` — `src/routes/mobile/orderRoutes.js:16` → `orderController.createTabbySession` → `services/order/use-cases/createTabbySession.js`. Mobile call site: `tabby_payment_provider.dart:74` (ACTIVE — mobile calls this constant).
- `GET  /api/order/check-tabby-status`   — `orderRoutes.js:19` (alias of `verify-tabby-status`). Dead constant in mobile (not referenced).
- `GET  /api/order/verify-tabby-status`  — `orderRoutes.js:17`, used by mobile (`tabby_payment_provider.dart:245`).

**Verdict: SAFE.** No regressions. Confidence HIGH.

---

## Check 2 — Auth flow deep-dive

Routes (`src/routes/mobile/authRoutes.js:9-27`) all present: register, login, google-login, apple-login, forgot-password, verify-code, reset-password, refresh-token, check-access-token, recovery-account, resend-recovery-code, payment-history, customerId, delete-account, user/update.

**checkAccessToken (BUG-039)** — `src/services/auth/use-cases/checkAccessToken.js:24` echoes `accessToken: accessTokenValue` on the still-valid path, and `accessToken/refreshToken` on the refreshed path (lines 57-58). Mobile reads `data['accessToken']` at `api_service.dart:266`. Strict IMPROVEMENT: previously the still-valid path returned no `accessToken`, breaking mobile's refresh logic. New behaviour cannot regress old binaries because old behaviour was to never return `accessToken` on the success branch — mobile's `if (data['accessToken'] != null)` simply went false and treated as failure → forced re-login. Now it succeeds.

**Login response shape** — `mobileAuthController.js:50,86,143`: `{token, refreshToken, fcmToken, data, coupon, totalOrderCount, usedFirst15Coupon}`. Matches mobile reads in prior audit §2. Not changed by this branch in v1 paths.

**JWT secrets** — `src/services/auth/use-cases/checkAccessToken.js:47-48` signs with `JWT_SECRET` and `JWT_REFRESH_SECRET` (env-driven, identical to main). Tokens issued on `main` will continue to validate on this branch.

**Verdict: SAFE / IMPROVEMENT.** Confidence HIGH.

---

## Check 3 — Payment flow deep-dive

**Stripe** — `POST /api/order/checkout-session` (`orderRoutes.js:14`) and `POST /api/order/stripe/init` (`orderRoutes.js:11`) both mounted. Webhook `/api/webhooks/stripe` newly added (`server.js:152`) is additive — it does not alter the mobile-facing routes. SAFE.

**Tabby** — Mobile uses both `creatTabbySession` (`tabby_payment_provider.dart:74` → `/api/order/create-tabby-session`) and `createTabbyCheckoutSession` (`checkout_controller.dart:781` → `/api/order/checkout-session-tabby`). Both routes exist (`orderRoutes.js:15-16`). The new `create-tabby-session` is ACTIVELY used by mobile, not dormant. Verify-status uses `/api/order/verify-tabby-status` (`orderRoutes.js:17`) — present. SAFE.

**Nomod** — Mobile: `nomod_payment_provider.dart:70` POST `/api/order/checkout-session-nomod`; verify GET `/api/order/verify-nomod-payment?paymentId=...`. Both mounted (`orderRoutes.js:20-21`). Branch commits `4d2cb8e` + `9a162a2` are functional improvements: now actually calls Nomod and only flags `success: true` when payment status is `paid` (`orderController.js:148-150`). Mobile already reads `success` to decide order creation — strict IMPROVEMENT (prior version could falsely succeed). Confidence HIGH.

**Verdict: SAFE / IMPROVEMENT.**

---

## Check 4 — Cart + checkout shape parity

- `GET /api/cart/get-cart` — backend returns `{success, ...result}` carrying `cart, promoMessage, giftAdded`. Mobile decodes via `CartResponseModel.fromJson` (`cart_controller.dart:80-83`). PASS.
- `POST /add-to-cart, /remove-to-cart, /increase, /decrease` — all routed (`cartRoutes.js:7-10`). Responses include `success` + `message`. PASS.
- `POST /api/check-coupon` (BUG-041) — `couponsRoutes.js:11` → `checkCouponCode` → returns `{success: true, ...}` on success and `{success: false, message}` on failure (`mobileAuthController.js:519-552`). Strict IMPROVEMENT for mobile.
- `POST /api/order/validate-inventory` — `orderRoutes.js:13`. PASS.
- BUG-056 (cart populates items) was a web-only fix; mobile cart shape (`cartItems[]` with nested `product` object) is unchanged. Verified `cart_controller.dart` reads same fields. SAFE.

**Verdict: SAFE / IMPROVEMENT.** Confidence HIGH.

---

## Check 5 — Refresh token interceptor end-to-end

**CRITICAL FINDING ABOUT THE PROMPT:** The prompt's Check 5 describes mobile posting to `/api/auth/refresh-token`. This is **incorrect**. Mobile's actual refresh interceptor at `api_service.dart:237-282` posts to `ApiEndpoints.checkAccessToken` = `/api/auth/check-access-token` with both `Authorization` and `Authorization-Refresh` headers. The `/api/auth/refresh-token` endpoint also exists (`authRoutes.js:16`) but is not used by the mobile binary on `b5e76a3`.

Verified the actual chain:

1. Mobile request gets 401 → `_retryRequest` calls `_refreshTokenImpl` (`api_service.dart:332-345`).
2. `_refreshTokenImpl` POSTs `/api/auth/check-access-token` with `Authorization: Bearer <access>` + `Authorization-Refresh: Bearer <refresh>` (lines 249-260).
3. Backend `mobileAuthController.checkAccessToken` (`mobileAuthController.js:258-274`) calls `authService.checkAccessToken(accessToken, refreshToken)`.
4. Service (`services/auth/use-cases/checkAccessToken.js`):
   - If access token is valid → returns `{accessToken: accessTokenValue}` (line 24).
   - If access expired → verifies refresh, rotates session, returns `{accessToken, refreshToken}` (lines 57-58).
5. Mobile reads `data['accessToken']` (line 266) → success.

**JWT secret continuity:** Service signs with `process.env.JWT_SECRET` / `JWT_REFRESH_SECRET`; main signs with the same env vars. Existing tokens issued by main will validate after deploy.

**Refresh expiry:** `runtime.auth.refreshTokenExpiry` defaults to `'7d'` (`src/config/runtime.js:137`) — matches main's hardcoded `'7d'`. Existing refresh tokens do not suddenly expire.

**Verdict: SAFE / IMPROVEMENT.** Confidence HIGH for the actual `check-access-token` path. The unused `/api/auth/refresh-token` route also exists and returns `{accessToken, refreshToken}` (`mobileAuthController.js:251`), so a future mobile build switching to it is safe too.

---

## Check 6 — Cross-cutting

- **Cookie compatibility:** mobile uses Bearer tokens only. `grep cookie/Cookie lib/` returns only privacy-policy text, no runtime cookie code. SAFE.
- **Header expectations:** mobile sends `X-Client: mobile` and `X-App-Version: <pkginfo>` (`api_service.dart:115-116, 302-303`); does **not** send `User-Agent: 'android'/'ios'` from app code (default http client UA). Backend's google/apple verifiers do not depend on UA — they use the explicit `platform` field passed in body. Reconfirmed. SAFE.
- **Version gate:** `src/middleware/versionGate.js:53-55` — `if (!clientVersion) return next()` bypasses cleanly. Mobile main DOES send `X-App-Version` (so this header is present), and even when too old the gate is in **non-enforce** mode by default (`enforceMinVersion`), which only logs (line 80). SAFE.

**Verdict: SAFE.** Confidence HIGH.

---

## Top risks

None classified BLOCKING or DEGRADED.

The single most consequential change is the Nomod success-flag fix (`9a162a2`): it tightens previously over-permissive behaviour. Strictly safer for users (no orders created on unpaid Nomod sessions) but worth monitoring post-deploy in case any flow was relying on the old loose behaviour. No mobile call site depends on `success: true` for non-paid statuses — verified in `nomod_payment_provider.dart`.

---

## Final recommendation: **SHIP**

| Check | Verdict | Confidence |
|---|---|---|
| 1 Endpoint reachability | SAFE | HIGH |
| 2 Auth flow | SAFE / IMPROVEMENT | HIGH |
| 3 Payment flow | SAFE / IMPROVEMENT | HIGH |
| 4 Cart + checkout | SAFE / IMPROVEMENT | HIGH |
| 5 Refresh interceptor | SAFE / IMPROVEMENT | HIGH |
| 6 Cross-cutting (cookies/headers/version-gate) | SAFE | HIGH |

No BLOCKING or DEGRADED issues found. The branch contains strict improvements (BUG-039, BUG-041, Nomod-success-only-when-paid) that benefit existing mobile binaries without changing any field name or required input.

Recommend post-deploy monitoring for 24h on: (a) `/api/auth/check-access-token` 200 rate, (b) `/api/order/checkout-session-nomod` success rate (expected to drop slightly as fake-success is removed), (c) `/api/order/create-tabby-session` traffic (now actively used by mobile).
