# Runtime Configuration Reference

All values are read from `process.env` at startup by `src/config/runtime.js`.
Every variable is optional — a safe default is built in.
Change a value and restart the server; no code change required.

---

## Cache TTLs

All values are in **seconds** (Redis `EX` convention).

| Env var | Default | Controls |
|---|---|---|
| `CACHE_TTL_SMART_CATEGORY` | `300` | Trending, today-deal, flash-sale, super-saver, new-arrivals, favourites-of-week endpoints |
| `CACHE_TTL_CATEGORIES` | `300` | Product sidebar categories |
| `CACHE_TTL_ALL_CATEGORIES` | `300` | All-categories nav list |
| `CACHE_TTL_HOME_PRODUCTS` | `300` | Home-page product grid |
| `CACHE_TTL_LS_INVENTORY` | `300` | Lightspeed inventory snapshot (`filterAndCacheProductsByInventory`) |
| `CACHE_TTL_LS_PRODUCTS` | `600` | Lightspeed full product list (`fetchAndCacheProducts`) |
| `CACHE_TTL_LS_CATEGORIES` | `3600` | Lightspeed category list — changes rarely, safe at 1 hour |
| `CACHE_TTL_PRODUCTS_BY_VARIANT` | `300` | Mobile products-by-variant colour grouping |
| `CACHE_TTL_PRODUCT_TYPE` | `1800` | Lightspeed product-type / category detail page |
| `CACHE_TTL_MAX_DISCOUNT` | `21600` | Global max-discount metric cached after product sync (6 h) |
| `CACHE_TTL_WEBHOOK_DEDUP` | `3` | Webhook dedup lock — keep very short to avoid replay suppression |
| `CACHE_TTL_METRICS_COUNTER` | `10800` | Redis metrics INCR counters (3 h) |
| `CACHE_TTL_ERROR_LOG` | `86400` | Error-log Redis LIST TTL (24 h) |

**When to tune:** Increase smart-category TTLs (e.g. `600`) during flash sales to reduce DB load. Decrease Lightspeed TTLs if inventory data needs to be fresher.

---

## Auth / Token Expiry

| Env var | Default | Controls |
|---|---|---|
| `OTP_EXPIRY_MINUTES` | `15` | Recovery-code / OTP validity window (ms in code) |
| `RESET_TOKEN_EXPIRY_MINUTES` | `10` | Password-reset token validity (ms in code) |
| `RECOVERY_RESEND_WINDOW_HOURS` | `24` | Sliding window for recovery-code resend rate-limit (ms in code) |
| `SESSION_COOKIE_DAYS` | `7` | Cookie max-age for standard (non-remember-me) session |
| `REMEMBER_ME_COOKIE_DAYS` | `30` | Cookie max-age when "remember me" is checked |
| `WEB_COOKIE_DAYS` | `1` | Web-only short session cookie (Google/Apple login fallback) |

**When to tune:** Shorten `OTP_EXPIRY_MINUTES` to `5` for higher security environments. Extend `SESSION_COOKIE_DAYS` to `14` if ops wants less frequent re-login on web.

---

## Rate Limiting

Changing these requires a server restart (values are read at startup).

| Env var | Default | Controls |
|---|---|---|
| `RATE_LIMIT_AUTH_WINDOW_MINUTES` | `15` | Window for login/register/refresh endpoints |
| `RATE_LIMIT_AUTH_MAX` | `20` | Max attempts per auth window |
| `RATE_LIMIT_PWD_RESET_WINDOW_MINUTES` | `15` | Window for forgot-password/verify-code endpoints |
| `RATE_LIMIT_PWD_RESET_MAX` | `5` | Max attempts per password-reset window |

**When to tune:** Tighten `RATE_LIMIT_AUTH_MAX` to `10` if brute-force is detected. Loosen temporarily for load tests.

---

## Order / Fulfilment

| Env var | Default | Controls |
|---|---|---|
| `DELIVERY_DAYS` | `3` | Calendar days added to order date for estimated delivery shown in confirmation emails |
| `PENDING_PAYMENT_EXPIRY_MINUTES` | `30` | How long a `PendingPayment` document lives before TTL expiry (Mongoose `expires_at` default) |

**When to tune:** Increase `DELIVERY_DAYS` during peak seasons or when logistics capacity is reduced.

---

## External API Timeouts

| Env var | Default | Controls |
|---|---|---|
| `NOMOD_TIMEOUT_MS` | `30000` | Nomod checkout API axios request timeout (ms) |

---

## Code Constants (not env-driven)

These live in `src/config/constants/` and require a code change + deploy to modify.
They represent API contract invariants or domain model facts.

| Constant | Value | File | Reason not env-driven |
|---|---|---|---|
| `DEFAULT_PAGE_SIZE` | `20` | `pagination.js` | API contract — clients rely on this default |
| `ADMIN_DEFAULT_PAGE_SIZE` | `10` | `pagination.js` | API contract |
| `MAX_PAGE_SIZE` | `100` | `pagination.js` | Guards against unbounded queries |
| `GIFT_THRESHOLD_DEFAULT_AED` | `400` | `business.js` | Domain model default; configurable per-product in DB |
| `GIFT_MIN_STOCK` | `5` | `business.js` | Domain rule for gift eligibility |
| `MAX_RECOVERY_ATTEMPTS` | `5` | `business.js` | Auth policy |
| `STRIPE_AMOUNT_MULTIPLIER` | `100` | `money.js` | Stripe API requirement — AED has 100 fils/dirham |
| `AED_DECIMAL_PLACES` | `2` | `money.js` | Currency standard |
