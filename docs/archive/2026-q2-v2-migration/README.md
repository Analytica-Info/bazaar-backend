# 2026-Q2 V2 migration audits (archived)

One-time audits produced while landing the v2 API unification. Each
file is a snapshot from a specific commit; none are kept current
post-archival. For the current state of v2, see:

- [`docs/V2_URL_CONTRACT.md`](../../V2_URL_CONTRACT.md) — canonical v2 URL surface + per-wave migration brief
- [`docs/api-changelog.md`](../../api-changelog.md) — dated behaviour changes (post-archive)
- [`docs/MOBILE-VERSION-COMPATIBILITY.md`](../../MOBILE-VERSION-COMPATIBILITY.md) — the v1-frozen / v2-evolves policy

## Contents

| File | What it was |
|------|-------------|
| [V1-BACKCOMPAT-FINAL-AUDIT.md](V1-BACKCOMPAT-FINAL-AUDIT.md) | Final verification that all 35 v1 paths stayed mounted on the v2 branch |
| [V2-MIGRATION-GAPS-VERIFICATION.md](V2-MIGRATION-GAPS-VERIFICATION.md) | Coverage matrix of v1 endpoints → v2 equivalents |
| [MOBILE-V1-BACKCOMPAT-AUDIT.md](MOBILE-V1-BACKCOMPAT-AUDIT.md) | Per-endpoint parity check for mobile-app read sites |
| [MOBILE-FINAL-PROD-AUDIT.md](MOBILE-FINAL-PROD-AUDIT.md) | Mobile-build pre-release verification against the v2 branch |
| [LOGIN-AUDIT.md](LOGIN-AUDIT.md) | Inventory of all 27 v1 login flows that motivated v2 auth |
| [CRITICAL-FLOWS-AUDIT.md](CRITICAL-FLOWS-AUDIT.md) | Cart / checkout / payment-flow shape parity audit |
| [MAGIC-NUMBERS-AUDIT.md](MAGIC-NUMBERS-AUDIT.md) | Inventory of hardcoded values that moved into `runtime.js` config |
| [PAYMENT-FLOWS-MAIN-VS-BRANCH-AUDIT.md](PAYMENT-FLOWS-MAIN-VS-BRANCH-AUDIT.md) | Stripe/Tabby/Nomod flow diff vs main pre-v2 |

These files reference each other extensively. Internal links between
them still resolve because they all moved together.
