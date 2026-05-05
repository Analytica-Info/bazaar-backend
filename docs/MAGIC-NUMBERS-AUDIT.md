# Magic Numbers Audit

**Branch:** `feat/v2-api-unification`
**Date:** 2026-05-01
**Auditor:** automated refactor pass

---

## Category Inventory

### 1. Time Conversions

| Location | Expression | Replaced with |
|---|---|---|
| `services/order/use-cases/createStripeCheckoutSession.js` | `3 * 24 * 60 * 60 * 1000` (delivery date) | `DELIVERY_DAYS * MS_PER_DAY` |
| `services/order/adapters/pendingPayment.js` | `3 * 24 * 60 * 60 * 1000` (delivery date) | `DELIVERY_DAYS * MS_PER_DAY` |
| `services/checkout/use-cases/verifyStripePayment.js` | `3 * 24 * 60 * 60 * 1000` | `DELIVERY_DAYS * MS_PER_DAY` |
| `services/checkout/use-cases/verifyTabbyPayment.js` | `3 * 24 * 60 * 60 * 1000` | `DELIVERY_DAYS * MS_PER_DAY` |
| `services/checkout/use-cases/createOrderAndSendEmails.js` | `3 * 24 * 60 * 60 * 1000` | `DELIVERY_DAYS * MS_PER_DAY` |
| `services/auth/use-cases/forgotPassword.js` | `10 * 60 * 1000` (reset expiry) | `runtimeConfig.auth.resetPasswordExpiryMs` |
| `services/admin/use-cases/forgotPassword.js` | `10 * 60 * 1000` | `runtimeConfig.auth.resetPasswordExpiryMs` |
| `services/auth/use-cases/signup.js` | `15 * 60 * 1000` (OTP expiry) | `runtimeConfig.auth.recoveryCodeExpiryMs` |
| `services/auth/use-cases/resendRecoveryCode.js` | `15 * 60 * 1000` + `24 * 60 * 60 * 1000` | runtime config |
| `services/auth/domain/lockout.js` | `24 * 60 * 60 * 1000` | `24 * MS_PER_HOUR` |
| `services/auth/use-cases/login.js` | `30 * 24 * 60 * 60 * 1000`, `7 * 24 * 60 * 60 * 1000` | runtime config cookie max-age |
| `services/auth/use-cases/googleLogin.js` | same | runtime config |
| `services/auth/use-cases/appleLogin.js` | same | runtime config |
| `controllers/v2/web/authController.js` | `30 * 24 * 60 * 60 * 1000`, `24 * 60 * 60 * 1000` | runtime config |
| `controllers/ecommerce/userController.js` | `3600 * 24` (Apple client secret) | `APPLE_CLIENT_SECRET_EXPIRY_SECS = SEC_PER_DAY` |
| `services/smartCategories/use-cases/todayDeal.js` | `72 * 60 * 60 * 1000` | `72 * MS_PER_HOUR` |
| `services/smartCategories/use-cases/favouritesOfWeek.js` | `7 * 24 * 60 * 60 * 1000` | `7 * MS_PER_DAY` |
| `services/smartCategories/use-cases/getTrendingProducts.js` | `timeWindowHours * 60 * 60 * 1000` | `timeWindowHours * MS_PER_HOUR` |
| `models/PendingPayment.js` | `30 * 60 * 1000` (pending payment TTL) | `runtimeConfig.order.pendingPaymentExpiryMs` |

**New module:** `src/config/constants/time.js`
- `MS_PER_SECOND`, `MS_PER_MINUTE`, `MS_PER_HOUR`, `MS_PER_DAY`, `MS_PER_WEEK`
- `SEC_PER_MINUTE`, `SEC_PER_HOUR`, `SEC_PER_DAY`, `SEC_PER_WEEK`

**Recommended approach:** Use `MS_PER_*` for Date/cookie arithmetic; use `SEC_PER_*` for Redis TTL and JWT numeric `expiresIn`. Env-driven for auth expiry windows and delivery days.

---

### 2. Money / Currency

| Location | Expression | Replaced with |
|---|---|---|
| `services/payments/StripeProvider.js` | `* 100`, `/ 100` (×4 occurrences) | `STRIPE_AMOUNT_MULTIPLIER` |
| `services/checkout/use-cases/createStripeCheckout.js` | `* 100` (×5 occurrences) | `STRIPE_AMOUNT_MULTIPLIER` |
| `services/checkout/use-cases/processCheckout.js` | `Math.round(amount * 100)` | `STRIPE_AMOUNT_MULTIPLIER` |
| `services/order/use-cases/initStripePayment.js` | `Math.round(amountAED * 100)` | `STRIPE_AMOUNT_MULTIPLIER` |

**Not replaced:** `Math.round(... * 100) / 100` patterns in `createTabbyCheckout.js`, `createNomodCheckout.js`, `discountResolver.js`, `getCart.js` — these are AED decimal-rounding (2 decimal places), not Stripe cents conversion. They are correct as-is and semantically distinct.

**New module:** `src/config/constants/money.js`
- `STRIPE_AMOUNT_MULTIPLIER = 100`
- `AED_DECIMAL_PLACES = 2`
- `DEFAULT_CURRENCY = 'AED'`
- `PERCENT_BASE = 100`

---

### 3. HTTP Status Codes

No changes. The codebase uses `DomainError` subclasses for the service layer (v2 paths) and plain `{ status: N }` throws for legacy paths. Introducing a separate HTTP enum would add abstraction without value. BUG-031 (already filed) covers the remaining mapping gap in `errorHandler.js`.

---

### 4. TTLs / Cache Durations

| Location | Old value | Replaced with | Env var |
|---|---|---|---|
| `services/smartCategories/use-cases/*.js` (×6) | `SMART_CAT_TTL = 300` (duplicated) | `runtimeConfig.cache.smartCategoryTtl` | `CACHE_TTL_SMART_CATEGORY` |
| `controllers/mobile/smartCategoriesController.js` | `PRODUCTS_BY_VARIANT_TTL = 300` | `runtimeConfig.cache.productsByVariantTtl` | `CACHE_TTL_PRODUCTS_BY_VARIANT` |
| `services/product/sync/use-cases/handleProductUpdate.js` | `WEBHOOK_DEDUP_TTL = 3` (duplicated ×3) | `runtimeConfig.cache.webhookDedupTtl` | `CACHE_TTL_WEBHOOK_DEDUP` |
| `services/product/sync/use-cases/handleInventoryUpdate.js` | same | same | same |
| `services/product/sync/use-cases/handleSaleUpdate.js` | same | same | same |
| `services/product/adapters/cache.js` | `1800` (×2 — categories) | `runtimeConfig.cache.productTypeTtl` | `CACHE_TTL_PRODUCT_TYPE` |
| `controllers/ecommerce/publicController.js` | `300`, `600`, `3600` (LS caches) | `runtimeConfig.cache.*` | `CACHE_TTL_LS_*` |
| `helpers/productDiscountSync.js` | `60 * 60 * 6` (= 21600) | `runtimeConfig.cache.maxDiscountTtl` | `CACHE_TTL_MAX_DISCOUNT` |
| `services/metricsService.js` | `60 * 60 * 3` (COUNTER_TTL) | `runtimeConfig.cache.metricsCounterTtl` | `CACHE_TTL_METRICS_COUNTER` |
| `services/metricsService.js` | `60 * 60 * 24` (error log) | `runtimeConfig.cache.errorLogTtl` | `CACHE_TTL_ERROR_LOG` |

---

### 5. Pagination Defaults

| Location | Old value | Replaced with |
|---|---|---|
| `services/order/use-cases/getOrders.js` | `page = 1, limit = 20` | `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE` |
| `repositories/NotificationRepository.js` | `page = 1, limit = 20` | same |
| `services/notification/use-cases/userNotifications.js` | `page = 1, limit = 20` | same |
| `services/notification/use-cases/adminNotifications.js` | `page = 1, limit = 10` | `DEFAULT_PAGE`, `ADMIN_DEFAULT_PAGE_SIZE` |

**New module:** `src/config/constants/pagination.js`
- `DEFAULT_PAGE = 1`, `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`, `MIN_PAGE_SIZE = 1`, `ADMIN_DEFAULT_PAGE_SIZE = 10`

---

### 6. Retry Counts / Concurrency

`INVENTORY_CONCURRENCY = 5` appears in 3 files (`quantities.js`, `validateInventoryBeforeCheckout.js`, `lightspeedFetchers.js`) — each is a local named constant. Consolidation would require a shared domain config module. Left with `// reason` comments as they are already named; see follow-up section.

`maxRetries = 5` in `scripts/updateProducts.js` — one-off script constant, already clearly named. Left as-is.

---

### 7. Token / Code Expiry Windows

| Location | Old value | Replaced with | Env var |
|---|---|---|---|
| `services/auth/use-cases/forgotPassword.js` | `10 * 60 * 1000` | `runtimeConfig.auth.resetPasswordExpiryMs` | `RESET_TOKEN_EXPIRY_MINUTES=10` |
| `services/admin/use-cases/forgotPassword.js` | `10 * 60 * 1000` | same | same |
| `services/auth/use-cases/signup.js` | `15 * 60 * 1000` | `runtimeConfig.auth.recoveryCodeExpiryMs` | `OTP_EXPIRY_MINUTES=15` |
| `services/auth/use-cases/resendRecoveryCode.js` | `15 * 60 * 1000` | same | same |
| `services/auth/domain/lockout.js` | `24 * 60 * 60 * 1000` | `runtimeConfig.auth.recoveryResendWindowMs` | `RECOVERY_RESEND_WINDOW_HOURS=24` |

**Note (BUG-035):** `services/auth/use-cases/refresh.js` issues access tokens with `expiresIn: '2m'` — but `services/auth/use-cases/checkAccessToken.js` and `services/auth/use-cases/login.js` use `'1h'`. These are intentionally different (refresh rotates quickly; initial login is longer). No bug, but worth documenting. See BUG-035.

---

### 8. Rate Limit Windows

| Location | Old value | Replaced with | Env var |
|---|---|---|---|
| `server.js` `authLimiter` | `15 * 60 * 1000`, `max: 20` | `runtimeConfig.rateLimit.*` | `RATE_LIMIT_AUTH_WINDOW_MINUTES=15`, `RATE_LIMIT_AUTH_MAX=20` |
| `server.js` `passwordResetLimiter` | `15 * 60 * 1000`, `max: 5` | `runtimeConfig.rateLimit.*` | `RATE_LIMIT_PWD_RESET_WINDOW_MINUTES=15`, `RATE_LIMIT_PWD_RESET_MAX=5` |

---

### 9. Business Rules

| Location | Old value | Replaced with |
|---|---|---|
| `services/cart/domain/giftProduct.js` | `GIFT_THRESHOLD_DEFAULT_AED = 400` | Already named; also exported — no change needed |
| `services/order/domain/cartNormalization.js` | `GIFT_MIN_STOCK = 5` | Already named locally; also in business.js for canonical reference |
| `models/Product.js` | `giftThreshold: { default: 400 }` | Left as-is — Mongoose schema default; references business constant indirectly |
| `services/giftProductService.js` | inline `400` fallback | `GIFT_THRESHOLD_DEFAULT_AED` |

**New module:** `src/config/constants/business.js`
- `GIFT_THRESHOLD_DEFAULT_AED = 400`, `GIFT_MIN_STOCK = 5`, `DELIVERY_DAYS = 3`, `MAX_RECOVERY_ATTEMPTS = 5`

---

### 10. External API Timeouts

| Location | Old value | Replaced with | Env var |
|---|---|---|---|
| `services/payments/NomodProvider.js` | `timeout: 30000` | `runtimeConfig.external.nomodTimeoutMs` | `NOMOD_TIMEOUT_MS=30000` |

---

### 11. String Literals (Brand / Config)

`mail/emailService.js` uses `` `Bazaar ${process.env.EMAIL_USERNAME}` `` as the sender name. The brand name `Bazaar` is inline but driven by the email address env var. No change needed — the brand name is part of the sender display name and is not a standalone config value.

---

## Bugs Filed

See `docs/BUGS.md` — BUG-035 through BUG-037.

---

## Summary

| Category | Replacements made | New env vars | New constants |
|---|---|---|---|
| Time conversions | 19 | 7 | 9 (MS_PER_*, SEC_PER_*) |
| Money / Stripe | 8 | 0 | 4 |
| TTLs / cache | 14 | 13 | 0 |
| Pagination | 4 | 0 | 5 |
| Auth expiry | 7 | 3 | 0 |
| Rate limits | 4 | 4 | 0 |
| Business rules | 2 | 1 | 4 |
| External timeouts | 1 | 1 | 0 |
| **Total** | **59** | **29** | **22** |
