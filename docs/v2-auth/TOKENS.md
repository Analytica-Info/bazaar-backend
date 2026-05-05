# v2 Auth Tokens

> Status: STRAWMAN. See [README.md](./README.md).
> Resolves: BUG-035, BUG-047, BUG-049, BUG-050.

Three token classes, two key families, one rotation strategy.

---

## 1. Token classes

| Class | `typ` | TTL (web) | TTL (mobile) | Signing key family | Where issued |
|-------|-------|-----------|--------------|--------------------|--------------|
| Access | `access` | 15 min | 15 min | session-keys | `/v2/auth/login`, `/v2/auth/refresh`, OAuth callbacks |
| Refresh | `refresh` | 30 d | 90 d | session-keys | same as above |
| Code: password reset | `code:reset` | 15 min | 15 min | code-keys | `/v2/auth/password/forgot` (after code verified) |
| Code: email verify | `code:verify-email` | 24 h | 24 h | code-keys | signup, `/v2/auth/email/resend` |
| Code: MFA challenge | `code:mfa-challenge` | 5 min | 5 min | code-keys | first factor success during login |
| Code: recent-auth | `code:recent-auth` | 5 min | 5 min | code-keys | `/v2/auth/account/delete` step 1 |

**Two key families** (closes BUG-049):
- `session-keys` — sign access + refresh tokens.
- `code-keys` — sign all `code:*` tokens.

A leak of code-signing material cannot mint session tokens, and vice versa.

---

## 2. Access token claims

```json
{
  "iss": "https://api.bazaar-uae.com",
  "sub": "user_01HXYZ...",
  "aud": "bazaar-web",
  "iat": 1735689600,
  "exp": 1735690500,
  "jti": "01HXY-ACC-...",
  "kid": "sess-2026q1",
  "tv": 2,
  "typ": "access",
  "scope": "user",
  "mfa_verified": true,
  "device_id": "dev_01HXYZ..."
}
```

Field notes:

| Claim | Notes |
|-------|-------|
| `iss` | One value per environment: `https://api.bazaar-uae.com` (prod), `https://api-stg.bazaar-uae.com` (staging), etc. Verifier pins. |
| `sub` | Stable user id (ULID). Never the email. |
| `aud` | One of `bazaar-web`, `bazaar-mobile`, `bazaar-admin`. Verifier pins per service. |
| `exp` | Renamed from v1's poorly-named `expiresIn` value-vs-instant confusion (BUG-035). Always Unix-seconds, absolute. |
| `jti` | Required. Format `<ULID>` from `ulid()`. Used for audit and (in the future) per-token revocation. |
| `kid` | JWT header field; resolves to a public key in the keystore. |
| `tv` | Token version. Currently `2` (v1 was implicit `1`). Bump when claim shape changes incompatibly. See [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md). |
| `typ` | Custom claim — not the JWT header `typ`. Always `"access"`. Verifier rejects tokens whose `typ` does not match the endpoint's expectation. |
| `scope` | Space-delimited. Initial values: `user`, `admin`, `delete:account`. |
| `mfa_verified` | `true` only after a successful MFA verify in this auth chain. Endpoints that demand recent MFA inspect this. |
| `device_id` | Optional. Set if `X-Device-Id` was provided at login. Lets us correlate sessions to devices. |

Algorithm: **RS256**, pinned. Verifier rejects any token whose header `alg` is not `RS256` (closes BUG-047).

---

## 3. Refresh token claims

```json
{
  "iss": "https://api.bazaar-uae.com",
  "sub": "user_01HXYZ...",
  "aud": "bazaar-web",
  "iat": 1735689600,
  "exp": 1738281600,
  "jti": "01HXY-REF-...",
  "kid": "sess-2026q1",
  "tv": 2,
  "typ": "refresh",
  "family_id": "fam_01HXYZ...",
  "device_id": "dev_01HXYZ..."
}
```

`family_id` is the rotation chain id. On every successful refresh:
1. Look up session by `family_id` in Redis.
2. If the presented `jti` is the family's *current* `jti`, rotate: issue new pair, store new `jti`, return.
3. If the presented `jti` is a *retired* `jti` from this family, **revoke the entire family** (delete the Redis record) and return `TOKEN_REUSE_DETECTED`. The legitimate user is logged out and forced to re-auth — by design.

A refresh token is single-use. The session record stores only the *current* refresh `jti`, not the full history; we keep a small ring of last-N retired `jti`s purely to recognize replay vs. random invalid tokens.

---

## 4. Code tokens

All `code:*` tokens share the skeleton but with narrow scope:

```json
{
  "iss": "https://api.bazaar-uae.com",
  "sub": "user_01HXYZ...",
  "aud": "bazaar-web",
  "iat": 1735689600,
  "exp": 1735689900,
  "jti": "01HXY-COD-...",
  "kid": "code-2026q1",
  "tv": 2,
  "typ": "code:mfa-challenge",
  "scope": "mfa:verify",
  "purpose_nonce": "01HXY-..."
}
```

- `kid` resolves against the **code-keys** keystore (separate from session-keys).
- `scope` narrows to a single capability: `password:reset`, `email:verify`, `mfa:verify`, `account:delete`.
- `purpose_nonce` is one-time-use. Stored in Redis with TTL = token TTL. Consumed atomically when the corresponding endpoint is called. Replaying a code token after consumption → `TOKEN_REVOKED`.

---

## 5. Algorithm + key resolution

- **Algorithm:** RS256, pinned in verifier config. No `alg: none`. No HS-family fallback. The verifier's allow-list is hard-coded `["RS256"]`.
- **Header:** `{ "alg": "RS256", "typ": "JWT", "kid": "<keystore-id>" }`.
- **Key resolution:**
  - Verifier maintains a `kid → publicKey` map loaded at boot.
  - On `kid` miss, refresh the map once from the keystore. Still missing → reject as `TOKEN_INVALID`.
  - Issuer always signs with the *current active* `kid`. Old keys remain in the verifier map until removed by rotation step (below).

---

## 6. Key storage convention

**Now (env-driven):**

```
JWT_SESSION_KEYS_JSON='{"sess-2026q1":{"private":"...","public":"..."},"sess-2025q4":{"public":"..."}}'
JWT_CODE_KEYS_JSON='{"code-2026q1":{"private":"...","public":"..."},"code-2025q4":{"public":"..."}}'
JWT_SESSION_ACTIVE_KID="sess-2026q1"
JWT_CODE_ACTIVE_KID="code-2026q1"
```

Loaded once at boot into an in-process keystore object. Old keys keep their public half only — the private half is purged the moment they stop being active.

**Later (KMS):** swap the env loader for a small `Keystore` adapter behind the existing port. Same shape — `getActive(kind)` and `get(kid)`. Use AWS KMS / Vault / GCP KMS. No code outside the adapter changes.

<!-- REVIEW: Keeping private keys in env vars makes some people uncomfortable. Real answer: we already store DB passwords there. The right fix is KMS, not encrypting env vars at rest in a different way. Note this as the v2.1 follow-up rather than blocking v2 launch. -->

---

## 7. Cookie attributes (when `tokenDelivery=cookie`)

| Cookie | Path | Attributes | Max-Age |
|--------|------|------------|---------|
| `bz_at` (access) | `/` | `HttpOnly; Secure; SameSite=Strict; Domain=.bazaar-uae.com` | 900 (15 min) |
| `bz_rt` (refresh) | `/v2/auth` | `HttpOnly; Secure; SameSite=Strict; Domain=.bazaar-uae.com` | 2592000 (30 d) |
| `bz_csrf` (CSRF token) | `/` | `Secure; SameSite=Strict; Domain=.bazaar-uae.com` (NOT HttpOnly — JS reads it) | 2592000 |

- `Secure` is omitted only in `NODE_ENV=development` against `localhost`.
- Refresh cookie path is restricted to `/v2/auth` so it is not sent on every API call — only refresh and logout endpoints see it.
- CSRF token (BUG-051): JS reads `bz_csrf` and echoes it as `X-CSRF-Token` header on state-changing requests. Server compares cookie value to header value; reject mismatch with `CSRF_TOKEN_INVALID`.

<!-- REVIEW: SameSite=Strict breaks "click email link → land on bazaar logged in" because the inbound request strips the cookie. Acceptable for the auth surface specifically — the rest of the app can use SameSite=Lax cookies if we add user-facing cookies later. -->

---

## 8. Token version (`tv`) bump procedure

The `tv` claim lets us evolve the token shape without breaking deployed clients catastrophically.

**When to bump:**
- Adding a *required* claim that older clients/servers must understand.
- Removing a claim.
- Changing the meaning of an existing claim.

**When NOT to bump:**
- Adding an *optional* claim that older readers can ignore.
- Adding a new `kid`.
- Adding a new `aud` value.

**Procedure:**
1. New code is rolled out that *issues* `tv: N+1` and *accepts* both `tv: N` and `tv: N+1`.
2. Wait one full refresh-TTL window (90 days for mobile) so all in-flight refresh tokens have rotated to `tv: N+1`.
3. Drop acceptance of `tv: N`. Old tokens fail with `TOKEN_VERSION_UNSUPPORTED`. Clients re-auth.

This complements (not replaces) the API-version freeze policy. `/v2/auth/*` is the API contract; `tv` is the token-shape contract. They evolve on different cadences.

See [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md) for the parallel API-version story.
