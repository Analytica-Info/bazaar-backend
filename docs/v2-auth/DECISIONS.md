# v2 Auth Decisions

> Status: STRAWMAN. Every recommendation is opinionated by design. The point of a strawman is to give the team something concrete to argue with.
> See [README.md](./README.md) for the full pack.

Twelve decisions. For each: question, options, **recommendation**, rationale.

---

## D1. Sessions: stateless or stateful?

**Q:** Should v2 trust the JWT in isolation (stateless) or maintain a server-side session record per refresh family (stateful)?

**Options:**
- *Stateless JWT only* — pure verification, no DB lookup. Fast, scales trivially. Cannot revoke individual sessions before expiry without bumping `tv` for the entire user.
- *Stateful (every request hits Redis)* — strong control, but adds a hot-path dependency for every authenticated call.
- *Hybrid: stateless access tokens + stateful refresh families* — short-lived access tokens verified by signature only; refresh and session-management endpoints consult Redis.

**Recommendation: Hybrid (stateful refresh families, stateless access).**

**Rationale:** 15-minute access tokens make signature-only verification acceptable for the worst-case revocation window. Refresh and session-listing endpoints consult Redis, which gives us per-device logout, reuse detection (BUG-048), and a real session inventory. We avoid a Redis lookup on every API call but get the security properties of stateful auth.

<!-- REVIEW: The team will argue we should also revoke access tokens immediately on logout-all. Current proposal: 15-minute eventual consistency window. If unacceptable, we add a denylist of revoked jti's checked on every request — pay the per-request Redis cost. Not free, not unreasonable. Decide explicitly. -->

---

## D2. Token transport: cookie, bearer, or both?

**Options:**
- *Cookie only* — SameSite=Strict httpOnly cookies. Best for web. Awkward for mobile (manual cookie jar) and breaks bearer-style integration tests.
- *Bearer only* — `Authorization: Bearer …`. Trivial for mobile and SDKs. Forces web into XSS-exposed `localStorage` or in-memory storage that drops on refresh.
- *Both, picked at login.*

**Recommendation: Both, picked at login via `tokenDelivery` field.**

**Rationale:** Web clients send `tokenDelivery: "cookie"`; the response Set-Cookies httpOnly tokens and returns `{ user }` with no token bodies. Mobile clients send `tokenDelivery: "bearer"`; tokens come back in the response body. This lets each client use its native idiom without bifurcating the endpoint set.

<!-- REVIEW: Some shops insist cookies are always wrong because of CSRF. We mitigate with SameSite=Strict + a CSRF token on state-changing routes (BUG-051). Cookie advocates will say SameSite alone is sufficient on modern browsers; conservatives will demand double-submit. Document the cookie+CSRF combo as the web default and move on. -->

---

## D3. Refresh token rotation?

**Options:**
- *No rotation* — long-lived refresh, easy to implement, easy to steal.
- *Rotation without reuse detection* — issue new refresh on every refresh call. Detects nothing if attacker silently uses old token in parallel.
- *Rotation with reuse detection (revoke family on replay).*

**Recommendation: Rotation with reuse detection — revoke the entire family on replay.**

**Rationale:** Closes BUG-048. When a retired refresh token is presented, both the legitimate user and the attacker have a copy; we cannot tell which. Killing the family forces re-auth and surfaces the compromise as a login event. Industry standard (RFC 6819 §5.2.2).

---

## D4. MFA in v2 or later?

**Options:**
- *Defer MFA to v3* — ship v2 simpler, retrofit later.
- *Contract supports MFA day one; enforcement opt-in per user.*
- *Mandatory MFA at launch* — best security, worst rollout pain.

**Recommendation: Contract supports MFA from day one; enforcement is opt-in per user.**

**Rationale:** Adding MFA later means re-shaping the login response (ambiguous "did login succeed or do I need a second factor?"). We pay the contract cost once now: every login can return `{ status: "mfa_required", challengeToken }` instead of tokens. Enforcement starts as a per-user toggle so power users opt in early; we make it default-on for staff/admin scopes.

<!-- REVIEW: TOTP-only at launch. SMS is rejected (SIM-swap, telco cost, OTP-fishing). WebAuthn deferred to v3 — most users have no hardware key. Some team members will argue SMS is what users expect. Hold the line: TOTP + recovery codes is the floor. -->

---

## D5. OIDC compliance level?

**Options:**
- *Full OIDC provider* — `/.well-known/openid-configuration`, JWKS endpoint, userinfo. Heaviest lift; only useful if third parties federate against us.
- *Pragmatic: borrow OIDC claim names; no public discovery/JWKS.*
- *Custom claims* — pretend OIDC doesn't exist.

**Recommendation: Pragmatic — adopt OIDC claim names (`iss`, `sub`, `aud`, `iat`, `exp`, `nonce` where relevant), but no public discovery, no JWKS endpoint.**

**Rationale:** Standard claim names cost nothing and give us optionality if we ever federate. JWKS + discovery is overkill for a closed system where no third party verifies our tokens. We can add it later — kid-based rotation works the same with or without a JWKS endpoint.

---

## D6. Account model: single-credential or multi-method?

**Options:**
- *Single-method per account* — separate accounts for "Google sign-in" vs "email/password". User confusion guaranteed.
- *Multi-method, attached by verified email match.*

**Recommendation: Multi-method. Google + Apple + email/password attach to one account when the email is verified-equal.**

**Rationale:** Users do not understand "you signed up with Google last time, this is a different account." Apple and Google attest the email; we trust those attestations. For password→OAuth merge we require the password to be successfully validated within the merge flow. Apple's private-relay emails are tracked as a stable per-app identity even when display email is hidden.

<!-- REVIEW: There is a real edge case where an attacker controls a Google account whose email matches a victim's password account. We require proof-of-control of the password account before merging. Some will argue we should never auto-merge — force the user to explicitly link from settings. Defensible position. The strawman picks auto-merge-on-OAuth-when-verified-email-matches because it's the better UX; we can flip it. -->

---

## D7. JWT signing algorithm?

**Options:**
- *HS256* — symmetric, simple. Current v1 default. Anyone with the key can mint tokens.
- *RS256* — asymmetric, well-supported, reasonable token size.
- *EdDSA / Ed25519* — smallest, fastest, modern. Library support is improving but not universal.

**Recommendation: RS256.**

**Rationale:** Closes BUG-047 (algorithm not pinned) and BUG-049 (shared signing key for code tokens) by separating signing keys. RS256 is mature in `jsonwebtoken`, Go, Swift, Kotlin — every client we care about. EdDSA is technically nicer but not worth the library-compatibility risk for marginal speed wins.

---

## D8. Key rotation policy?

**Options:**
- *No rotation* — keys live forever. Bad.
- *Manual rotation only when compromised.*
- *Scheduled rotation with `kid` claim and overlapping validity.*

**Recommendation: `kid` claim + keystore; quarterly rotation default; old key retained one refresh-TTL (90 days) past replacement.**

**Rationale:** Closes the operational half of BUG-050. Each token carries `kid`. The verifier loads the matching public key from a keystore. Rotation publishes a new active key; old keys remain verifiable until the longest-lived refresh token would have expired. Quarterly is a tradeoff — frequent enough to limit blast radius, rare enough to be operationally cheap.

---

## D9. Password policy?

**Options:**
- *Complexity rules (1 upper, 1 number, 1 symbol)* — empirically pushes users to predictable transformations.
- *Length-only with a sane minimum.*
- *Length + breach check via HIBP.*

**Recommendation: ≥12 chars, any char up to 128, optional HIBP check at signup/reset.**

**Rationale:** Aligns with NIST SP 800-63B. Composition rules are anti-pattern. HIBP via k-anonymity API costs almost nothing and blocks the worst common passwords. Make HIBP advisory at signup (warn + soft-block top-N), advisory-only at reset (warn but allow).

<!-- REVIEW: Product will push back on 12 chars as too long. The honest answer is users who type a 10-character password will type a 12-character one. Hold the line. -->

---

## D10. Rate limit philosophy?

**Options:**
- *Fixed window* — simple, vulnerable to burst-at-window-edge.
- *Sliding window — per-IP for unauth, per-account for auth.*
- *Token bucket* — flexible, harder to reason about.

**Recommendation: Sliding window. Per-IP keys for endpoints that don't have a known account (signup, login attempts, forgot-password). Per-account keys once we know who they are (refresh, MFA verify, password change).**

**Rationale:** Per-IP only is too coarse (NAT, mobile carriers); per-account only fails on credential-stuffing where attacker hits many accounts from one IP. Combined keys + sliding window covers both. Specific limits in [CONTRACT.md](./CONTRACT.md).

---

## D11. Backwards-compat surface during migration?

**Options:**
- *Hard cutover* — flip one day. Catastrophic risk.
- *v1 frozen, v2 net-new at `/v2/auth/*`; clients pick per-call.*
- *Adapter on v1 that forwards to v2 internally* — hides the migration but means v1 keeps changing, breaking the freeze.

**Recommendation: v1 endpoints frozen, v2 net-new at `/v2/auth/*`; clients pick per-call via flag.**

**Rationale:** Aligns with [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md). v1 contracts never change. Each client (web, admin, mobile) migrates per its own schedule. See [MIGRATION.md](./MIGRATION.md) for per-client cutover plans.

---

## D12. Multi-region?

**Options:**
- *Multi-region from day one* — premature for current scale.
- *Single-region now; design assumes future multi-region.*
- *Single-region forever* — assumes scale never demands it.

**Recommendation: Single-region for now; design assumes multi-region; document the upgrade path.**

**Rationale:** Today: one Redis, one DB, one signing-key set. Tomorrow: regional Redis with primary-replica replication for sessions, regional DB read replicas, signing keys distributed via secret manager (not hand-rolled env vars) so all regions verify the same `kid`. Cookie domain stays `.bazaar-uae.com` so a future EU origin works without cookie domain changes. The cost of designing for this now is low; the cost of retrofitting is high.

<!-- REVIEW: "Single-region forever" is the genuinely sensible position if we expect to stay <10M users. Multi-region adds operational pain (clock skew on session expiries, replication lag on session revoke). The strawman assumes we'll eventually want it. Worth challenging. -->
