# Bazaar backend docs

Living documentation for the backend. One-time audits and sprint
artifacts are under [`archive/`](archive/).

## Read these first

| Doc | What it covers |
|-----|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture — bounded contexts, request flow, deployment topology |
| [SERVICES.md](SERVICES.md) | Service modularisation map — what lives under `src/services/<domain>/` |
| [V2_URL_CONTRACT.md](V2_URL_CONTRACT.md) | Canonical v2 URL surface (final post-3-wave REST cleanup) + per-wave migration brief for mobile / web teams |
| [MOBILE-VERSION-COMPATIBILITY.md](MOBILE-VERSION-COMPATIBILITY.md) | The v1-frozen / v2-evolves policy. Read this before changing any endpoint shape. |
| [api-changelog.md](api-changelog.md) | Dated behaviour-affecting changes mobile / web teams should know about |

## Reference

| Doc | What it covers |
|-----|----------------|
| [CONFIG.md](CONFIG.md) | Env-var configuration + `src/config/runtime.js` field map |
| [CACHING.md](CACHING.md) | Redis layout, key conventions, TTL policies |
| [DEPLOYMENT_MAP.md](DEPLOYMENT_MAP.md) | Production deployment topology, env-var sources, rollback procedure |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Pre-deploy checklist + env-var inventory |
| [COVERAGE_BASELINE.md](COVERAGE_BASELINE.md) | Test-coverage baseline (snapshot — see file header for the dated freeze) |
| [BUGS.md](BUGS.md) | Active bug tracker (BUG-NNN format) |

## Subsystems

| Path | Topic |
|------|-------|
| [openapi/v2.yaml](openapi/v2.yaml) + [openapi/README.md](openapi/README.md) | OpenAPI 3 spec for v2 routes |
| [api-map/MAP.md](api-map/MAP.md) | Full v1 + v2 endpoint inventory |
| [architecture/repository-layer.md](architecture/repository-layer.md) | The `BaseRepository` + per-model accessor pattern |
| [v2-auth/](v2-auth/) | V2 auth design: state machine, token contract, threat model, error catalog, migration |
| [payments/PAYMENT-FLOW-DESIGN.md](payments/PAYMENT-FLOW-DESIGN.md) | Stripe / Tabby / Nomod flow design |
| [vendor/nomod/](vendor/nomod/) | Nomod API reference + gap analysis |

## Historical

| Path | What's there |
|------|--------------|
| [archive/2026-q2-v2-migration/](archive/2026-q2-v2-migration/) | One-time audits produced during the v2 API unification sprint (login flows, payment parity, v1 backcompat verification, mobile-build prod audit). Superseded by the living docs above. |

## Convention

- **Living docs** at top level — current, edited, the source of truth.
- **Subsystem docs** in their own dirs — auth, payments, OpenAPI, etc.
- **Archive** under `archive/YYYY-qN-<topic>/` — frozen at archival, never edited.

If a doc starts to bit-rot or refers to behaviour that has been
superseded, move it to `archive/` rather than deleting. Add a new
living doc at the top level for the current state, and link back to
the archive for context.
