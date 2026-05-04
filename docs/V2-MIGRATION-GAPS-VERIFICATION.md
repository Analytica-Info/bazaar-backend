# V2 Migration Gaps — Backend Verification Stamp

> Cross-reference: `bazaar-web/docs/V2_MIGRATION_GAPS.md` (web team's source-of-truth list)
>
> Verified against: `bazaar-backend@feat/v2-api-unification` HEAD
>
> Verification date: 2026-05-04
>
> Verifier: backend audit (route registry diff)

## Result

**All 35 v1 endpoints listed in `V2_MIGRATION_GAPS.md` are PRESENT on this branch.** The doc is accurate and complete; the web team's migration plan is unblocked. The frozen-v1 policy held through 30+ refactor PRs and the recent merge from main.

## Per-section verification

| Web doc section | Endpoints | All present on backend? |
|---|---|---|
| 1. CMS surface | 13 | Yes |
| 2. Coupons | 5 | Yes |
| 3. Public shipping | 3 | Yes |
| 4. Home rails / discovery | 9 | Yes |
| 5. Public review | 1 | Yes |
| 6. Marketing / public forms | 3 | Yes |
| 7. Stripe card verify | 1 | Yes |
| **v1 total** | **35** | **All present** |
| 8. BUG-016 phantom (v2 path) | 1 | Confirmed missing — never added — see BUG-016 |

## Inverse check — has v2 grown new equivalents the web team missed?

No. Scanning the v2 route table (60 routes) on this branch:

- No `/v2/cms*` paths exist.
- No `/v2/coupon*` or `/v2/check-coupon` paths exist.
- No `/v2/shipping*` paths exist.
- No home-rails endpoints under `/v2/products` (which covers list/details/search/similar/categories only).
- `/v2/user/reviews` exists but is authenticated — no v2 equivalent for the public `GET /review` used on product-detail pages.
- No `/v2/contact*`, `/v2/newsletter*`, or public `/v2/delete-account*` paths exist.
- v2 verify endpoints cover Nomod and Tabby only — no `/v2/verify-card-payment`.

The web team's "no v2 equivalent" claim is correct in every section.

## Implications for the web migration

1. **Hybrid mode is the correct migration shape.** Web migrates auth, cart, orders, products, user, wishlist, notifications to v2 today. Stays on v1 for CMS, coupons, shipping, home rails, public review, marketing, Stripe verify — until backend extends v2.
2. **No v1 endpoint will silently disappear** when this branch deploys. The verification confirms every path the web doc enumerates is still mounted.
3. **BUG-016 must be resolved web-side** before any prod deploy of this branch. The phantom `POST /v2/recommendations/events` call from `bazaar-web/src/services/recommendations.js:52` will 404 every time a user mounts a recommendation widget. Web team's choice: remove the file (if dead) or feature-flag it off (if reachable). Backend will NOT add the route ahead of the v2 rollout per project policy.

## Forward-looking — backend action items from the web doc

The web doc closes with 7 items where it would like backend to extend v2:

1. CMS routes (or document that CMS stays on v1 indefinitely)
2. Coupon flow (5 endpoints under `/v2/coupons` or similar)
3. Public shipping (3 endpoints under `/v2/shipping` or similar)
4. Home rails — single `/v2/home/summary` consolidation (9 v1 calls → 1 v2 call)
5. Public review list (`GET /v2/products/:id/reviews`)
6. Public newsletter + contact-us
7. Stripe card verify (or formally retire — webhook-only)

These are **future v2 work**, not migration blockers. Track each in the v2 design pack (`docs/v2-auth/` is auth-specific; equivalent design docs for CMS / coupons / shipping / home / reviews would be the next deliverables when the team prioritises them).

## Cross-references

- `bazaar-web/docs/V2_MIGRATION_GAPS.md` — the verified document
- `docs/api-map/MAP.md` — full v1/v2 endpoint inventory with V2-DEV markings
- `docs/MOBILE-VERSION-COMPATIBILITY.md` — v1-frozen policy
- `docs/MOBILE-V1-BACKCOMPAT-AUDIT.md` — parallel backward-compat audit for mobile
- `docs/BUGS.md` BUG-016 — the v2 phantom call
