# Payment Flow Design — Nomod Integration

**Scope:** Nomod as primary payment provider (aggregating Stripe / Tabby / Tamara).
**Audience:** Wave 2–5 implementation agents and on-call engineers.
**Status: COMPLETE** — all five waves implemented and tested.

---

## 1. Overview: redirect-only Nomod model

Nomod operates a hosted checkout flow. There are no inbound webhooks — confirmed by the
absence of any Webhooks or Events family in the official API docs.

**Flow:**

```
Mobile App → POST /v1/checkout (backend)
           → 200: { id, url }
           → redirect user to url (WebView)
           → user pays on Nomod hosted page
           → Nomod redirects to success/failure/cancelled URL
           → WebView intercepts redirect URL
           → mobile calls POST /api/verify-nomod-payment (backend)
           → backend: GET /v1/checkout/:id → confirm paid + amount match
           → backend: createOrder + mark PendingPayment completed
```

**Why a polling reconciler is required:**

The redirect interception is the only recovery path. If the user kills the app
mid-payment, the redirect never fires, and no order is created. Because Nomod has no
webhooks, the only way to recover is a background job that polls `GET /v1/checkout/:id`
for all `pending`-status PendingPayments that have not reached a terminal state within
a time window. This is architecturally required, not optional.

---

## 2. State machine: PendingPayment status transitions

```
                     ┌─────────────────────────────────────────────┐
                     │              TERMINAL STATES                 │
                     └─────────────────────────────────────────────┘

  [created]  ──────► [pending]
                          │
              ┌───────────┼────────────────────────────┐
              ▼           ▼                            ▼
         [processing]  [cancelled]               [expired]
              │
     ┌────────┴────────┐
     ▼                 ▼
 [completed]       [failed]
```

| Transition | Trigger | Actor |
|---|---|---|
| `created → pending` | PendingPayment record written to DB | `createNomodCheckoutSession` |
| `pending → processing` | Verify call received, checkout confirmed `paid` | `verifyNomodPayment` |
| `processing → completed` | Order created successfully in DB | `processPendingPayment` |
| `processing → failed` | Order creation threw / DB error | `processPendingPayment` error handler |
| `pending → cancelled` | User cancelled on Nomod page | Reconciler or verify with `cancelled` status |
| `pending → expired` | Nomod session expired unattended | Reconciler (polls, finds `expired` status) |

**Terminal states:** `completed`, `failed`, `cancelled`, `expired`.
A PendingPayment in a terminal state must never be re-processed.

---

## 3. Atomicity contract

The following operations MUST be atomic (all-or-nothing):

| Operation | Why |
|---|---|
| `processPendingPayment`: create Order + mark PendingPayment `completed` | If order creation succeeds but status update fails, the reconciler will re-process and create a duplicate order. |
| Status transition from `pending` → `processing` | Must be a compare-and-swap (CAS): update only if current status is `pending`. If two requests race (direct verify + reconciler), only one must win. |

Implementation notes (wave 2/4):
- Use a DB transaction or `findOneAndUpdate` with `{ status: 'pending' }` filter to
  atomically move `pending → processing`. Return the updated document; if null, the
  concurrent caller already won — abort idempotently.
- Wrap `Order.create` + `PendingPayment.save` in a Mongoose session/transaction.

---

## 4. Provider port — Recoverable typedef (stub)

Wave 4 will implement a retry reconciler. The provider must expose enough information
for the reconciler to decide whether a failure is transient (safe to retry) or
permanent (must not retry).

```js
/**
 * @typedef {Object} RecoverableError
 * @property {number}  status      — HTTP-equivalent status (429, 503, etc.)
 * @property {string}  message     — Human-readable description
 * @property {boolean} recoverable — true = safe to retry later; false = permanent failure
 * @property {string}  [code]      — Nomod semantic error code (e.g. 'throttled', 'not_found')
 */
```

Rules:
- `status: 429` → `recoverable: true` (rate limit; back off and retry)
- `status: 503` → `recoverable: true` (Nomod deployment / maintenance)
- `status: 500` → `recoverable: false` (unexpected server error; do not retry blindly)
- `status: 404` → `recoverable: false` (session deleted / never existed)
- `status: 400` → `recoverable: false` (bad request; retrying will not fix it)

The reconciler (wave 4) should set `PendingPayment.status = 'failed'` only on
non-recoverable errors. For recoverable errors it should increment a retry counter
and try again on the next cron cycle, up to a configurable maximum.

---

## 5. Idempotency invariants

Every operation must be safe to repeat without side effects:

| Operation | Invariant |
|---|---|
| `createCheckout` | Each call produces a new Nomod session. Idempotency is enforced by the caller: check for existing `pending` PendingPayment with the same `reference_id` before calling. Do not call twice for the same cart. |
| `getCheckout` | Read-only. Safe to call any number of times. |
| `verifyNomodPayment` | Must be idempotent. If PendingPayment is already `completed`, return the existing order without re-processing. Use the CAS transition (`pending → processing`) to guarantee one winner. |
| `refundCharge` | Nomod returns `charge_already_refunded` on a repeat — callers must check before calling. A future idempotency key layer (wave 3) should dedup at the DB level. |
| Reconciler | Must not process a PendingPayment that is already in a terminal state. Always filter by `status: 'pending'`. |

---

## 6. File layout

```
src/
  services/
    payments/
      NomodProvider.js           ← provider (Wave 1: retry, charges, refundCharge)
      PaymentProvider.js         ← abstract base (do not modify)
      PaymentProviderFactory.js  ← factory
    order/
      use-cases/
        createNomodCheckoutSession.js   ← creates PendingPayment + Nomod session
        verifyNomodPayment.js           ← Wave 2: amount + charges[] verification
        processPendingPayment.js        ← Wave 2: atomic order creation
  utilities/
    phone.js                     ← Wave 1: toE164, isValidE164
  scripts/
    nomodReconciler.js           ← Wave 4: polling cron job
repositories/
  pendingPayments.js             ← Wave 2: add CAS transition + reconciler query
tests/
  services/
    NomodProvider.test.js        ← Wave 1: retry + charges + refundCharge
  utilities/
    phone.test.js                ← Wave 1: E.164 normalization
  services/order/
    verifyNomodPayment.test.js   ← Wave 2
    processPendingPayment.test.js ← Wave 2
  scripts/
    nomodReconciler.test.js      ← Wave 4
docs/
  payments/
    PAYMENT-FLOW-DESIGN.md       ← this file
  vendor/nomod/
    REFERENCE.md                 ← Nomod API reference (source of truth)
    ANALYSIS.md                  ← gap analysis
```

---

## 7. Testing requirements

### Unit tests (each wave)
- All provider methods: happy path, missing API key, error mapping.
- Retry logic: 429 once → success, 429 × 3 → throw, Retry-After header, non-429 no retry.
- Phone normalization: all input patterns, invalid inputs.
- `verifyNomodPayment`: amount mismatch, currency mismatch, charges[] empty, charges[]
  with no `paid` charge, duplicate call (already completed).
- `processPendingPayment`: success, DB failure, concurrent call (second wins CAS).

### Integration tests (wave 2/4)
- Full create → verify → order round-trip using an in-memory DB.
- Reconciler: scans `pending` records, marks terminal ones, does not double-process.

### Concurrency tests (wave 4)
- Two concurrent `verifyNomodPayment` calls for the same payment ID: exactly one order
  created, second call returns idempotently.

### Replay tests (wave 4)
- Simulate reconciler running 3× on the same `pending` record: only one order created.

### Coverage targets
- `NomodProvider.js`: ≥95% lines/branches
- `phone.js`: ≥95% lines
- `verifyNomodPayment.js` (wave 2): ≥90%
- `nomodReconciler.js` (wave 4): ≥90%

---

## 8. Wave-by-wave breakdown

| Wave | Deliverables | Commit |
|---|---|---|
| **1** | Design doc; `phone.js`; NomodProvider 429 retry; `getCheckout` charges[]; `refundCharge` method; createCheckoutSession JSDoc note | `2f7c0fd` |
| **2** | `verifyNomodPayment` hardening: amount + currency validation, charges[] walk, mandatory userId; `processPendingPayment` atomic DB ops; CAS status transition | `adc9fac` |
| **3** | BUG-058: `initStripePayment` writes PendingPayment (3rd `orderData` arg, backward-compat); BUG-059: `processPendingPayment` atomic `findOneAndUpdate` CAS on all three state transitions | `7b999e4` |
| **4** | Polling reconciler (`pollingReconciler.js`): scan `pending` records, poll Nomod via `queryPaymentState`, route to `processPendingPayment` or mark terminal; Recoverable error port; distributed lock; 27 reconciler tests | `fd595d4` |
| **5** | E2E smoke tests (Flows A/B/C); BUGS.md status updates (BUG-058, BUG-059 FIXED; BUG-060 FIXED-VIA-MITIGATION); RELEASE_CHECKLIST.md Nomod deploy gates; this design doc finalized | `57aee13` |

---

## Cross-references

- `docs/vendor/nomod/REFERENCE.md` — Nomod API docs (source of truth)
- `docs/vendor/nomod/ANALYSIS.md` — gap analysis, priority matrix
- `docs/PAYMENT-FLOWS-MAIN-VS-BRANCH-AUDIT.md` — pre-v2 audit
- `docs/BUGS.md` — BUG-058, BUG-059 (prerequisite atomicity bugs)
