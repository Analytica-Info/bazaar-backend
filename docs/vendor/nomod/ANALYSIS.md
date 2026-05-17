# Nomod API — analysis based on captured docs

**Sources scraped 2026-05-07:** 13 pages from `https://nomod.com/docs/api-reference/`
**Local copies:** `docs/vendor/nomod/*.html` (raw) + `REFERENCE.md` (extracted text)
**Audit context:** Nomod is to become the primary payment provider (it already aggregates Stripe / Tabby / Tamara behind its hosted checkout).

---

## What the docs confirm

### API surface

| Family | Endpoints | Used by us today? |
|---|---|---|
| **Hosted Checkout** | `POST /v1/checkout`, `GET /v1/checkout/:id`, `DEL /v1/checkout/:id`, `POST /v1/checkout/:id/refund` | Yes — primary path |
| **Charges** | `GET /v1/charges`, `GET /v1/charges/:id`, `POST /v1/charges/:id/refund` | **No, but should** — see Gap A |
| **Links** (Payment Links) | `POST/GET/PATCH/DEL /v1/links` | No |
| **Invoices** | `POST/GET/PATCH /v1/invoices` | No |
| **Customers** | `POST/GET /v1/customers` | No |
| **Team** | `GET/POST /v1/members` | No |
| **Lookup data** | `GET /v1/countries`, `/v1/provinces`, `/v1/currencies` | No |

### Authentication

- API key header: `X-API-KEY: sk_test_...` or `sk_live_...`
- One key per business per integration
- Server-only — must NOT be in mobile bundle (this is what BUG-045 was about, applied to Nomod context)
- Revocable from the Nomod app

### Errors

Standard HTTP codes (401/403/404/429/500/503) plus semantic codes including:

- `not_authenticated`, `throttled`, `not_found`
- `invalid_amount`, `invalid_currency`, `invalid_country_code`
- `missing_required_items`, `exceeds_item_limit`
- `charge_not_paid`, `charge_already_refunded`, `charge_not_found`
- `refund_amount_exceeds`, `invalid_refund_amount`

These let the client branch on specific error semantics rather than just status code.

### Data formats

- Phone numbers: **E.164 only** (`+971500000001`). Non-E.164 will reject.
- Date/time: **GMT, ISO 8601** (`2026-01-01T13:29:22.809384Z`)
- Currency: ISO 4217 (`AED`, `USD`)

### Rate limits

Documented existence, not actual limits. The docs say "contact us for additional customization" — so the limits are real but not published. **Implication: we should implement client-side rate-limit awareness (back off on 429) rather than hope we never hit them.**

### Critical confirmations about what does NOT exist

1. **No webhooks.** Nomod's sidebar lists every API family — there is no Webhooks family, no Events family, no notification system documented. Their model is **redirect-only**: customer pays on the hosted page, Nomod redirects back to your `successUrl/failureUrl/cancelledUrl`, your app handles it from there.
2. **No documented idempotency-key header on Create Checkout.** Stripe has `Idempotency-Key`; Nomod doesn't appear to. Our `NomodProvider.js` puts an `idempotency_key` field into the **refund body** which the docs don't mention — Nomod likely ignores it silently.
3. **No event log / audit-trail API.** No way to ask "give me all activity on charge X."
4. **No published rate-limit numbers.** Just "we have throttling."
5. **No documented test card numbers.** Sandbox testing requires asking Nomod support directly.

---

## Logic gaps in our current Nomod integration

### Gap A — We don't use the Charges API at all

The docs describe two refund paths:

- `POST /v1/checkout/:id/refund` — refunds at checkout-session level (what we use today in `NomodProvider.refund`)
- `POST /v1/charges/:id/refund` — refunds at the charge level (more granular)

The `Get Checkout` response includes a `charges[]` array. **The actual money movement is at the charge level — a checkout can produce one or more charges, each with its own `status` (`authorised`, `paid`, etc.).**

Our verify endpoint reads `checkout.status` (a top-level field) rather than walking the `charges[]` array. This works for simple flows but can drift in edge cases: a partially-paid checkout, a re-charge after a soft decline, etc.

**Recommendation:** when verifying, also pull `checkout.charges[]` and confirm at least one has `status: paid` and amount sums correctly. For refunds, prefer `POST /v1/charges/:id/refund` since it targets the actual money mover.

### Gap B — `reference_id` and `metadata` are documented `read-only`

The Create Checkout docs list both fields with the `read-only` flag. Our code sends a request `reference_id` (`mobile-${userId}-${nowMs()}`) and a `metadata` object with user_id, phone, etc.

Two interpretations:

1. The `read-only` flag refers to the response, not the request — i.e. Nomod accepts these on input but doesn't let you mutate them after. Most likely interpretation; consistent with what the API would need to support reconciliation.
2. The fields are truly read-only and Nomod silently ignores our values, generating its own.

**This needs to be verified empirically.** Make a test checkout with `reference_id: "TEST-123"` and `metadata: {marker: "A"}`, then GET it back — if the response shows our values, they're respected; if it shows different ones, they're ignored. This matters because our verify-amount-validation gap (next section) depends on `reference_id` round-tripping.

### Gap C — Verify endpoint doesn't validate amount/currency

Already filed in our prior audit. The docs confirm `Get Checkout` returns `amount` and `currency` — we should compare against the original PendingPayment.

### Gap D — No webhook-equivalent recovery for closed-app-mid-payment

Confirmed by the docs: there's no webhook. The only recovery mechanism is **polling the `Get Checkout` endpoint** for any pending session that hasn't reached a terminal state.

This makes the polling reconciler pattern not just nice-to-have, but **architecturally required** for Nomod to be production-primary. There is no alternative.

### Gap E — Phone number format

Mobile sends raw phone strings (`0501234567`). Nomod requires E.164 (`+971500000001`). If our cart submits a non-E.164 phone, Nomod's customer-block validation may reject the whole checkout. **Verify by reading what we send to Nomod's `customer` object** (currently we omit customer per the comment in `NomodProvider.js:53-54`, so this might already be moot — but if we add it later, format matters).

### Gap F — Rate limit handling

We have request timeouts (30s) but no 429-specific retry-with-backoff. If Nomod throttles us (and the docs say they will if usage spikes), we currently throw a 502/500 to the user.

**Recommendation:** add retry-on-429 with exponential backoff (3 attempts, 1s/2s/4s) to the `NomodProvider.client` axios instance.

---

## Best-practice gap matrix vs the docs

I'll re-grade against the previous audit, now informed by the docs:

| # | Practice | Status | Cited evidence |
|---|---|---|---|
| 1 | Server-side checkout creation | ✅ | matches docs' design |
| 2 | API key kept server-side | ✅ | docs require it |
| 3 | Server-side verification (Get Checkout) | ✅ | matches docs' design |
| 4 | Verify amount/currency match | ❌ | docs confirm fields exist; we don't read them |
| 5 | Walk `charges[]` to confirm payment | ❌ | docs show `charges[]` exists; we ignore it |
| 6 | Use Charges API for refunds | ⚠️ | docs offer both paths; we use checkout-level only |
| 7 | Webhook safety net | ❌ **N/A — Nomod doesn't have webhooks** | confirmed by absence in docs |
| 8 | **Polling reconciler** (replaces webhook) | ❌ | not implemented; docs make this architecturally required |
| 9 | Idempotency key on checkout create | ⚠️ | not documented by Nomod; only request-uniqueness via `reference_id` (if it's not read-only) |
| 10 | Idempotency key on refund | ⚠️ | we send one; docs don't acknowledge it; effect unknown |
| 11 | Phone E.164 normalization | ⚠️ | we don't normalize before sending |
| 12 | Currency uppercased | ✅ | matches docs |
| 13 | Authorization on verify (user owns payment) | ⚠️ | check is optional in our code |
| 14 | 429 retry with backoff | ❌ | not implemented |
| 15 | Money math: single rounding | ✅ | one `Math.round` per amount |
| 16 | PII not logged | ✅ | we log IDs, not full bodies |
| 17 | Refund supports partial amounts | ✅ | matches docs |
| 18 | Cancel/expire handling | ⚠️ | `cancelCheckout` exists but not auto-called |
| 19 | Reference-id round-trip verification | ⚠️ | depends on whether `reference_id` is truly read-only |

**Score: 8 ✅ / 7 ⚠️ / 4 ❌**

The 4 hard misses:
- Gap C — verify amount/currency
- Gap D — polling reconciler (architecturally required, not optional)
- Gap E — 429 retry
- Walk `charges[]` for verification

---

## What needs to be done — prioritized

### Tier 1 — must land before Nomod becomes primary

These are not cosmetic — they're the difference between "works in happy path" and "production-grade."

| # | Item | Effort | Why required |
|---|---|---|---|
| 1 | **Polling reconciler cron job.** Every 5 min, find `PendingPayment` records older than X min in `pending` status, query `GET /v1/checkout/:id`, if `paid` → create order via `processPendingPayment`, if `cancelled`/`expired` → mark PendingPayment failed. | 1 day | Recovers orders when redirect-back fails. The webhook substitute. **Architectural requirement** since Nomod has no webhooks. |
| 2 | Verify endpoint: validate `amount` and `currency` against PendingPayment | 1-2h | Prevents amount-mismatch attacks |
| 3 | Verify endpoint: walk `charges[]` and confirm at least one is `paid` (don't trust top-level status alone) | 1-2h | Handles partial-payment / re-charge edge cases |
| 4 | Make `requestingUserId` mandatory on verify (currently optional) | 30 min | Defense-in-depth |
| 5 | Confirm whether `reference_id` and `metadata` are truly read-only (empirical test against sandbox) | 1h research | Determines whether reconciliation by reference_id is possible |
| 6 | 429-retry with exponential backoff in `NomodProvider.client` | 2-3h | Prevents user-facing failures on traffic spikes |
| 7 | E.164 phone normalization before sending to Nomod customer object (when re-enabled) | 1h | Prevents `invalid_phone` rejections |

**Total effort: ~2-3 days of focused backend work.**

### Tier 2 — should land before Nomod becomes primary

| # | Item | Effort | Why |
|---|---|---|---|
| 8 | Idempotency-key on `createNomodCheckoutSession` (mobile-supplied UUID, backend dedup on `PendingPayment.idempotency_key`) | half day + mobile coordination | Prevents double-creates on network retry |
| 9 | Switch refunds from `POST /v1/checkout/:id/refund` to `POST /v1/charges/:id/refund` | half day | More granular; matches docs' actual refund design |
| 10 | Auto-cancel orphaned Nomod checkouts when reconciler finds them in `cancelled`/`expired` states | included in #1 | Cleanliness |
| 11 | Verify the `idempotency_key` field we currently send on refund is honored (it's not in docs) | 1h | Either remove (Nomod ignores it) or keep (Nomod accepts undocumented field) |

### Tier 3 — nice-to-have once primary

| # | Item | Effort | Why |
|---|---|---|---|
| 12 | Use Customers API (`POST /v1/customers`, `GET /v1/customers/:id`) to maintain a Nomod-side customer record per Bazaar user | half day | Better customer-side dashboards in Nomod for support/analytics |
| 13 | Use Charges API (`GET /v1/charges`, `GET /v1/charges/:id`) for support/admin tooling | half day | Lets ops query charge state from admin dashboard without round-tripping checkout IDs |
| 14 | Subscribe to Nomod product updates / changelog | 5 min | Catch when they ship webhooks (which they likely will eventually) |

---

## How this changes the Nomod-as-primary recommendation

In the prior audit I said "not yet, but close" — about 3-4 days of work to get production-primary ready. After reading the docs:

- **Confirms 3-4 days is roughly right** for backend work.
- **Polling reconciler is architecturally required, not optional** (Nomod has no webhooks).
- **Specific API gaps** (charges array, charge-level refunds, no idempotency key) are now precisely identifiable rather than hypothetical.

The recommended sequence is unchanged but with sharper specifics:

1. **This week (backend, ~2-3 days):** Tier 1 items 1-7. The polling reconciler is the headline; the rest are 1-3 hour fixes that bundle naturally.
2. **Next week (mobile + backend, ~1 day):** Tier 2 items 8-11. Mobile coordination required for idempotency key.
3. **Production rollout:** ramp Nomod traffic 5% → 25% → 100% over 2 weeks. Monitor reconciler logs to see how often the redirect-intercept actually fails (real-world data on this matters).
4. **After steady-state:** Tier 3 items as time permits.

---

## Cross-references

- `docs/vendor/nomod/REFERENCE.md` — extracted text from all scraped docs
- `docs/vendor/nomod/01-introduction.html` through `13-retrieve-link.html` — raw HTML (preserve for re-extraction if Nomod updates docs)
- `docs/BUGS.md` — BUG-058 (init creates PendingPayment), BUG-059 (atomic processPendingPayment) — the same prerequisites apply if Nomod ever gets webhooks
- `docs/archive/2026-q2-v2-migration/PAYMENT-FLOWS-MAIN-VS-BRANCH-AUDIT.md` — the prior audit (archived)
- `src/services/payments/NomodProvider.js` — the provider implementation
- `src/services/order/use-cases/createNomodCheckoutSession.js` — the use-case
- `src/services/order/use-cases/verifyNomodPayment.js` — the verify use-case
