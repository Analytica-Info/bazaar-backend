# v1 Backward-Compatibility Final Audit

Date: 2026-05-05
Branch: feat/v2-api-unification @ 58d2592
Scope: web (`bazaar-web` main), admin (`Bazaar-Admin-Dashboard` main), mobile (`Bazaar-Mobile-App` main `b5e76a3`)

## Verdict: SHIP-WITH-WARNINGS

Backward-compatibility against v1 endpoints is intact across all three clients: every v1 path the clients call is still mounted and the response shapes match. The Tier-1 fixes (BUG-003/004/039/041) are strict improvements to clients. **However, one cross-cutting issue affects net-new web sessions on this branch when `V2_ENABLED=true`:** the v2 BFF dispatcher (`src/middleware/platform.js`) requires either an `X-Client` header, a `user_token` cookie, or an `Authorization: Bearer` to route. `bazaar-web` (`src/axiosInstance.js:7`) sends none of these on a brand-new browser context, so the very first call from a logged-out user — `POST /v2/auth/login`, `/v2/auth/register`, `/v2/auth/forgot-password`, `/v2/auth/google-login`, `/v2/auth/apple-login` — returns `400 UNKNOWN_PLATFORM` instead of dispatching to `webRouter`. Existing returning users who still hold the `user_token` cookie are unaffected (cookie satisfies the platform check). This is the single conditional risk and the reason for SHIP-WITH-WARNINGS.

## Per-client summary

### Web (`bazaar-web` main)
- Total distinct paths called: **62** (35 v1 + 27 v2)
- v1 reachability: **PASS** — all 35 v1 paths verified mounted on this branch (see `docs/V2-MIGRATION-GAPS-VERIFICATION.md`).
- v2 reachability: PASS for authenticated requests; **CONDITIONAL FAIL** for unauthenticated v2 auth endpoints called without `X-Client` or `user_token` cookie (see Cross-cutting concerns below).
- DRIFT-RESPONSE: 0 (web wraps v2 envelope via `bazaar-web/src/axiosInstance.js:31-42` `unwrapV2`; matches backend `responseEnvelope.js`).
- DRIFT-REQUEST: 0
- DRIFT-STATUS: 0 (web's `shouldRedirectOnAuthError` at `src/axiosInstance.js:59-65` still expects 401/402, which v2 produces).
- Top-25 deep audit: PASS modulo the cross-cutting platform-header gating issue.

### Admin (`Bazaar-Admin-Dashboard` main)
- Total distinct paths: **48** — fully enumerated, no top-N filter.
- All paths v1 (no v2 calls). Categorisation:
  - `/admin/*` (login, admins, roles, permissions, users, orders, analytics, monitoring, logs, notifications, email-config, shipping-countries (incl. cities/areas/bulk), bank-promo-codes, products/gift) — backend `src/routes/ecommerce/adminRoutes.js`, `roleRoutes.js`, `permissionRoutes.js`, `emailRoutes.js` mounted at `/admin` in `src/server.js:342-345` — PASS.
  - CMS POST endpoints (`/about-cms`, `/offers-cms`, `/categoriesImages-cms`, `/brandsLogo-cms`, `/contact-cms`, `/footerInfo-cms`, `/shop-cms`, `/offerFilter-cms`, plus features, slider, header-info, coupon-form via `/create-coupon`) — verified mounted on `src/routes/ecommerce/publicRoutes.js` per `V2-MIGRATION-GAPS-VERIFICATION.md` — PASS.
  - Newsletter `/body-images-upload`, `/delete-body-images-upload`, `/export-products-to-sheet`, `/fetch-db-products`, `/get-coupon-count`, `/get-cms-data` — mounted via public/admin routers — PASS.
- REACHABLE: 48 | MISSING: 0 | DRIFT-RESPONSE: 0 | DRIFT-REQUEST: 0 | DRIFT-STATUS: 0.
- Auth pattern: every admin call passes `Authorization: Bearer <token>` from `localStorage` via `authHeaders()` — unaffected by v2 platform middleware (admin never touches `/v2/*`).

### Mobile (`Bazaar-Mobile-App` main `b5e76a3`)
- Spot-check vs `docs/MOBILE-V1-BACKCOMPAT-AUDIT.md` baseline (2026-05-04 / commit `0516b5b`): **still SHIP**.
- Backend changes since 0516b5b in mobile-touched files: only the Tier-1 BUG-039 fix (`src/services/auth/use-cases/checkAccessToken.js`) and BUG-041 fix (`src/services/coupon/use-cases/checkCouponCode.js`). Both are strict improvements (see Tier-1 section).
- Top-5 endpoints rechecked (cart get/add, checkout stripe/tabby, login, refresh-token, get-orders): no shape changes since baseline.
- Mobile sends `Authorization: Bearer …` — platform middleware routes correctly to mobile BFF.

## Tier-1 fixes — client-side impact

### BUG-003 — `tabbyWebhook` `req.user?._id` (`src/controllers/ecommerce/publicController.js:~857`)
**INVISIBLE.** Tabby webhook is server-to-server (no client). Defensive optional-chaining only. No client repo references it.

### BUG-004 — `verifyTabbyPayment` `req.user?._id` (`src/controllers/ecommerce/publicController.js:~792`)
**IMPROVEMENT.** Web calls `POST /verify-tabby-payment` from `bazaar-web/src/components/SuccessPage.jsx:74`. Mobile calls equivalent v1 path via order checkout flow. Both previously could 500 if user cookie expired between checkout and verify; now returns proper auth response. No regression — clients only read `success`/`message`.

### BUG-039 — `checkAccessToken` returns `accessToken` (`src/services/auth/use-cases/checkAccessToken.js:16,45-50`)
**IMPROVEMENT.** Mobile reads `response.data.accessToken` at `Bazaar-Mobile-App/lib/data/services/api_service.dart:126-145`. Pre-fix, backend omitted the field on success → mobile silently logged users out. Post-fix, field is present. Strict improvement for mobile binaries already shipped to TestFlight (1.0.34/35 per commit `b5e76a3`). No web/admin caller of this path.

### BUG-041 — `checkCouponCode` returns `success: true` (`src/services/coupon/use-cases/checkCouponCode.js:45,51,77-83`)
**IMPROVEMENT.** Mobile gates on `data['success'] == true` at `Bazaar-Mobile-App/lib/controllers/checkout_controller.dart:1097-1117`. Pre-fix the field was missing. Web checks via different shape (`/check-coupon` v1, returns `{ valid, ... }` — confirmed at `bazaar-web/src/components/Checkout/Checkout.jsx:511`) and is unaffected. Strict improvement for mobile.

## Cross-cutting concerns

- **Cookies: PASS.** Web `axiosInstance.create({ withCredentials: true })` (`src/axiosInstance.js:7`). Backend issues `user_token` cookie via existing v1 issuer paths and v2 web auth controller. Domain/Path unchanged from main. Sticky cookies from prior sessions remain valid (token contents unchanged) — returning users will route correctly via cookie-presence detection in `src/middleware/platform.js:17`.
- **CORS: PASS contingent on env.** `src/server.js:150-173` allowlists from `ALLOWED_ORIGINS`. Falls back to open CORS with a warn log if unset. Operations must ensure prod `ALLOWED_ORIGINS` includes the bazaar-web origin and the admin origin.
- **Auth headers: PASS.** Mobile uses `Authorization: Bearer …` (matches `authV2.js:26-27` cookie path AND bearer fallback). Admin uses bearer (untouched by v2 middleware). Web uses cookie auth (matches v2 cookie path).
- **Rate limit shapes: PASS.** Auth rate-limiter mounts at `src/server.js:114-137` — unchanged on this branch versus client expectations. Web's `shouldRedirectOnAuthError` only acts on 401/402 (`src/axiosInstance.js:62`), so 429 from rate limiter does not trigger forced logout.
- **Platform-header gating on unauthenticated v2 web calls: WARN.** Platform middleware at `src/middleware/platform.js` returns `400 UNKNOWN_PLATFORM` when none of `X-Client` header / `user_token` cookie / `Authorization: Bearer` is present. Web's `axiosInstance` (`bazaar-web/src/axiosInstance.js`) sends none of these on a fresh-browser unauthenticated session. Affected paths: `POST /v2/auth/login`, `/v2/auth/register`, `/v2/auth/forgot-password`, `/v2/auth/verify-code`, `/v2/auth/reset-password`, `/v2/auth/google-login`, `/v2/auth/apple-login`, `/v2/auth/recovery-account`, `/v2/auth/resend-recovery-code`. Returning users with `user_token` cookie are unaffected. Confirmed by tests/v2/router.test.js:142 ("unknown platform returns 400").

## Risks / open items

- **DEGRADED (not BLOCKING-but-close):** New / cookie-cleared web users hitting `/v2/auth/*` will receive `400 { success:false, error:{ code:"UNKNOWN_PLATFORM" } }`. Web's UI surface does handle the error (login form shows error message, no forced redirect because endpoint is in `NO_REDIRECT_ENDPOINTS` at `bazaar-web/src/axiosInstance.js:16`), but login completion is impossible until either:
  - Backend: relax `platform.js` to default `req.platform = 'web'` when path begins with `/v2/auth/` and there's no auth signal at all (smallest safe fix), OR
  - Web: set a default `X-Client: web` header in `axiosInstance` (smallest safe fix on the client side, but forces a web release) OR ship a non-HttpOnly bootstrap cookie.
- No other BLOCKING items. v1 reachability is fully preserved per `V2-MIGRATION-GAPS-VERIFICATION.md` (35/35) and `MOBILE-V1-BACKCOMPAT-AUDIT.md` (top-15).

## Recommendation

**SHIP-WITH-WARNINGS** — gated on one of two pre-deploy actions:

1. **Preferred (single PR, backend-only, no client release needed):** Patch `src/middleware/platform.js` so that an unmatched request whose `Origin` is in `ALLOWED_ORIGINS` defaults to `req.platform = 'web'` (or an even simpler rule: default to `'web'` for any request without a `Bearer` token, since web is the only cookie-or-cookieless surface). This preserves the explicit `X-Client: mobile` contract and unblocks new web users without a client redeploy.
2. **Alternative (both repos, coordinated):** Add `headers: { 'X-Client': 'web' }` to `bazaar-web/src/axiosInstance.js:7` and ship a web release alongside the backend deploy.

Without one of these two changes, deploying this branch with `V2_ENABLED=true` will break login for all logged-out / new-browser web users. Existing returning users (with cookie) will continue to work, which is why this is a degraded-but-not-fully-broken state.

Confidence levels:
- **Web: MEDIUM-HIGH.** v1 reachability fully verified (35/35); v2 reachability fully verified for cookie-authenticated requests; one platform-header gating edge case identified above. Unwrap interceptor confirmed compatible with v2 envelope.
- **Admin: HIGH.** 48 distinct paths enumerated; all v1; no v2 dependence; auth pattern (bearer in localStorage) is independent of platform middleware. Zero drift surfaces detected.
- **Mobile: HIGH.** Existing `MOBILE-V1-BACKCOMPAT-AUDIT.md` baseline still holds; only delta is two strict-improvement fixes (BUG-039, BUG-041) confirmed against client read-sites.
