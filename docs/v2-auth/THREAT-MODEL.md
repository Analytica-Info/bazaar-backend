# v2 Auth Threat Model

> Status: STRAWMAN. See [README.md](./README.md).
> Approach: lightweight STRIDE on the v2 auth surface. Not a full pen-test plan.

---

## Threat actors

| Actor | Capability | Motivation |
|-------|------------|------------|
| **Opportunistic attacker** | Public scraping, credential stuffing with breached lists, automated tools. | Account takeover at scale; resell. |
| **Targeted attacker** | Knows a specific user; phishing, SIM swap, social engineering of support. | Steal that user's account or data. |
| **Malicious insider** | Engineering or support access to internal systems. | Read PII, mint tokens, escalate. |
| **Compromised dependency** | Hostile npm package, hostile OAuth provider key. | Indirect code execution, mass token forgery. |

---

## Attack surfaces

| Surface | Notes |
|---------|-------|
| `/v2/auth/login`, `/signup` | Anonymous; rate-limit-bound. |
| `/v2/auth/oauth/*` | Trust depends on Google/Apple JWKS verification correctness. |
| `/v2/auth/refresh` | Highest-value endpoint behind first-factor; family revocation hinges on this. |
| `/v2/auth/password/{forgot, verify-code, reset}` | Email-based out-of-band; vulnerable to email-account compromise. |
| `/v2/auth/mfa/verify` | TOTP brute force surface; rate-limit critical. |
| Access JWT in transit | TLS only. Bearer logs are a risk if logged unredacted. |
| Refresh JWT at rest | Mobile keychain / web httpOnly cookie. |
| Cookies | XSS exfiltrates non-HttpOnly cookies; CSRF abuses ambient cookies. |
| Session store (Redis) | Compromise = mass session takeover capability. |
| Signing keys | Compromise = mass token forgery. |
| Email transport | Reset codes, verify links — out-of-band channel that must remain trustworthy. |

---

## Mitigations matrix

| Threat | Control | Where |
|--------|---------|-------|
| Credential stuffing | Per-account + per-IP sliding window rate limit; lockout after 10 fails / 15 min | Login, password-reset code |
| Brute-force TOTP | 5 attempts per challenge; challenge token TTL 5 min; per-account hourly cap | `/mfa/verify` |
| Token replay (refresh) | Family rotation + reuse detection; reuse → revoke family | `/refresh` |
| Token replay (code) | `purpose_nonce` consumed atomically | All `code:*` |
| Algorithm confusion | RS256 pinned in verifier allow-list; reject `alg: none` | Token verifier |
| Mass forgery via key leak | Two key families (session vs. code) + quarterly rotation + `kid` lookup | `tokenIssuer.js` |
| CSRF | SameSite=Strict + double-submit token (`bz_csrf` cookie + `X-CSRF-Token` header) | All state-changing cookie-mode endpoints |
| XSS exfiltrating tokens | HttpOnly on `bz_at`/`bz_rt`; CSP `script-src` strict; no `eval` | Web client + server response headers |
| OAuth token forgery | Verify against provider JWKS; pin our `aud`; pin provider `iss`; reject `email_verified=false` | `/oauth/google`, `/oauth/apple` |
| OAuth email squatting | Auto-merge only on verified email; password merge requires successful pwd auth | OAuth handlers |
| Session takeover via Redis compromise | Sessions store only opaque ids and metadata, never raw tokens; signing keys not in Redis | Session store |
| Email pipeline takeover | DMARC/DKIM/SPF on outbound; reset codes 6 digits + 15-min TTL + 5-attempts cap | Mail provider config |
| Phishing | MFA + (long-term) WebAuthn; explicit "recent activity" UI showing sessions | `/sessions` UI |
| Insider key access | Keys in env vars now → KMS later; audit access logs | Operational |
| Account enumeration | `/forgot` always returns "sent: true"; signup conflict still discloses (deliberate UX choice — login surface does not) | `/password/forgot` |
| Soft-deleted account access | Lock at delete time; revoke families; scope to `disabled` for 30-day recovery window | Account delete flow |

---

## Accepted risks

These are explicitly known and not mitigated in v2.

| Risk | Why accepted |
|------|--------------|
| **No FIDO2 / WebAuthn** | User base does not have hardware keys; v2 is already a large surface change. Plan for v3. |
| **Access tokens cannot be revoked instantly across all users** | Adding a per-request denylist costs Redis latency on every authenticated call. We accept up to 15-minute eventual consistency on revocation. Logout-all is best-effort instant for the cookie/refresh side; access tokens expire naturally. |
| **Signup discloses email-already-exists** | UX win; the equivalent is achievable from `/login` anyway with timing analysis. We do not pretend to mitigate enumeration on signup. |
| **No phishing-resistant auth** | TOTP is phishable. We accept this for v2. |
| **No device attestation** | We do not bind sessions to platform-attested device identities. Acceptable for current threat model. |
| **Redis is single-region** | Multi-region replication and the resulting clock-skew complexity are deferred. |
| **Code tokens travel through email** | Email is partially trusted. We rely on the user's email security; we do not encrypt code tokens beyond TLS. |

---

## Tabletop scenarios

### Tabletop 1: Attacker steals a refresh token from user device

**Setup:** A targeted user's mobile keychain is exfiltrated (e.g. malicious app with elevated entitlements, or device theft pre-lock). Attacker has a valid refresh token.

**Attack progression:**
1. Attacker calls `/v2/auth/refresh`. Gets new pair. (No alert yet — looks like the user.)
2. Legitimate user opens app later, hits `/refresh` with what they believe is current refresh.
3. Their token is now retired in Redis. **Reuse detected.** Family is revoked. Both parties get `TOKEN_REUSE_DETECTED`.
4. User is forced to log back in (with password ± MFA). Attacker's token also stops working.

**Detection:** `TOKEN_REUSE_DETECTED` event fires. Audit log records both jti's. Security email to user: "We detected reuse on your session and signed you out — please review recent activity." User can review `/sessions` and reset password.

**Coverage:** Family rotation + reuse detection (D3) + audit logging. **Holds.**

**Gaps:** If attacker uses the refresh exactly when the user is offline for ≥30 days (refresh TTL), the user never triggers reuse detection. Mitigated by `/sessions` UI and proactive nudges from the device-id heuristic ("we see a new device in Manila — was that you?").

### Tabletop 2: Attacker brute-forces password reset code

**Setup:** Attacker knows the victim's email. They trigger `/password/forgot`. A 6-digit code is sent. Attacker tries to guess it.

**Attack progression:**
1. Attacker hits `/password/verify-code` with guesses.
2. Per-email rate limit: 5 / hour. Attacker burns 5 in seconds.
3. Wait an hour, 5 more. At 5 per hour, expected guesses to crack 6-digit (1M space) at random: ~100k hours = >10 years.
4. Code itself expires in 15 min, so each "session" of guessing has 5 attempts max before code expires.

**Coverage:** Code TTL (15 min) + per-email rate limit + 6-digit space (1M). **Holds for opportunistic; holds for targeted unless attacker has wider access.**

**Gaps:** If attacker controls the user's email, they read the code directly and the rate limit is irrelevant. Compounding: if they then log in and change password, they take over the account. Mitigation: surface "your password was just reset — we revoked all sessions; if this wasn't you click here" in the same email channel — they need to control email *and* prevent the user from reading subsequent emails. Add: enforce MFA on password reset for users who have MFA enrolled (require both code-from-email *and* TOTP). <!-- REVIEW: This is a real gap. The strawman should bake MFA-on-reset into the contract. Consider it accepted-with-followup. -->

### Tabletop 3: OAuth provider's signing key is compromised

**Setup:** Google's signing infrastructure is compromised; an attacker can mint id-tokens with `email_verified: true` for any email.

**Attack progression:**
1. Attacker mints a Google id-token claiming a victim's email.
2. Attacker calls `/v2/auth/oauth/google` with that token.
3. Server verifies signature against Google JWKS. Returns valid (the key really is Google's, just stolen).
4. Server matches email; finds existing account; issues session.
5. Attacker now has the victim's account.

**Coverage:** None at the OAuth layer — we trust Google's signing chain by design.

**Mitigations:**
- Watch industry chatter; revoke our Google client id and re-issue if Google announces a key compromise.
- For password-account users, the `OAUTH_EMAIL_CONFLICT` flow forces a password proof-of-control before linking, which protects users whose primary credential is password — but not users whose account was *originally* created via Google.
- MFA. If MFA is enrolled, the OAuth path still routes through `mfa-challenge`. Compromise of Google does not bypass the second factor.

**Gaps:** Users with a Google-only account and no MFA are unprotected. Mitigation: encourage MFA enrollment, especially for Google-only accounts; consider making MFA mandatory for users who haven't logged in via password in N days.

---

## Detection / monitoring requirements

Audit log every event with: `userId, familyId, jti, eventType, client, appVersion, ipMasked, userAgent, outcome, errorCode, ts, kid, scope`.

Event types covered: `signup`, `login.attempt`, `login.success`, `login.fail`, `oauth.attempt`, `oauth.success`, `oauth.fail`, `mfa.challenge.issued`, `mfa.verify.success`, `mfa.verify.fail`, `mfa.locked`, `refresh.success`, `refresh.reuse`, `refresh.fail`, `logout`, `logout.all`, `password.reset.requested`, `password.reset.completed`, `password.changed`, `email.verify.sent`, `email.verify.completed`, `account.delete.requested`, `account.delete.cancelled`, `mfa.enroll.started`, `mfa.enroll.confirmed`, `mfa.disabled`, `session.revoked`.

**Alert thresholds (initial — tune after launch):**

| Alert | Threshold | Severity |
|-------|-----------|----------|
| `refresh.reuse` rate | >0.1% of refreshes over 10 min | High |
| `mfa.verify.fail` rate | >5% of attempts over 10 min | Medium |
| `login.fail` rate per IP | >100 / hour | Medium |
| `login.fail` rate per account | >20 / hour | High (likely targeted) |
| `oauth.fail: TOKEN_AUDIENCE_MISMATCH` | any | High (config drift) |
| `TOKEN_KID_UNKNOWN` | spike after rotation | Medium (rollout issue) |
| `account.delete.requested` rate | >3x baseline | Medium (could indicate harassment campaign) |

PII handling: IPs masked to /24 or /48 before storage. User-agent kept full. Email never logged in plaintext past 7 days.
