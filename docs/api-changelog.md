# API Changelog

Behaviour-affecting backend changes that mobile and web teams should know
about. Reverse-chronological. Each entry is dated and scoped to the
endpoints affected.

---

## 2026-05-17 — PATCH /v2/me — phone uniqueness scope

**What changed.** Profile updates no longer reject when the new phone
number exists in the `Coupon` collection. Only collisions with another
**user**'s phone number block the update. The User-collision error
messages have also been refined to read clearly.

**Why.** The Coupon-collection collision check was misplaced. It caused
two real-user failures:

1. Social-login users (Google / Apple) who joined the app, later
   received a coupon issued to their phone, and then tried to add their
   phone to their account profile — rejected because the coupon's phone
   matched.
2. Users changing to a phone that had ever been used to claim a coupon
   under any account — same rejection.

The Coupon-phone check's actual intent (preventing one-per-phone signup
coupon gaming) is still served by the equivalent check in `signup.js`
for the mobile platform. That signup-side check is unchanged.

**Error-message refinement** (backend strings; the v2 client-facing
`userMessage` from `authErrorMap.js` was already correct):

| Was | Now |
|-----|-----|
| `Phone already exists in another user` | `This phone number is already linked to another account.` |
| `Email already exists in another user` | `This email is already linked to another account.` |

The misleading `Phone already exists in another user` message that the
old code raised for a Coupon-collection collision is gone — that path
no longer throws.

**Mobile impact.** None. The v2 `authErrorMap` maps the new backend
strings to the same `PHONE_ALREADY_REGISTERED` / `EMAIL_ALREADY_REGISTERED`
codes and the same client-facing `userMessage` strings that mobile
already renders.

**Web impact.** None. Web reads the same error map.

**Signup impact.** None. `signup.js` is untouched; the mobile-platform
Coupon-phone check there is preserved.

**Files touched.**

- `src/services/auth/use-cases/updateProfile.js` — removed Coupon-phone
  block; refined User-collision error messages
- `src/controllers/v2/_shared/authErrorMap.js` — patterns updated to
  match the new backend strings (codes + userMessage unchanged)
- `tests/controllers/v2/_shared/authErrorMap.test.js` — input strings
  updated to new wording
- `tests/services/authService.coverage.test.js` — User-collision
  assertion message tightened; new regression test added asserting a
  phone that exists only in the Coupon collection no longer blocks
  profile update

---

## 2026-05-17 — User.phone DB-level uniqueness

**What changed.** The `phone` field on the `User` collection now carries a
**unique + sparse** index at the database level. The service-layer
collision checks in `signup.js` and `updateProfile.js` remain as
defence-in-depth with friendly user-facing error messages; the DB index
catches any race between two simultaneous signups/updates that the JS
check might miss.

**Why.** Pre-fix, two clients hitting `POST /v2/auth/register` with the
same phone simultaneously could both pass the JS check, then both
insert. Duplicate-phone users were a latent inconsistency.

**Migration.** **MUST run before deploy** — Mongoose will fail to build
the unique index if duplicates already exist in the collection:

    # Dry-run — list duplicates without mutating
    node scripts/migrations/2026-05-user-phone-unique.js

    # Apply — null out older duplicates (keeps newest signup per phone)
    MONGODB_URI=... node scripts/migrations/2026-05-user-phone-unique.js --apply

**Mobile/web impact.** None on success path. On the rare race that the JS
check misses, the DB now returns an E11000 duplicate-key error which the
v2 error envelope maps to `PHONE_ALREADY_REGISTERED` (same code already
emitted by the JS-layer check).

---

## 2026-05-17 — POST /v2/me/addresses + PATCH /v2/me/addresses/:id — split

**What changed.** Address creation and update are now strictly split:

- **`POST /v2/me/addresses`** — **create only**. If the request body
  includes `_id`, the server returns `400 VALIDATION_ERROR` with message
  *"Use PATCH /me/addresses/:id to update an existing address."*
- **`PATCH /v2/me/addresses/:id`** — partial update. Body is an
  allowlisted patch of any subset of address fields plus the optional
  `primary` flag. Absent fields are left untouched. Replaces the previous
  primary-only `{ primary: true }` PATCH shape.

**Why.** The previous overload — `POST /v2/me/addresses` with `_id` in
body meaning "update that address" — conflated create and update on the
same verb, and the partial-update path couldn't change fields like
`mobile` or `city` without re-sending the whole address.

**Mobile/web impact (breaking).**

| Old call | New call |
|----------|----------|
| `POST /v2/me/addresses` body `{ _id, ...fields }` (update) | `PATCH /v2/me/addresses/:id` body `{ ...fields }` |
| `PATCH /v2/me/addresses/:id` body `{ primary: true }` (set primary only) | `PATCH /v2/me/addresses/:id` body `{ primary: true, ...optionalOtherFields }` |
| `POST /v2/me/addresses` body `{ ...fields }` (create) | unchanged |
| `DELETE /v2/me/addresses/:id` | unchanged |

Clients currently using `POST` with `_id` in body for updates **must**
migrate to PATCH or they will receive 400. The response shape (`{
addresses }` array) is unchanged across all four operations.

**Backend.** `services/order/use-cases/updateAddress.js` is the canonical
partial-update path. `setPrimaryAddress.js` is kept as a legacy alias
exported from `orderService` and `order/index.js` for any internal
caller that still references it; new code should use `updateAddress`.

---

## 2026-05-17 — PATCH /v2/me phone cascade to addresses

**What changed.** When a user updates their profile phone via `PATCH
/v2/me`, addresses in their saved address book whose `mobile` field
matched the **old** profile phone are automatically updated to the new
phone. Addresses with a deliberately different `mobile` value (e.g.
shipping to a family member's number) are intentionally left untouched.

**Why.** Before the cascade, updating the profile phone left every
saved address still pointing the delivery driver at the OLD number.
That's the wrong default — the common case is "I changed my number,
update everything that used to be me."

**Mobile/web impact.** None — purely a server-side behaviour change.
Clients calling `PATCH /v2/me { phone: '...' }` then re-fetching
`GET /v2/me/addresses` will see the cascaded values. No new request or
response fields. If clients want to opt **out** of the cascade (rare),
they can pre-flight `PATCH /v2/me/addresses/:id` to change the matching
address's `mobile` before changing the profile phone — but in practice
this isn't needed.

**Edge cases.**

- Old profile phone was `null` (social-login user adding their first
  phone): no cascade fires.
- An address's `mobile` differs from the old profile phone: untouched.
- An address's `mobile` matches the old phone exactly: updated to the new.

---

## 2026-05-17 — Nomod V1 routes retired + NOMOD_ENABLED env flag removed

**What changed.**

1. **V1 Nomod routes deleted.** Neither v1 web nor v1 mobile ever
   integrated Nomod — the surface was dead code. Deleted:
   - `POST /create-nomod-checkout` (ecommerce/public)
   - `POST /verify-nomod-payment` (ecommerce/public)
   - `POST /api/checkout-session-nomod` (mobile)
   - `GET /api/verify-nomod-payment` (mobile)
   - Their corresponding controller methods in
     `controllers/ecommerce/publicController.js` and
     `controllers/mobile/orderController.js`.

2. **`NOMOD_ENABLED` env flag retired.** Every place that read it has
   switched to the DB-backed `paymentMethodConfig.nomodEnabled`
   singleton (30s Redis cache):
   - `services/order/use-cases/getPaymentMethods.js` (v2)
   - `controllers/v2/mobile/configController.js` (v2)
   - The legacy `routes/mobile/configRoutes.js` was already going to
     stop advertising Nomod (v1 clients never integrated), so it now
     hardcodes `nomodEnabled: false` and `paymentMethods` never
     contains `'nomod'`.
   New shared helper: `src/services/payments/getPaymentRuntimeConfig.js`.

**Why.**

- The V1 Nomod surface was a dead route family. Carrying it forced ops
  to keep `NOMOD_API_KEY` and `NOMOD_ENABLED` env vars set for routes
  that nothing called.
- `NOMOD_ENABLED` env was redundant with the DB-backed
  `paymentMethodConfig.nomodEnabled` flag. The DB toggle is
  admin-controlled via `PATCH /v2/admin/payment-method-config`; the env
  flag was an older, deploy-required version of the same gate.
- Now all three providers (Stripe, Tabby, Nomod) follow the same
  two-tier model: env-var = "is it provisioned?", DB flag = "is it
  live right now?".

**Mobile/web impact.**

- **V1 mobile**: `GET /api/mobile/config` response shape unchanged —
  `nomodEnabled` field still present, always `false`; `paymentMethods`
  unchanged (never contained `'nomod'` in production anyway).
- **V2 mobile/web**: `GET /v2/config` and `GET /v2/payment-methods`
  return whatever the admin has set in `paymentMethodConfig.nomodEnabled`
  via the admin endpoint. Provisioning still requires `NOMOD_API_KEY`
  in env.

**Ops impact (one-time pre-deploy).**

Before deploying this commit, ensure `paymentMethodConfig.nomodEnabled`
in the DB matches whatever `NOMOD_ENABLED` env was set to in prod:

```bash
# If NOMOD_ENABLED was true:
curl -X PATCH https://<host>/v2/admin/payment-method-config \
     -H 'Authorization: Bearer <admin-token>' \
     -H 'Content-Type: application/json' \
     -d '{ "nomodEnabled": true }'

# If NOMOD_ENABLED was false or unset (most envs):
# No action needed — paymentMethodConfig.nomodEnabled defaults to false.
```

After deploy, ops can toggle Nomod live without a restart. The 30s
Redis cache means changes take effect within ~30 seconds.

The `NOMOD_ENABLED` env var can be removed from all environment files
in the same rollout — nothing reads it anymore.

---

## 2026-05-17 — V1 coupon validation is now case-insensitive everywhere

**What changed.** V1's `checkCouponCode` (the legacy `/check-coupon` path)
previously had two case-sensitive cracks:

1. The hardcoded `UAE10` branch used strict `===` against `"UAE10"`.
   Users typing `'uae10'` or `'Uae10'` fell through to the "not valid"
   path.
2. The personal-coupon lookup did
   `Coupon.findOne({ coupon: codeTrimmed, status: 'unused' })` — the
   legacy `Coupon` model has no `lowercase`/`uppercase` schema setting,
   so `'first15'` failed to match the stored `'FIRST15'`.

Both paths now normalise user input to uppercase for literal comparisons
and use a regex-`/i` lookup for the `Coupon` collection. The `BankPromoCode`
path was already correct.

**Why.** Mobile/web clients may not always upper-case before sending. The
asymmetry between BankPromoCode (case-insensitive) and personal coupons /
UAE10 (case-sensitive) caused silent "not valid" rejections for
otherwise-valid codes.

**V2 engine impact.** None — V2's `CouponV2` model already has
`lowercase: true, trim: true`, and `validate.js` defensively does
`String(code).toLowerCase().trim()` before the query. V2 has been
case-insensitive since the engine landed.

**Mobile/web impact.** Strict improvement — clients sending any
casing now succeed where they previously failed. Response shape
unchanged for the success path; failure path no longer rejects valid
codes due to casing.

**Defensive note.** The regex lookup escapes all regex special chars in
user input before constructing the pattern, so an adversarial input
like `'.*'` or `'first..'` cannot wildcard-match a real coupon. Locked
in by a regression test.

Files touched:
- `src/services/coupon/use-cases/checkCouponCode.js` — `codeUpper` +
  `codeRegex` normalisation; three branches updated
- `tests/services/couponService.test.js` — +4 case-insensitivity tests
  including the regex-injection guard

---

## 2026-05-17 — /v2/config — add bannersEnabled kill-switch

**What changed.** `GET /v2/config` now returns a top-level boolean
`bannersEnabled` inside `data`, alongside the existing
`minSupportedVersion`, `nomodEnabled`, and `paymentMethods`. Final wire
shape:

```jsonc
{
  "success": true,
  "data": {
    "minSupportedVersion": "1.0.33",
    "nomodEnabled": true,
    "bannersEnabled": true,            // ← new
    "paymentMethods": ["stripe", "tabby"]
  }
}
```

**Default value.** `true` (fail-open). Mobile already defaults to
`true` if the field is absent (see
`Bazaar-Mobile-App/lib/core/services/app_version_gate.dart` →
`AppVersionGate.remoteBannersEnabled`), and the server's missing-field
fallback path also returns `true`. Production rollout is safe — no
client sees a behaviour change unless an admin explicitly flips the
flag.

**Why.** Marketing needs a server-side kill-switch for the home banner
carousel without an app release — e.g., to hide a stale or broken
banner asset, or pause promotional rotation during inventory issues.

**Mobile impact.** Mobile reads `AppVersionGate.remoteBannersEnabled`
on app start and gates the home carousel on it. Fail-open semantics on
mobile mean missing field = banners visible, so production rollout is
safe.

**Web impact.** None today; web does not poll `/v2/config`.

**How operators flip it.** Mirrors the `nomodEnabled` toggle path:

```bash
# Hide the banner carousel
curl -X PUT https://<host>/v2/admin/payment-method-config \
     -H 'Authorization: Bearer <admin-token>' \
     -H 'Content-Type: application/json' \
     -d '{ "bannersEnabled": false }'

# Restore
curl -X PUT https://<host>/v2/admin/payment-method-config \
     -H 'Authorization: Bearer <admin-token>' \
     -H 'Content-Type: application/json' \
     -d '{ "bannersEnabled": true }'
```

Takes effect within ~30 seconds (Redis cache TTL). No deploy or
restart required.

**Implementation note.** The flag lives on the existing
`paymentMethodConfig` Mongo singleton — the same place `nomodEnabled`
lives. The collection / model name is "payment method config" for
historical reasons; it now also carries non-payment runtime flags.
Renaming + collection migration is deferred until there's a second
non-payment flag to justify the churn (one-off ad-hoc flag doesn't
yet warrant restructuring).

**Files touched.**

- `src/models/PaymentMethodConfig.js` — added `bannersEnabled` boolean
  with default `true` and a JSDoc block pointing at the mobile
  read-site
- `src/controllers/v2/admin/paymentMethodConfigController.js` —
  appended `'bannersEnabled'` to the `TOGGLEABLE_FIELDS` allowlist;
  validation error message auto-includes the new field
- `src/controllers/v2/mobile/configController.js` — emit
  `bannersEnabled` in the response with explicit fail-open fallback
  on missing/null/undefined/DB-unreachable
- `docs/openapi/v2.yaml` — added `bannersEnabled` to three locations:
  the `/v2/config` response schema, the `PaymentMethodConfig` shared
  schema, and the `PUT /v2/admin/payment-method-config` request body
- `tests/controllers/v2/mobile/configController.test.js` — extended
  `mockConfig` helper to accept `bannersEnabled`; added 5 cases
  covering true/false explicit values, missing-field fail-open,
  DB-unreachable fail-open, and typeof-boolean type guard

**Defensive guarantees** (locked in by tests):

- `data.bannersEnabled` is always strictly `typeof === 'boolean'`
  on the wire — never `undefined`, `null`, or a string.
- Missing-field, `null`, and `undefined` on the underlying DB doc all
  collapse to `true`.
- A DB-unreachable read failure on the bootstrap config endpoint
  returns `bannersEnabled: true` (200, not 500).

---

## 2026-05-17 — /v2/config — drop nomodEnabled + paymentMethods (use /v2/payment-methods)

**What changed.** `GET /v2/config` no longer returns `nomodEnabled` or
`paymentMethods`. Final response shape:

```jsonc
GET /v2/config →
{
  "success": true,
  "data": {
    "minSupportedVersion": "1.0.33",
    "bannersEnabled": true
  }
}
```

**Why.** Both removed fields were duplicates of what
`GET /v2/payment-methods` already exposes in a richer shape:

```jsonc
GET /v2/payment-methods →
[
  { "id": "stripe", "name": "Card",  "icon": "...", "enabled": true  },
  { "id": "tabby",  "name": "Tabby", "icon": "...", "enabled": true  },
  { "id": "nomod",  "name": "Nomod", "icon": "...", "enabled": false }
]
```

The string array on `/v2/config.paymentMethods` only carried provider
**ids** in display order, with no name/icon/enabled-flag — strictly less
expressive than `/v2/payment-methods`. The `nomodEnabled` scalar was
fully derivable from `paymentMethods.includes('nomod')`. Keeping
both/either created a drift risk: the only "correct" source of truth
was convention.

**Mobile impact.** Mobile already reads `GET /v2/payment-methods` for
the checkout-screen render — confirmed by the integration team. The two
fields removed from `/v2/config` were not read by any mobile build, so
removal is invisible to clients.

**Web impact.** None — web does not poll `/v2/config`.

**Endpoint scopes (post-cleanup).**

| Endpoint | Purpose |
|----------|---------|
| `GET /v2/config` | App-startup bootstrap: version gate + banner kill-switch |
| `GET /v2/payment-methods` | Checkout-screen provider list with id/name/icon/enabled |
| `PUT /v2/admin/payment-method-config` | Admin toggle for stripe/tabby/nomod/banners — drives both endpoints above |

Single-purpose endpoints; no overlap.

**Files touched.**

- `src/controllers/v2/mobile/configController.js` — handler simplified;
  `nomodEnabled` derivation and `paymentMethods` array build removed;
  the unused `process.env.NOMOD_API_KEY` / `TABBY_*` env reads removed.
  Net: ~20 lines deleted, ~4 lines added.
- `docs/openapi/v2.yaml` — `/v2/config` response schema slimmed to
  `{minSupportedVersion, bannersEnabled}` with `required` declared
  explicitly and a description pointing readers at `/v2/payment-methods`.
- `tests/controllers/v2/mobile/configController.test.js` — restructured
  into three describe blocks (wire envelope / minSupportedVersion /
  bannersEnabled); old nomod and payment-methods cases removed; new
  regression guard added: `Object.keys(body.data)` must equal
  `['bannersEnabled', 'minSupportedVersion']` (locks the contract — if
  either field reappears, this test catches it).
