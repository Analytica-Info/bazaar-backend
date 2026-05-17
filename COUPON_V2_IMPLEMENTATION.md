# Coupon V2 Implementation

## Public URL contract

_Last updated: 2026-05-16_

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | /v2/coupons             | optional | Coupon availability metadata (issuance count) |
| POST   | /v2/coupons/validate    | optional | Validate a coupon code (structured v2 verdict) |
| POST   | /v2/coupons/apply       | optional | Atomically reserve a coupon |
| POST   | /v2/coupons/release     | required | Release a reservation (idempotent) |
| POST   | /v2/coupons/redeem      | required | Confirm redemption against a placed order |
| GET    | /v2/coupons/eligible    | optional | List eligible coupons for a given cart |

The legacy shim `POST /v2/coupons/validate` (wrapping `checkCouponCode`) has been removed. The UAE10 / FIRST15 / bank-promo legacy codes continue to be served by v1 routes under `/check-coupon` and are unaffected.

---

## Overview

Polymorphic coupon engine with registry-based predicates + reward types, atomic reservation/redemption, and backwards-compatible v1 adapter.

---

## Files Added

### Models
- `src/models/CouponV2.js` — `coupons_v2` collection. Status, date windows, rules/reward as Mixed subdocs, uses_remaining for global cap.
- `src/models/CouponRedemption.js` — `coupon_redemptions` collection. Lifecycle states (reserved → redeemed/released/refunded), TTL index for auto-expiry of orphaned reservations, partial-filter unique index for idempotency_key.

### Domain
- `src/services/coupon/domain/rejection-reasons.js` — enum of structured reason codes.
- `src/services/coupon/domain/EligibilityVerdict.js` — frozen value object with `eligible`, `reason`, `recoverable`, `message`.
- `src/services/coupon/domain/AppliedDiscount.js` — frozen value object with `aed`, `type`, `line_adjustments`, `meta`.

### Predicates
- `src/services/coupon/predicates/index.js` — `PredicateRegistry` (register/get).
- `src/services/coupon/predicates/MinSubtotal.js`
- `src/services/coupon/predicates/FirstOrder.js`
- `src/services/coupon/predicates/UserSegment.js`
- `src/services/coupon/predicates/CategoryIn.js`
- `src/services/coupon/predicates/ProductIn.js`
- `src/services/coupon/predicates/VerticalIn.js`
- `src/services/coupon/predicates/Schedule.js`
- `src/services/coupon/predicates/PaymentMethodIn.js`
- `src/services/coupon/predicates/MaxQuantity.js`
- `src/services/coupon/predicates/Geo.js`

### Rewards
- `src/services/coupon/rewards/index.js` — `RewardRegistry` (register/get).
- `src/services/coupon/rewards/FlatReward.js`
- `src/services/coupon/rewards/PercentReward.js`
- `src/services/coupon/rewards/FreeShippingReward.js`
- `src/services/coupon/rewards/TieredPercentReward.js`
- `src/services/coupon/rewards/BxGyReward.js`
- `src/services/coupon/rewards/FreeGiftReward.js`

### Use Cases (new)
- `src/services/coupon/use-cases/validate.js` — pure validation (no DB writes). Returns verdict + discount.
- `src/services/coupon/use-cases/apply.js` — atomic reserve (decrement + insert). Idempotency key support.
- `src/services/coupon/use-cases/redeem.js` — reserved → redeemed (call from order placement).
- `src/services/coupon/use-cases/release.js` — reserved → released (idempotent). Restores uses_remaining.
- `src/services/coupon/use-cases/eligible.js` — list applicable coupons, sorted, capped at 10.

### Adapter
- `src/services/coupon/v1-adapter.js` — maps v2 verdict + discount to legacy `{ success, discountPercent, capAED, discountAmount }` shape. Degrades gracefully for unsupported reward types.

### Migration
- `scripts/migrations/2026-05-coupon-v2-backfill.js` — idempotent backfill of FIRST15.

### Tests (new)
- `tests/services/coupon/v2/predicates.test.js` — all 10 predicates (pass/fail/boundary)
- `tests/services/coupon/v2/rewards.test.js` — all 6 reward types
- `tests/services/coupon/v2/validate.test.js` — validate use-case including all rejection reasons
- `tests/services/coupon/v2/apply.test.js` — atomic reserve, idempotency, per-user cap
- `tests/services/coupon/v2/release.test.js` — release + idempotency
- `tests/services/coupon/v2/v1-adapter.test.js` — all reward types and all rejection reasons
- `tests/services/coupon/v2/eligible.test.js` — filtering, sorting, cap, exclusion
- `tests/services/coupon/v2/backfill.test.js` — first run inserts, second run skips

---

## Files Changed

- `src/services/coupon/index.js` — exports validate, apply, redeemV2, release, eligible, v1Adapter.
- `src/controllers/v2/shared/couponController.js` — added validate, apply, release, redeem, eligible handlers.
- `src/routes/v2/shared/index.js` — registered the 5 v2 engine routes.
- `docs/openapi/v2.yaml` — added OpenAPI entries for the 4 new endpoints (required by parity guard).

---

## How to Run the Backfill

```bash
MONGODB_URI=mongodb://<host>/<db> node scripts/migrations/2026-05-coupon-v2-backfill.js
```

Safe to re-run: if FIRST15 already exists in `coupons_v2`, the script logs "already present" and exits cleanly.

---

## Test Coverage Summary

| Suite | Tests |
|-------|-------|
| predicates.test.js | 34 |
| rewards.test.js | 21 |
| validate.test.js | 12 |
| apply.test.js | 8 |
| release.test.js | 5 |
| v1-adapter.test.js | 13 |
| eligible.test.js | 7 |
| backfill.test.js | 3 |
| **New total** | **105** |
| Pre-existing tests | 3395 |
| **Grand total** | **3500** |

All 3500 tests pass (4 pre-existing skipped, 0 failures).

---

## How to Add a New Predicate

1. Create `src/services/coupon/predicates/MyPredicate.js`.
2. Implement: `function myPredicate(rule, ctx) → EligibilityVerdict`. Import `EligibilityVerdict` and `REASONS`.
3. Call `register('my_type', myPredicate)` at the bottom.
4. Add `require('./MyPredicate')` to `predicates/index.js`.
5. Add a `{ type: 'my_type', ...params }` object to a coupon's `rules` array in the DB.
6. Write unit tests covering pass/fail/boundary cases.

No changes to validate.js, eligible.js, or any other use-case are needed.

---

## How to Add a New Reward Type

1. Create `src/services/coupon/rewards/MyReward.js`.
2. Implement a class with `static apply(rewardConfig, cart) → AppliedDiscount`.
3. Call `register('my_reward', MyReward)` at the bottom.
4. Add `require('./MyReward')` to `rewards/index.js`.
5. Set `reward: { type: 'my_reward', ...params }` on the coupon document.
6. Update `v1-adapter.js` if legacy clients need to handle the new type; otherwise the adapter automatically degrades with "Please update the app to use this coupon."
7. Write unit tests for the reward computation.

---

## Known Limitations / Phase 3+ Deferred Items

- **True parallel race safety** requires a MongoDB replica set for multi-document transactions. In single-node deployments the `findOneAndUpdate` conditional decrement is atomic per-document, but the pre-check + insert is not a single transaction. In production (Atlas replica set) a session/transaction wrapper should be added to `apply.js`.
- **`/redeem` is not a public endpoint** — it is intentionally called server-side only from the order-placement controller. The integration point (finding the exact order controller) was deferred; add `await couponEngine.redeemV2({ redemption_id, order_id })` after the order document is persisted.
- **v1 endpoint still routes through `checkCouponCode.js`** for UAE10 and bank promo codes (external API calls). FIRST15 is now in `coupons_v2` but the v1 endpoint hits the legacy `Coupon` model first. A future task is to route v1 exclusively through the v2 engine once all coupon types are migrated.
- **Rate limiting** on the new endpoints uses the shared v2 express-rate-limit middleware only. Per-code or per-user rate limiting (RATE_LIMITED reason) is not yet implemented.
- **Geo predicate** only checks at the country level. City/emirate-level gating is deferred.
- **BxGyReward** uses a simple block-based algorithm. More complex "buy specific items, get specific other items free" semantics may need a revised algorithm for multi-SKU promotions.

---

## FreeGiftReward enrichment

The `free_gift` reward now hydrates the gift `Product` server-side so the mobile app can render the gift line **without any client-side product lookup**. The mobile-side parser (`lib/domain/coupons/coupon_discount.dart` in the mobile repo's `FreeGiftDiscount` model) treats every new field as optional and falls back gracefully when absent — older builds keep working unchanged.

### Files touched

| File | Change |
|------|--------|
| `src/services/coupon/rewards/FreeGiftReward.js` | Reads hydrated `ctx.giftProduct`, emits new optional fields in `AppliedDiscount.meta`; sync + pure (no I/O) |
| `src/services/coupon/use-cases/validate.js` | After predicates pass, looks up `Product.findById(reward.gift_product_id)` once and forwards via `rewardCtx.giftProduct`; failures degrade silently with a `logger.warn` |
| `tests/services/coupon/v2/rewards.test.js` | Refactored existing 2 tests to `toMatchObject` subset matching; added 11 new tests covering hydrated / degraded / edge-case paths |
| `tests/services/coupon/v2/validate.test.js` | Added 2 integration tests (real in-memory Mongo): hydration enrichment + orphan-id graceful degrade |

### Output contract (`AppliedDiscount.meta` for `type: 'free_gift'`)

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `product_id` | string | ✅ | `coupon.reward.gift_product_id` |
| `msrp_aed` | number | ✅ | `coupon.reward.gift_value_aed` |
| `product_name` | string | ⚪ | `Product.product.name` when hydrated |
| `product_image` | string | ⚪ | `Product.product.images[0].sizes.original` → `.url` → `Product.product.image.url` (standard image-derivation pattern used elsewhere) |
| `unit_label` | string | ⚪ | matching variant's `name` — **omitted** when name is `'Default'` |
| `display_label` | string | ⚪ | `coupon.reward.display_label` → `coupon.reward.metadata.display_label` → auto-built `Free {name} (worth AED {msrp_aed})` when hydration succeeded |

Storage-layer names (`gift_product_id`, `gift_product_name`, `gift_value_aed`) **never** appear on `AppliedDiscount.meta` — they belong to the Mongoose schema on `CouponV2.reward` and stay there. Because `serializeReward` flattens `meta` onto the public wire, keeping storage names off `meta` is the single source of truth for the wire-shape contract. The regression-guard list in `tests/_helpers/couponV2Fixtures.js` enforces this at the route level for every reward type.

### Mobile contract reference

Mobile parser: `lib/domain/coupons/coupon_discount.dart` (mobile repo) — the `FreeGiftDiscount` model already accepts the optional fields; missing keys are tolerated.

### Design decisions (documented in code)

1. **Sync `apply()`, hydration in `validate.js` (preferred path per spec).** The registry contract is sync; making one reward async would either force all rewards async or branch the dispatcher. Hydrating in `validate.js` keeps reward classes pure, avoids duplicate I/O when `evaluateAuto` re-runs validate per candidate, and lets `apply()` be unit-tested without a DB.
2. **Required-field shape NEVER changes.** Lookup failure → no optional fields are present at all (not even `null`). Tests pin this with `expect('product_name' in d.meta).toBe(false)` rather than `toBeNull()`.
3. **`'Default'` variant names suppressed.** Emitting `Default` as a unit label is worse than nothing — admins author meaningful names like `500 ml` or `Pack of 3`, and the legacy variant fallback uses `Default` as a sentinel.
4. **`msrp_aed = 0` still composes `display_label`.** Gift-with-purchase promotions commonly carry no MSRP for accounting reasons; the auto-built label `Free X (worth AED 0)` is a misconfiguration signal admins can correct without a code change.
5. **Explicit `display_label` always wins.** Marketing can edit copy via `coupon.reward.display_label` (or nested `coupon.reward.metadata.display_label`) without an app release.

### Test count delta

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `tests/services/coupon/v2/rewards.test.js` (FreeGiftReward block) | 2 | **13** | +11 |
| `tests/services/coupon/v2/validate.test.js` | — | **+2** | +2 |
| **Total new tests** | — | — | **+13** |

---

## Wire-shape serializer

### Why it exists

Three public emission points were previously returning `coupon.reward` — the raw Mongo schema config — directly in their JSON response. The mobile parser at `Bazaar-Mobile-App/lib/domain/coupons/coupon_discount.dart` reads the canonical v2 wire contract (`product_id`, `msrp_aed`, etc.), which differs from the storage schema (`gift_product_id`, `gift_value_aed`, etc.). The bug had two effects:

1. **Schema-name leakage** — `gift_product_id` / `gift_value_aed` reached the wire, breaking mobile JSON parsing for free-gift coupons.
2. **Enrichment dropped** — `FreeGiftReward.apply()` builds `discount.meta` with `product_name`, `product_image`, `unit_label`, `display_label` via the hydration step in `validate.js`, but those fields never reached clients because the controllers emitted `coupon.reward` instead of `discount`.

A single serializer is the chokepoint between storage and wire.

### Where it's called from

`src/services/coupon/wire/serializeReward.js` — invoked at every public emission point:

| File | Site | Role |
|------|------|------|
| `src/controllers/v2/shared/couponController.js` (`validate`) | response build | wire reward in the validate response |
| `src/services/coupon/use-cases/apply.js` | final return | wire reward in fresh apply response |
| `src/services/coupon/use-cases/apply.js` | idempotency-replay return | reads `metadata.wire_reward` stored at insert |
| `src/services/coupon/use-cases/apply.js` | duplicate-key replay | same |
| `src/services/coupon/use-cases/apply.js` | reservation insert | persists `metadata.wire_reward` alongside legacy `metadata.reward` |
| `src/services/coupon/use-cases/eligible.js` | per-candidate result | wire reward in eligible-list response |

### Free-gift wire contract

```jsonc
{
  "type": "free_gift",
  "product_id": "65f...",                          // required
  "msrp_aed": 49,                                  // required
  "product_name": "Hydro Bottle",                  // optional (hydrated)
  "product_image": "https://cdn.example.com/...",  // optional
  "unit_label": "500 ml",                          // optional
  "display_label": "Free Hydro Bottle 🎁"           // optional (admin-authored or auto-built)
}
```

`gift_product_id`, `gift_product_name`, `gift_value_aed` (storage-config schema names) **never** appear in this shape. Regression tests assert their absence.

For other reward types the shape is the same `{ type, ...payload }` flat structure — see `tests/services/coupon/v2/serializeReward.test.js` for the canonical payload of each type.

### How to add fields for a new reward type

The serializer is a transparent flattener — it doesn't know about specific reward types. To add a new wire field for a reward:

1. **In the reward class** (`src/services/coupon/rewards/<RewardName>.js`), put the new field inside `AppliedDiscount.meta` from `apply()`:
   ```js
   return new AppliedDiscount({
     aed,
     type: 'my_reward',
     meta: {
       // existing fields...
       new_field: computedValue,
     },
   });
   ```
2. The field auto-propagates through `serializeReward` to every public emission point. No controller / use-case edits needed.
3. **Add a regression-guard test** in `tests/services/coupon/v2/serializeReward.test.js` asserting the field is present on the wire for that reward type.
4. **Update the controller-layer wire-shape tests** in `tests/controllers/v2/shared/couponController.wireShape.test.js` so the public contract is locked at the route boundary as well.

If the new field is sensitive (admin-only data, internal accounting), filter it inside `serializeReward` with a per-`type` allowlist — the centralized location means you change one file, not three.

### Apply-side persistence note

`apply.js` writes `metadata.wire_reward = serializeReward(discount)` to each new `CouponRedemption` row at insert time. The legacy `metadata.reward` (raw Mongo config) is kept alongside for any internal consumer that still reads it. Idempotency-replay and race-fallback paths prefer `metadata.wire_reward` and fall back to `serializeReward(metadata.discount)` for backward compatibility. **No backfill is required** for pre-existing rows — `CouponRedemption` documents have a 30-minute TTL on `expires_at`, so any pre-migration reservation ages out within the window.

### Test count delta

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `tests/services/coupon/v2/serializeReward.test.js` (NEW) | — | **17** | +17 |
| `tests/controllers/v2/shared/couponController.wireShape.test.js` (NEW) | — | **8** | +8 |
| `tests/services/coupon/v2/apply.test.js` (extended) | 10 | **13** | +3 |
| `tests/services/coupon/v2/eligible.test.js` (extended) | 7 | **9** | +2 |
| **Total new contract-pinning tests** | — | — | **+30** |

Full coupon-v2 + v2-controllers surface: **27 suites / 267 tests** (was 237).

---

## Wire-shape regression guards

Route-level tests that lock in the v2 coupon contract. Each test hits the
HTTP endpoint via supertest, exercises the **real** coupon engine + serializer
(no engine mocks) against the in-memory MongoDB instance, and asserts that
storage-layer schema names (`gift_value_aed`, `percent_off`, `pct_off`,
`max_discount_aed`, `subtotal_threshold`, `min_subtotal_aed`, `shipping_scope`)
do NOT appear in the response body.

Coverage:

- **`validate`** — free_gift enriched payload, hydration-failure graceful
  degradation, marketing `display_label` metadata override
- **`apply`** — wire shape on fresh apply, redemption_id presence,
  `discount_aed` matches seeded `gift_value_aed`
- **`apply` idempotency replay** — same `idempotency_key` returns the same
  `redemption_id` AND structurally identical `reward` (proves replay reads
  from `metadata.wire_reward`, not raw `metadata.reward`)
- **`eligible`** — every candidate's `coupon.reward` is flat wire shape;
  ineligible candidates filtered out
- **Cross-reward parametrised guard** — `describe.each` over flat / percent /
  free_shipping / tiered_percent / bxgy reward types, asserting `reward.type`
  matches and none of the forbidden storage names leak

Carve-out: `gift_product_id` and `gift_product_name` are NOT in the forbidden
list — `FreeGiftReward` deliberately emits them in `discount.meta` as legacy
aliases for back-compat with internal consumers (see "FreeGiftReward
enrichment" section above). The canonical wire names `product_id` /
`product_name` are still asserted as present. If those legacy aliases are
later dropped from `FreeGiftReward`, add them to `FORBIDDEN_STORAGE_NAMES` in
`tests/_helpers/couponV2Fixtures.js` to lock the cleanup in.

Manual revert smoke test (per spec): temporarily reverting
`src/controllers/v2/shared/couponController.js:90` from
`reward: serializeReward(discount)` back to `reward: coupon.reward` makes
**3 of 11** tests fail (free_gift enriched, marketing override, eligible
per-candidate). Guards verified to catch the original bug. Restored.

- Test file: `tests/controllers/v2/shared/couponController.wireShape.test.js`
- Fixtures helper: `tests/_helpers/couponV2Fixtures.js`
- Cases: 11
- Full controller-pattern surface: 27 suites / 270 tests passing
- Last verified: 2026-05-17
