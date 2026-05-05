# v2 Auth Design Pack

> **Status:** STRAWMAN — pending team review
> **Branch:** `feat/v2-api-unification`
> **Owner:** Backend platform
> **Last updated:** 2026-05-01

## Elevator pitch

Bazaar's v1 auth surface is frozen forever per [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md). Every auth improvement — refresh-token rotation, MFA, key rotation, session inventory, OIDC-shaped claims, CSRF defenses — ships in a clean parallel surface at `/v2/auth/*`. v2 auth is **stateful** (JWT access + Redis-backed session record), **multi-method** (password + Google + Apple attach to one account by verified email), and **client-aware** (web prefers cookies, mobile prefers bearer; selected at login time). It is dual-token (access + refresh) with rotation and reuse detection, RS256-signed with `kid` rotation, and ships an MFA-capable contract from day one even if enforcement starts opt-in.

This pack is the strawman the team will argue with before any line of v2 code lands beyond the dev-only skeleton already merged.

## Index

| # | Doc | Purpose |
|---|-----|---------|
| 1 | [README.md](./README.md) | This file. Index, glossary, status. |
| 2 | [DECISIONS.md](./DECISIONS.md) | 12 architecture/security/operational decisions with rationale. |
| 3 | [CONTRACT.md](./CONTRACT.md) | Per-endpoint request/response/error contract for `/v2/auth/*`. |
| 4 | [TOKENS.md](./TOKENS.md) | JWT claims, signing, kid rotation, cookie attributes, code tokens. |
| 5 | [STATE-MACHINE.md](./STATE-MACHINE.md) | Login state machine — diagrams + transition table + walkthroughs. |
| 6 | [ERROR-CATALOG.md](./ERROR-CATALOG.md) | All v2 auth error codes (catalogued and stable). |
| 7 | [MIGRATION.md](./MIGRATION.md) | Per-client v1 → v2 cutover plan and rollback. |
| 8 | [THREAT-MODEL.md](./THREAT-MODEL.md) | STRIDE-ish threat model, mitigations, accepted risks, tabletops. |

## Glossary

| Term | Meaning |
|------|---------|
| **Access token** | Short-lived (15 min) JWT bearer credential. `typ: "access"`. Authorizes API calls. |
| **Refresh token** | Long-lived (30d web / 90d mobile) JWT used only at `/v2/auth/refresh`. `typ: "refresh"`. Rotates on every use. |
| **Code token** | Narrow-purpose, short-lived JWT for password reset, email verify, MFA challenge handoff. `typ: "code:*"`. Signed with a different key than session tokens (BUG-049). |
| **MFA challenge token** | A code token issued after a successful first-factor that authorizes the next call to `/v2/auth/mfa/verify`. `typ: "code:mfa-challenge"`. |
| **Session** | A row in the `auth_session` Redis-backed store keyed by `family_id`. Tracks active refresh-token family for revocation, reuse detection, and inventory. |
| **kid** | JWT header field naming the public key used to sign. Enables key rotation without breaking in-flight tokens. |
| **jti** | JWT ID. Unique per-token; required for revocation and replay detection. |
| **iss / aud** | Issuer (`https://api.bazaar-uae.com`) and Audience (`bazaar-web`, `bazaar-mobile`, `bazaar-admin`) — pin tokens to environment + client. |
| **tv** | Token version. Bumped when the claim shape changes incompatibly so old clients can be rejected cleanly. |
| **family_id** | Refresh-token family identifier. All rotated children share one family; reuse of a retired child revokes the whole family. |
| **scope** | Space-delimited capability list. Initially: `user`, `admin`, `delete:account`. |
| **tokenDelivery** | Login-time client preference: `cookie` (web default) or `bearer` (mobile default). Determines whether `/v2/auth/login` Set-Cookies or returns tokens in body. |
| **HIBP** | Have I Been Pwned — k-anonymity password-breach API used optionally at signup/reset. |

## Cross-references

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — overall system architecture; v2 auth lives in the auth bounded context.
- [`docs/MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md) — v1 freeze policy; v2 versioning strategy.
- [`docs/LOGIN-AUDIT.md`](../LOGIN-AUDIT.md) — current v1 login surface findings that motivated v2.
- [`docs/BUGS.md`](../BUGS.md) — open bugs BUG-035, BUG-047, BUG-048, BUG-049, BUG-050, BUG-051. **All resolved by v2.**
- **OpenAPI spec**: [`docs/openapi/v2.yaml`](../openapi/v2.yaml) — machine-readable contract for all 60 v2 routes.
- **Live API docs**: `GET /v2/docs` (Swagger UI) and `GET /v2/openapi.json` (raw spec) — start the server with `V2_ENABLED=true` and visit [http://localhost:5000/v2/docs](http://localhost:5000/v2/docs).
- **OpenAPI guide**: [`docs/openapi/README.md`](../openapi/README.md) — how to update the spec, run the parity guard, generate a typed SDK.
- Code:
  - `src/routes/v2/{web,mobile}/authRoutes.js` — current dev-only v2 routes.
  - `src/controllers/v2/{web,mobile}/authController.js` — controllers (will be regenerated to match this contract).
  - `src/controllers/v2/_shared/responseEnvelope.js` — `wrap`/`wrapError`/`paginated` (envelope this contract assumes).
  - `src/services/auth/` — use-cases, domain, adapters, ports.

## How to read this pack

Read in order on first pass: **DECISIONS → STATE-MACHINE → TOKENS → CONTRACT → ERROR-CATALOG → MIGRATION → THREAT-MODEL**. The README is just the map.

Look for `<!-- REVIEW: ... -->` HTML comments — those are the spots where I expect the team will push back. Each one is a real disagreement worth having before code lands.
