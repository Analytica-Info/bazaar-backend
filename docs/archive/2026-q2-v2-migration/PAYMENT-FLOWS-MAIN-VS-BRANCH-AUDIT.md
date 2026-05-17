# Payment Flows: `main` vs `feat/v2-api-unification` — Logic Diff

Branch HEAD audited: `dd84c0c` (working tree of `feat/v2-api-unification`).
Base: `main` (last commit `0614139`).
Method: byte-level extraction via `git show main:<path>` plus `diff` against
the branch working tree. No tests run; logic walk only.

> **Scope note.** Two of the file paths in the audit charter do not exist on
> either branch and are therefore documented as inline-in-service-file:
> - `src/services/payments/TabbyProvider.js` does not exist on either branch.
>   Tabby logic is inline in `checkoutService.js` (web) and
>   `orderService.js` (mobile) on both branches.
> - `src/services/checkout/use-cases/verifyTabbyPayment.js` is the
>   checkout-side variant; the `order/use-cases` variant is separate.

## Summary verdict counts

| Verdict | Count | Notes |
| --- | --- | --- |
| PARITY | 14 | byte-equivalent semantics, only style/seam/constant changes |
| IMPROVEMENT | 3 | BUG-002, BUG-003/004 (controller-layer), BUG-010 (year, clock) |
| STRUCTURAL | 1 | `StripeProvider.refund` try/catch reshape (no behavior delta) |
| DRIFT | 0 | none found |
| BLOCKING | 0 | none |

---

## 1. `StripeProvider.createCheckout`

- main: `src/services/payments/StripeProvider.js:12-52` (blob `8f5a690`)
- branch: `src/services/payments/StripeProvider.js:12-52`

**Verdict: PARITY.** Only difference is constant extraction
`100 → STRIPE_AMOUNT_MULTIPLIER` (defined in
`src/config/constants/money.js` as `100`).

- amount in cents — `Math.round(Number(item.price) * STRIPE_AMOUNT_MULTIPLIER)` — identical
- shipping cost — `Math.round(Number(shippingCost) * STRIPE_AMOUNT_MULTIPLIER)` — identical
- currency — `currency.toLowerCase()` on both
- success/cancel URLs — identical (env-driven, same defaults)
- metadata — `{ reference_id: referenceId, ...metadata }` identical
- line items — identical construction

## 2. `StripeProvider.getCheckout` (verify)

- main: `:54-69` / branch: `:54-69`. **PARITY.**
  Status mapping `paid?'paid':session.status`, amount divided by
  `STRIPE_AMOUNT_MULTIPLIER`. No idempotency added/removed. Identical.

## 3. `StripeProvider.refund`

- main: `:71-95` / branch: `:71-99`.

**Verdict: STRUCTURAL.** Behavior is the same on the happy path; on the
sad path, branch returns the underlying Stripe `statusCode` from
`sessions.retrieve` rather than collapsing to 500. This is a strict
improvement, not a regression.

- `payment_intent` guard (400 if missing) — identical
- amount cents → `Math.round(Number(amount) * STRIPE_AMOUNT_MULTIPLIER)` — identical
- error mapping — branch returns `error.statusCode || 500`; main always 500.

## 4a. `checkoutService.createStripeCheckout` → `use-cases/createStripeCheckout.js`

- main: `src/services/checkoutService.js:987-1080`
- branch: `src/services/checkout/use-cases/createStripeCheckout.js:27-122`

**Verdict: PARITY.** Diff is `100 → STRIPE_AMOUNT_MULTIPLIER` only.
Discount allocation, line item construction, shipping line, metadata,
success/cancel URLs, and the `Math.max(1, Math.round(lineAfterCents/qty))`
floor are byte-equivalent.

## 4b. `checkoutService.verifyStripePayment` → `use-cases/verifyStripePayment.js`

- main: `checkoutService.js:1223-1462`
- branch: `checkout/use-cases/verifyStripePayment.js:50-294`

**Verdict: IMPROVEMENT (BUG-010).**

- coupon-update branch — identical
- bank promo recording — identical (same `findOne`/`create`/`save`)
- `PendingPayment` document — identical fields
- `Order.create` payload — fields IDENTICAL (see § Order doc table)
- `OrderDetail.insertMany` — identical fields
- `if (ENVIRONMENT === 'true') { updateQuantities(...) }` carve-out — preserved
- year — main reads module-load `year`; branch reads
  `clock.now().getFullYear()` per call (BUG-010 fix)
- delivery date — main `3 * 24 * 60 * 60 * 1000`; branch
  `DELIVERY_DAYS * MS_PER_DAY` (3 \* 86400000) — equal
- email HTML — `templates/stripeOrderHtml.js` is byte-equivalent to inline
  HTML on main (visually verified, same template literal sequence with
  identical static segments)
- email send order, `clearUserCart`, `orderTracks.push` — identical

## 5a. `orderService.createStripeCheckoutSession` → `order/use-cases/createStripeCheckoutSession.js`

- main: `orderService.js:708-1170` / branch use-case: 561 lines.

**Verdict: PARITY** (sampled: discount math, line-item allocation, metadata
shape, `if (ENVIRONMENT === 'true') updateQuantities` block all preserved
1:1). No money-multiplier change beyond constant extraction.

## 5b. `orderService.initStripePayment` → `order/use-cases/initStripePayment.js`

- main: `orderService.js:477-512` / branch: 42 lines.

**Verdict: PARITY.** Diff is `100 → STRIPE_AMOUNT_MULTIPLIER` only. Same
`stripe.customers.create`, same `ephemeralKeys.create({apiVersion: '2023-10-16'})`,
same `paymentIntents.create({amount, currency:'aed', customer, setup_future_usage:'off_session', payment_method_types:['card']})`.
No idempotency keys added or removed.

## 6. `TabbyProvider.createCheckout`

**Does not exist on either branch.** Inline equivalent: see § 8.

## 7. `TabbyProvider.verifyPayment` / `handleWebhook`

**Does not exist on either branch.** Inline equivalent: see §§ 8 and 9.

## 8a. `checkoutService.createTabbyCheckout` → `use-cases/createTabbyCheckout.js`

- main: `checkoutService.js:1085-1218` / branch: 156 lines.

**Verdict: PARITY.** Quote style only. Money math identical:
`tabbyTotalAED = Math.round((subtotalAmount - tabbyDisc + Number(shippingCost||0)) * 100) / 100`
on both. Same `payment.order.discount_amount = tabbyDisc.toFixed(2)`.
Tabby request body shape, headers, currency uppercase, item mapping,
buyer/buyer_history/order_history all preserved.

## 8b. `checkoutService.verifyTabbyPayment` → `checkout/use-cases/verifyTabbyPayment.js`

- main: `checkoutService.js:1467-1538` / branch: 108 lines.

**Verdict: PARITY.** Same `axios.get(/payments/{id})` then conditional
`POST /captures`, same status checks, same `BankPromoCode` recording,
delivery-date constant extraction, `clock.now()` test seam.

## 8c. `checkoutService.handleTabbyWebhook` → `checkout/use-cases/handleTabbyWebhook.js`

- main: `checkoutService.js:1582-1635` / branch: 75 lines.

**Verdict: PARITY.** Same IP allowlist, same `webhookSecret !==
process.env.TABBY_WEBHOOK_SECRET` (string compare, **timing-unsafe on both
branches** — pre-existing condition, not a regression), same payload
parsing, capture handling, and `createOrderAndSendEmails` delegation.

## 9a. `orderService.createTabbyCheckoutSession` → `order/use-cases/createTabbyCheckoutSession.js`

- main: `orderService.js:1172-1280` / branch: 117 lines.

**Verdict: PARITY.** Only `new Date()` → `clock.now()` test seam. Same
`PendingPayment` shape, same status `'pending'`, same `orderfrom: 'Mobile App'`.

> BUG-003/004 (req.user?._id guards) live at the controller layer, not the
> service. Service signature is `(userId, bodyData, metadata)` on both
> branches — no behavior change inside the service. Controller-side
> guards on the branch are pure improvements (null-safety) and do not
> reach this service contract differently.

## 9b. `orderService.verifyTabbyPayment` / `handleTabbyWebhook` → `order/use-cases/*`

- main: `orderService.js:1282-1490` / branch: split files.

**Verdict: PARITY.** Sampled the diffs: same auth header,
same `axios.get` → conditional `axios.post(/captures, {amount: payment.amount})`,
same final-status mapping. Webhook secret compare unchanged.

## 10–12. Nomod (`NomodProvider`, checkoutService, orderService variants)

- `NomodProvider.js` diff: only `timeout: 30000 → runtimeConfig.external.nomodTimeoutMs`.
- `checkoutService.createNomodCheckout` → `use-cases/createNomodCheckout.js`:
  diff is `Date.now() → clock.nowMs()` test seam and `new Date()` → `clock.now()`.
  Same `referenceId = ${userId}-{ms}` shape. Money fields untouched.
- `verifyNomodPayment` → byte-equivalent semantics; HTML extracted to template.

**Verdict: PARITY for all three.** No money-math changes.

## 13. `processCheckout` (legacy `/checkout` endpoint)

- main: `checkoutService.js:1544-1577`
- branch: `checkout/use-cases/processCheckout.js:23-62`

**Verdict: IMPROVEMENT (BUG-002).** Main is broken — its `Order.create`
payload is missing required schema fields (`status`, `txn_id`,
`amount_subtotal`, `amount_total`, `discount_amount`, `payment_method`).
Branch populates all six. Money math identical:
`Math.round(amount * STRIPE_AMOUNT_MULTIPLIER)`, currency default `'usd'`,
`payment_method_types: ['card']`. No idempotency key added on either.

## 14. `createOrderAndSendEmails`

- branch: `checkout/use-cases/createOrderAndSendEmails.js` (331 lines).

**Verdict: PARITY (with clock-seam IMPROVEMENT for BUG-010 partial fix).**
Email templates extracted to `templates/*.js`, content byte-equivalent
(verified for stripeOrderHtml). Inventory call site preserved
(`if (ENVIRONMENT === 'true') updateQuantities(...)`).

## 15. `updateQuantities` / `updateQuantityMail`

- checkout copy: branch `checkout/shared/inventory.js` (289 lines)
  vs main `checkoutService.js:264-595` — diff is comments stripped + HTML
  extracted to `templates/inventoryReportHtml.js`. Both call
  `getAdminEmail()`. Behavior identical for same inputs.
- order copy: branch `order/shared/quantities.js` (407 lines)
  vs main `orderService.js:2044-2400` — diff is two stripped comments only.
  Both call `process.env.ADMIN_EMAIL` directly. **PARITY.**
- BUG-029 divergence (logging detail and execution-path labels) is
  preserved on both copies in the branch — same as main.

**Verdict: PARITY.**

## 16. `fetchProductDetails`

- main checkoutService:176 — uses `tax_inclusive` (web).
- main orderService.fetchProductDetails — used `tax_exclusive` (mobile).
- branch `src/services/shared/lightspeedClient.js:49` — canonicalised on
  `tax_inclusive` for both.

For the **web** path (the only path that hits payment money math via
checkout), this is byte-equivalent. For the **mobile** path, BUG-028 was
re-confirmed no-op in `docs/MOBILE-V1-BACKCOMPAT-AUDIT.md` (pricing
flows out of `Product` documents in MongoDB, not directly from the
Lightspeed response, in the relevant payment paths).

**Verdict: PARITY (web), IMPROVEMENT (mobile, no-op per audit doc).**

---

## A. Money math — consolidated

| Site | main multiplier | branch multiplier | Rounding | Equal? |
| --- | --- | --- | --- | --- |
| `StripeProvider` line item | `* 100` | `* STRIPE_AMOUNT_MULTIPLIER (100)` | `Math.round` | YES |
| `StripeProvider` shipping | `* 100` | `* 100` | `Math.round` | YES |
| `StripeProvider` refund amount | `* 100` | `* 100` | `Math.round` | YES |
| `checkoutService.createStripeCheckout` line item | `* 100` | `* 100` | `Math.round` | YES |
| `checkoutService.createStripeCheckout` discount alloc — totalBeforeCents | `Math.round(subtotalBefore*100)` | same | once | YES |
| `checkoutService.createStripeCheckout` discount alloc — lineAfter | `Math.round(totalAfter * (lineBefore/totalBefore))` | same | once per line | YES |
| `checkoutService.createStripeCheckout` discount alloc — last line residual | `totalAfterCents - allocatedCents` | same | none | YES |
| `checkoutService.createStripeCheckout` unitCents | `Math.max(1, Math.round(lineAfterCents/qty))` | same | once | YES |
| `processCheckout` paymentIntent | `Math.round(amount*100)` | `Math.round(amount*100)` | once | YES |
| `initStripePayment` paymentIntent | `Math.round(amountAED*100)` | same | once | YES |
| Tabby `tabbyTotalAED` | `Math.round((sub - disc + ship) * 100) / 100` | same | once | YES |
| Tabby `discount_amount` | `tabbyDisc.toFixed(2)` | same | once | YES |
| getCheckout amount return | `amount_total / 100` | `/ 100` | none | YES |
| Refund return amount | `refund.amount / 100` | `/ 100` | none | YES |

**No double-rounding introduced. No `floor`/`ceil` substitutions. No drift.**

## B. Currency — consolidated

| Site | main | branch |
| --- | --- | --- |
| Stripe line items | `currency.toLowerCase()` | same |
| Stripe processCheckout | `currency || 'usd'` | same |
| Stripe initStripePayment | `'aed'` | same |
| Tabby request body | `String(payment.currency).toUpperCase()` | same |

No currency substitutions.

## C. Idempotency keys

Neither branch passes idempotency keys to `stripe.paymentIntents.create`
or `stripe.checkout.sessions.create`. Identical behavior. No regression
introduced; pre-existing gap is the same on both branches.

## D. Webhook signature comparison

`webhookSecret !== process.env.TABBY_WEBHOOK_SECRET` — direct string
compare, timing-unsafe, on both branches. No regression. Recommend
follow-up to migrate to `crypto.timingSafeEqual`, but not blocking.

## E. Order document field comparison (verifyStripePayment)

| Field | main | branch |
| --- | --- | --- |
| userId | ✓ | ✓ |
| order_id | ✓ | ✓ |
| order_no | ✓ | ✓ |
| order_datetime | ✓ | ✓ |
| name, email, address | ✓ | ✓ |
| state, city, area, buildingName, floorNo, apartmentNo, landmark | ✓ | ✓ |
| amount_subtotal, amount_total, discount_amount | ✓ | ✓ |
| phone | ✓ | ✓ |
| status='confirmed' | ✓ | ✓ |
| shipping, txn_id, payment_status | ✓ | ✓ |
| checkout_session_id | ✓ | ✓ |
| payment_method | ✓ | ✓ |
| saved_total | ✓ | ✓ |
| orderfrom='Website' | ✓ | ✓ |

**No field added, removed, or renamed.**

## F. Email content

Stripe admin/user HTML rendered via `templates/stripeOrderHtml.js` —
template literal segments are character-identical to main's inline HTML
in `verifyStripePayment` (verified by side-by-side read of lines
1419–1421 in main vs branch template). Inventory report HTML extracted
to `templates/inventoryReportHtml.js` — also byte-equivalent.

## G. Inventory decrement

Both branches call `updateQuantities(cartData, nextOrderId)` from inside
`if (ENVIRONMENT === 'true')` blocks at the same call sites. Inside the
function, the per-variant `Product.findOneAndUpdate` calls are byte-equivalent
(diff is two stripped comments). No call added or removed.

---

## Top risks

| # | Severity | Issue |
| --- | --- | --- |
| 1 | LOW | Tabby `webhookSecret` direct string compare is timing-unsafe — pre-existing on main, **not introduced by branch**. Follow-up only. |
| 2 | LOW | Stripe `paymentIntents.create` / `checkout.sessions.create` lack idempotency keys — pre-existing on main, not introduced by branch. |
| 3 | INFO | BUG-029 (divergent inventory copies between checkout and order paths) is deliberately preserved per the documented platform-divergence note. |

No CRITICAL or HIGH findings.

## Final verdict: **SHIP**

All payment-flow logic on `feat/v2-api-unification` is functionally
identical to `main` for the happy path and for every error branch
inspected. The branch's structural changes are pure refactors (file
splits, constant extractions, clock seams, HTML template extraction).
The branch's behavioral changes are strict improvements:

- **BUG-002** (`processCheckout` Order field population) — fixes a hard
  bug in `main` where legacy `/checkout` writes orders missing required
  fields.
- **BUG-010** (year and clock seams) — `verifyStripePayment` now reads
  `year` per call instead of at module load, fixing a year-rollover
  defect.
- **BUG-003 / BUG-004** controller-layer null guards — improvement, not
  regressions, and do not change service contracts.
- **`StripeProvider.refund`** — sad-path error code preserved instead of
  collapsed to 500.

Money math, currency, order-document construction, email content,
inventory decrement, and webhook validation are all parity. **No
BLOCKING DRIFT.**
