# Release Checklist

Run through this list before every production deployment.

---

## 1. CI / Test Gate

- [ ] `npm test` passes (all test suites green)
- [ ] `npm run test:coverage` passes all thresholds (global: stmts ≥ 60%, branches ≥ 48%, funcs ≥ 64%, lines ≥ 61%; per-directory gates in jest.config.js)
- [ ] No skipped tests that hide regressions

## 2. Smoke Test

- [ ] `SMOKE_BASE_URL=https://<staging-host> npm run smoke` exits 0
- [ ] `/healthz` returns 200
- [ ] `/readyz` returns 200 (MongoDB connected)
- [ ] `/v2/user/profile` (unauthenticated) returns 401 with envelope

## 3. Database / Migrations

- [ ] All pending migrations applied: `npm run migrate:apply`
- [ ] Order owner field backfill complete (if migrating legacy data): `npm run backfill:order-owner:apply`
- [ ] MongoDB indexes confirmed in Atlas (especially new indexes added this release)
- [ ] No `E11000 duplicate key` errors in recent logs (signals index/data mismatch)

## 4. Environment Variables

Confirm **all** of the following are set in the deployment environment:

### Required (startup exits if missing)
| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Access token signing key |

### Authentication
| Variable | Purpose |
|----------|---------|
| `JWT_REFRESH_SECRET` | Refresh token signing key |
| `GOOGLE_CLIENT_ID` | Google OAuth (web) |
| `IOS_GOOGLE_CLIENT_ID` | Google OAuth (iOS) |
| `ANDROID_GOOGLE_CLIENT_ID` | Google OAuth (Android) |
| `APPLE_CLIENT_ID` | Apple Sign-In bundle ID |
| `APPLE_WEB_CLIENT_ID` | Apple Sign-In web service ID |
| `APPLE_TEAM_ID` | Apple developer team ID |
| `APPLE_KEY_ID` | Apple Sign-In key ID |
| `APPLE_KEY_PATH` | Path to Apple private key `.p8` file |
| `APPLE_SUCCESS_URL` | Redirect after Apple auth success |
| `APPLE_FAILURE_URL` | Redirect after Apple auth failure |
| `RECAPTCHA_API_KEY` | reCAPTCHA server-side key |
| `RECAPTCHA_SITE_KEY` | reCAPTCHA client-side key |

### Payments
| Variable | Purpose |
|----------|---------|
| `STRIPE_SK` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NOMOD_API_KEY` | Nomod payment API key (provisioning gate — must be present for clients to see Nomod) |
| `PAYMENT_PROVIDER` | Default provider: `stripe` or `nomod` |
| `TABBY_AUTH_KEY` | Tabby BNPL auth key |
| `TABBY_SECRET_KEY` | Tabby BNPL secret key |
| `TABBY_WEBHOOK_SECRET` | Tabby webhook secret |
| `TABBY_IPS` | Comma-separated Tabby IP allowlist |

### Email
| Variable | Purpose |
|----------|---------|
| `EMAIL_HOST` | SMTP host |
| `EMAIL_USERNAME` | SMTP username |
| `EMAIL_PASSWORD` | SMTP password |
| `ADMIN_EMAIL` | Admin notification target |
| `CC_MAILS` | CC addresses for order emails |

### External APIs / Sync
| Variable | Purpose |
|----------|---------|
| `API_KEY` | Lightspeed API key |
| `PRODUCTS_URL` | Lightspeed products endpoint |
| `BRANDS_URL` | Lightspeed brands endpoint |
| `CATEGORIES_URL` | Lightspeed categories endpoint |
| `BACKEND_URL` | This server's public URL (used in webhooks) |
| `URL` | Frontend/public base URL |
| `FRONTEND_BASE_URL` | Frontend base URL (auth redirects) |
| `SPREADSHEET_ID` | Google Sheets ID (CMS sync) |
| `GOOGLE_CLOUD_PROJECT_ID` | Google Cloud project (Sheets API) |
| `FTP_HOST` | FTP host for product media |
| `FTP_USER` | FTP username |
| `FTP_PASSWORD` | FTP password |
| `FTP_SECURE` | Use FTPS: `true` / `false` |
| `BRANDS_URL` | Brands sync URL |
| `VERIEMAIL_API_KEY` | Email verification API key |

### Feature Flags / Tuning
| Variable | Purpose | Default |
|----------|---------|---------|
| `CART_GIFT_V2_ENABLED` | Route cart-threshold gift through v2 coupon engine (else legacy `isGift` flag path) | `false` |
| `CACHE_ENABLED` | Enable Redis caching | `false` |
| `REDIS_URL` | Redis connection URL | — |
| `DISABLE_PRODUCT_SYNC` | Disable cron sync | `false` |
| `DISABLE_NOTIFICATIONS` | Disable push notifications | `false` |
| `PRODUCTS_UPDATE` | Allow product data updates | `true` |
| `PRODUCT_TYPE` | Lightspeed product type filter | — |
| `LOG_LEVEL` | Pino log level | `info` |
| `ALLOWED_ORIGINS` | CORS origin allowlist (comma-separated) | open |
| `DOMAIN` | Cookie domain | — |
| `ENVIRONMENT` | Runtime environment label | — |

## 5. Code Quality

- [ ] No `console.log` in `src/` (run: `grep -r "console\.log" src/ --include="*.js"`)
- [ ] `npm run lint` exits 0 — chains: no direct model imports + no direct time calls outside clock seam
- [ ] `npm run lint:no-direct-time` green (also covered by `npm run lint`)
- [ ] No hardcoded secrets in committed files (`git grep -i "sk_live\|apikey\|password ="`)

## 6. Server Health Post-Deploy

- [ ] `/healthz` returns 200 within 30s of deploy
- [ ] `/readyz` returns 200 (confirms DB connected)
- [ ] `/health` returns `database: connected`
- [ ] Application logs show no FATAL or repeated ERROR entries in first 5 minutes

## 7. PR3 CI Gate Checks

- [ ] `npm run test:ci` green — coverage thresholds enforced per jest.config.js
- [ ] `npm run smoke -- --base-url=$STAGING_URL` exits 0 — all endpoints reachable
- [ ] GitHub Actions CI workflow passing on the PR (`ci.yml`)

## 8. Environment Variable Inventory

Every `process.env.*` reference found in `src/` as of this release:

| Variable | Variable | Variable |
|----------|----------|----------|
| `ADMIN_EMAIL` | `ALLOWED_ORIGINS` | `ANDROID_GOOGLE_CLIENT_ID` |
| `API_KEY` | `APPLE_CLIENT_ID` | `APPLE_FAILURE_URL` |
| `APPLE_KEY_ID` | `APPLE_KEY_PATH` | `APPLE_SUCCESS_URL` |
| `APPLE_TEAM_ID` | `APPLE_WEB_CLIENT_ID` | `BACKEND_URL` |
| `BRANDS_URL` | `CATEGORIES_URL` | `CC_MAILS` |
| `DISABLE_NOTIFICATIONS` | `DISABLE_PRODUCT_SYNC` | `DOMAIN` |
| `EMAIL_HOST` | `EMAIL_PASSWORD` | `EMAIL_PORT` |
| `EMAIL_USERNAME` | `ENVIRONMENT` | `FRONTEND_BASE_URL` |
| `FTP_HOST` | `FTP_PASSWORD` | `FTP_SECURE` |
| `FTP_USER` | `GOOGLE_CLIENT_ID` | `GOOGLE_CLOUD_PROJECT_ID` |
| `IOS_GOOGLE_CLIENT_ID` | `JWT_REFRESH_SECRET` | `JWT_SECRET` |
| `LOG_LEVEL` | `MIN_SUPPORTED_MOBILE_VERSION` | `MONGO_URI` |
| `NODE_ENV` | `NOMOD_API_KEY` | `PAYMENT_PROVIDER` |
| `PORT` | `PRODUCTS_UPDATE` | `PRODUCTS_URL` |
| `PRODUCT_TYPE` | `RECAPTCHA_API_KEY` | `RECAPTCHA_SITE_KEY` |
| `REDIS_URL` | `SPREADSHEET_ID` | `STRIPE_SK` |
| `STRIPE_WEBHOOK_SECRET` | `TABBY_AUTH_KEY` | `TABBY_IPS` |
| `TABBY_SECRET_KEY` | `TABBY_WEBHOOK_SECRET` | `URL` |
| `CART_GIFT_V2_ENABLED` | `VERIEMAIL_API_KEY` | — |

To regenerate: `grep -rn "process.env" src/ --include="*.js" | sed 's/.*process\.env\.\([A-Z_0-9]*\).*/\1/' | sort -u`

## 9. Nomod-as-primary deploy gates

Follow this section when promoting Nomod to primary payment provider (`PAYMENT_PROVIDER=nomod`).

### Pre-deploy

- [ ] Confirm `NOMOD_API_KEY` is set in the production environment (startup will warn if missing, but verify explicitly)
- [ ] Confirm `NOMOD_TIMEOUT_MS` is set (recommended: `10000`; default is 8000 if unset)
- [ ] Set `RECONCILER_ENABLED=false` for the **first deploy** — ship the reconciler inert; enable only after staging soak
- [ ] Optionally tune `RECONCILER_LOOKBACK_MINUTES` (default 60) and `RECONCILER_BATCH_SIZE` (default 50) for expected traffic
- [ ] Confirm `paymentMethodConfig.nomodEnabled` is `true` in the DB (the env-flag gate was retired; toggle is admin-managed via `PATCH /v2/admin/payment-method-config`)

### Staging soak (before production cutover)

1. Deploy backend with `RECONCILER_ENABLED=false` to staging
2. Set `RECONCILER_ENABLED=true` in staging and restart
3. Observe logs for one full reconciler tick (~5 minutes): look for `[Reconciler]` lines showing `processed: 0, errors: []` (clean startup with no stale records)
4. Run a synthetic abandoned-checkout test:
   - Create a Nomod checkout session via staging API
   - Do NOT call `verify-nomod-payment` (simulate app crash)
   - Wait for the next reconciler tick (or manually trigger it in a test endpoint if available)
   - Confirm an Order document is created in the staging DB and PendingPayment status is `completed`
5. Confirm no `[Reconciler] error` lines appear in logs

### Production cutover

1. Set `RECONCILER_ENABLED=true` in the production environment
2. Restart the backend process
3. Watch the first few `[Reconciler]` log lines — should see `processed: N, errors: []`

### Rollback procedure

- Set `RECONCILER_ENABLED=false` in the production environment and restart — the reconciler stops immediately
- The verify path (`POST /api/verify-nomod-payment`) and the direct `processPendingPayment` path continue to work regardless of the reconciler state
- If Nomod itself needs to be disabled: `PATCH /v2/admin/payment-method-config { nomodEnabled: false }` (takes effect within 30s — the runtime config is Redis-cached). No restart required.

### Monitoring

- Log pattern to watch: lines starting with `[Reconciler]` and `[processPendingPayment]`
- Alert threshold: `errors[]` length > 0 in any reconciler cycle indicates a per-record failure that needs investigation
- Alert threshold: reconciler cycle duration > 30 seconds may indicate Nomod API latency or batch size is too high
- Key metrics per cycle: `paid` (orders recovered), `cancelled`, `expired`, `errors`
- If `paid` is consistently > 0 on every cycle, the mobile redirect interception may be broken — investigate WebView behavior

---

## 10. Rollback Plan

- [ ] Previous Docker image / deployment artifact tagged and retrievable
- [ ] Database rollback script prepared if migration was applied
- [ ] Rollback procedure documented and tested in staging
