# v2 Auth Contract

> Status: STRAWMAN. See [README.md](./README.md).
> Envelope: `{ success, data?, error?, meta? }` — see `src/controllers/v2/_shared/responseEnvelope.js`.
> Error codes: see [ERROR-CATALOG.md](./ERROR-CATALOG.md).

## Conventions

### Common headers (request)

| Header | Required | Values | Notes |
|--------|----------|--------|-------|
| `Content-Type` | yes | `application/json` | All bodies are JSON. |
| `X-Client` | yes | `web` \| `mobile` \| `admin` | Required on every `/v2/*` call. Wrong value or missing → 400 `BAD_REQUEST`. |
| `X-App-Version` | yes (mobile, admin) | semver, e.g. `1.4.2` | Used for compatibility gates. See `MOBILE-VERSION-COMPATIBILITY.md`. |
| `X-Device-Id` | optional | opaque ULID | Persists across launches; correlates sessions to devices. |
| `Authorization` | endpoint-dependent | `Bearer <jwt>` | Bearer mode only. |
| `X-CSRF-Token` | yes for state-changing cookie-mode requests | echo of `bz_csrf` cookie | Cookie mode only. |

### Auth required values

| Value | Means |
|-------|-------|
| `none` | No credentials needed. |
| `bearer` | Valid access JWT in `Authorization` header (bearer mode) OR valid `bz_at` cookie (cookie mode). |
| `mfa-challenge` | Valid `code:mfa-challenge` token in `Authorization`. |
| `recent-auth` | `bearer` AND a valid `code:recent-auth` token in body. |
| `refresh-token` | Valid refresh token via `bz_rt` cookie or request body. |

### Standard success envelope

```json
{ "success": true, "data": { ... } }
```

### Standard error envelope

```json
{ "success": false, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Email or password is incorrect.", "details": null } }
```

### Token response shape (bearer mode)

```json
{
  "user": { "...": "see /me" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "tokenType": "Bearer",
  "csrfToken": null
}
```

In cookie mode `accessToken`/`refreshToken` are `null`, `csrfToken` is set, and tokens are delivered via `Set-Cookie`.

`expiresIn` is **seconds-from-now** (relative). The JWT itself carries absolute `exp`. Both unambiguous; resolves BUG-035.

---

## 1. POST /v2/auth/signup

**Purpose:** Create a new account.
**Auth:** none.
**Rate limit:** 5 / IP / hour (sliding).

**Request:**

```json
{
  "email": "string, RFC 5322, ≤254 chars, required",
  "password": "string, 12..128 chars, required",
  "name": "string, 1..80 chars, required",
  "phone": "string, E.164, optional",
  "tokenDelivery": "'cookie' | 'bearer', required"
}
```

**Success 201:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "user_...", "email": "...", "name": "...", "emailVerified": false, "scope": "user:unverified" },
    "accessToken": "...", "refreshToken": "...", "expiresIn": 900, "refreshExpiresIn": 2592000,
    "tokenType": "Bearer", "csrfToken": null,
    "verifyEmailSent": true
  }
}
```

A `code:verify-email` is emailed automatically. Account is usable in narrow scope until verified.

**Errors:**
- 409 `OAUTH_EMAIL_CONFLICT` — email already in use (advise sign-in).
- 422 `VALIDATION_EMAIL_INVALID`, `VALIDATION_PASSWORD_TOO_SHORT/TOO_LONG/BREACHED`, `VALIDATION_NAME_INVALID`, `VALIDATION_PHONE_INVALID`, `VALIDATION_TOKEN_DELIVERY_INVALID`.
- 429 `RATE_LIMITED_SIGNUP`.

<!-- REVIEW: We return tokens immediately on signup. Some shops force email verification before any session is issued. UX wins here — being logged-out immediately after signup is jarring. Narrow scope is the safety net. -->

---

## 2. POST /v2/auth/login

**Purpose:** Email/password login. May return tokens or an MFA challenge.
**Auth:** none.
**Rate limit:** 10 / account / 15 min sliding + 30 / IP / 15 min.

**Request:**

```json
{
  "email": "required",
  "password": "required",
  "tokenDelivery": "'cookie' | 'bearer', required",
  "deviceId": "optional"
}
```

**Success 200 (no MFA):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "user": { ... },
    "accessToken": "...", "refreshToken": "...",
    "expiresIn": 900, "refreshExpiresIn": 2592000,
    "tokenType": "Bearer", "csrfToken": null
  }
}
```

**Success 200 (MFA required):**

```json
{
  "success": true,
  "data": {
    "status": "mfa_required",
    "challengeToken": "...",
    "expiresIn": 300,
    "mfaMethods": ["totp"]
  }
}
```

`status` is the discriminator. Clients switch on it.

**Errors:**
- 401 `AUTH_INVALID_CREDENTIALS`.
- 423 `AUTH_ACCOUNT_LOCKED`.
- 410 `AUTH_ACCOUNT_DELETED`.
- 403 `AUTH_ACCOUNT_DISABLED`, `AUTH_PASSWORD_EXPIRED`.
- 422 validation codes.
- 429 `RATE_LIMITED_LOGIN`.

---

## 3. POST /v2/auth/oauth/google

**Purpose:** Login or signup via Google id-token.
**Auth:** none.
**Rate limit:** 10 / IP / minute.

**Request:**

```json
{
  "idToken": "Google id-token JWT, required",
  "tokenDelivery": "'cookie' | 'bearer', required",
  "deviceId": "optional"
}
```

Server verifies signature against Google's JWKS, validates `aud` matches our Google client id, validates `iss = https://accounts.google.com`, validates `email_verified = true`.

**Success 200:** same shape as `/v2/auth/login` (with `status: "ok"` or `"mfa_required"`).

If the email matches an existing password account, we return `OAUTH_EMAIL_CONFLICT` and the client must run a link flow (sign in with password, then call `/v2/auth/oauth/google` again with `mode: "link"` — see <!-- REVIEW: linking flow is a stub here; spec it before implementing. --> note in MIGRATION.md).

**Errors:** 401 `OAUTH_INVALID_TOKEN`, `OAUTH_TOKEN_EXPIRED`, `OAUTH_AUDIENCE_MISMATCH`. 403 `OAUTH_EMAIL_NOT_VERIFIED`. 409 `OAUTH_EMAIL_CONFLICT`. 503 `OAUTH_PROVIDER_DISABLED`.

---

## 4. POST /v2/auth/oauth/apple

**Purpose:** Login or signup via Apple id-token.
**Auth:** none.
**Rate limit:** 10 / IP / minute.

**Request:**

```json
{
  "idToken": "Apple id-token JWT, required",
  "authorizationCode": "optional, used to fetch refresh token from Apple for revocation API",
  "name": { "firstName": "optional", "lastName": "optional" },
  "tokenDelivery": "'cookie' | 'bearer', required",
  "deviceId": "optional"
}
```

Apple's quirks: name only delivered on the first sign-in. We persist it then; subsequent sign-ins use the stored name. Apple private-relay emails (`*@privaterelay.appleid.com`) are stable per-app and treated as a verified identity.

**Success / errors:** same as Google.

---

## 5. POST /v2/auth/refresh

**Purpose:** Rotate refresh token, get new access token.
**Auth:** `refresh-token`.
**Rate limit:** 60 / family / hour.

**Request (bearer mode):**

```json
{ "refreshToken": "required" }
```

**Request (cookie mode):** body empty. Refresh token comes from `bz_rt` cookie. CSRF header required.

**Success 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "...", "refreshToken": "...",
    "expiresIn": 900, "refreshExpiresIn": 2592000,
    "tokenType": "Bearer"
  }
}
```

Cookie mode: tokens delivered via `Set-Cookie`; body has nulls.

**Errors:**
- 401 `TOKEN_MISSING`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `TOKEN_REUSE_DETECTED`, `TOKEN_VERSION_UNSUPPORTED`, `TOKEN_KID_UNKNOWN`.
- 403 `CSRF_TOKEN_INVALID` (cookie mode).
- 429 `RATE_LIMITED_REFRESH`.

---

## 6. POST /v2/auth/logout

**Purpose:** Revoke current session (this refresh family only).
**Auth:** `bearer`.
**Rate limit:** 30 / account / hour.

**Request:** `{}` (empty body). In cookie mode, refresh cookie identifies the family.

**Success 200:** `{ "success": true, "data": { "loggedOut": true } }` and cookies cleared.

**Errors:** 401 `TOKEN_*`. 403 `CSRF_TOKEN_INVALID`.

Idempotent — already-revoked sessions still return success.

---

## 7. POST /v2/auth/logout-all

**Purpose:** Revoke all refresh families for the user.
**Auth:** `bearer`.
**Rate limit:** 5 / account / hour.

**Request:** `{}`.
**Success 200:** `{ "success": true, "data": { "revokedSessions": 3 } }`.

After this call, all access tokens issued before now will continue to work until they naturally expire (≤15 min). Document this clearly. <!-- REVIEW: If the team wants instant access-token revocation, we add a per-user `tv_min` claim and bump it here. Costs a Redis lookup on every authenticated request. Cost not currently paid. -->

---

## 8. GET /v2/auth/sessions

**Purpose:** List active sessions (one row per refresh family).
**Auth:** `bearer`.
**Rate limit:** 60 / account / hour.

**Success 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "fam_01HXY...",
      "deviceId": "dev_01HXY...",
      "client": "mobile",
      "appVersion": "1.4.2",
      "ip": "10.0.0.5",
      "userAgent": "Bazaar/1.4.2 (iOS 18.0)",
      "createdAt": "2026-04-12T08:14:00Z",
      "lastUsedAt": "2026-04-30T19:02:11Z",
      "current": true
    }
  ],
  "meta": { "total": 1 }
}
```

`current` flags the family that issued the request's access token. IP is masked to /24 (v4) or /48 (v6) before display.

---

## 9. DELETE /v2/auth/sessions/:id

**Purpose:** Revoke a specific session.
**Auth:** `bearer`.
**Rate limit:** 30 / account / hour.

**Path param:** `id` — family id.

**Success 200:** `{ "success": true, "data": { "revoked": true } }`.

**Errors:** 401 `TOKEN_*`. 404 `NOT_FOUND` (id doesn't belong to this user). 403 `CSRF_TOKEN_INVALID`.

If the revoked session is the current one, behaves like `/logout`.

---

## 10. GET /v2/auth/me

**Purpose:** Return the current user.
**Auth:** `bearer`.
**Rate limit:** 120 / account / minute.

**Success 200:**

```json
{
  "success": true,
  "data": {
    "id": "user_...",
    "email": "...",
    "emailVerified": true,
    "name": "...",
    "phone": "...",
    "scope": "user",
    "mfaEnrolled": true,
    "mfaMethods": ["totp"],
    "createdAt": "...",
    "linkedProviders": ["password", "google"]
  }
}
```

---

## 11. POST /v2/auth/password/forgot

**Purpose:** Email a 6-digit recovery code (and code token preamble).
**Auth:** none.
**Rate limit:** 3 / email / hour + 10 / IP / hour.

**Request:** `{ "email": "required" }`.

**Success 200:** `{ "success": true, "data": { "sent": true } }` — always returned, even if the email doesn't exist (prevents enumeration).

**Errors:** 422 validation. 429 `RATE_LIMITED_PASSWORD_RESET`, `RATE_LIMITED_EMAIL_SEND`.

---

## 12. POST /v2/auth/password/verify-code

**Purpose:** Exchange the emailed 6-digit code for a `code:reset` token.
**Auth:** none.
**Rate limit:** 5 / email / hour.

**Request:** `{ "email": "required", "code": "6-digit string, required" }`.

**Success 200:** `{ "success": true, "data": { "resetToken": "...", "expiresIn": 900 } }`.

**Errors:** 401 `AUTH_INVALID_CREDENTIALS` (covers wrong-code without revealing which). 429 `RATE_LIMITED_PASSWORD_RESET`.

---

## 13. POST /v2/auth/password/reset

**Purpose:** Set a new password using a `code:reset` token. Revokes all sessions.
**Auth:** none. Carries `resetToken` in body.
**Rate limit:** 10 / IP / hour.

**Request:**

```json
{ "resetToken": "required", "newPassword": "12..128, required" }
```

**Success 200:** `{ "success": true, "data": { "passwordReset": true } }`. User must log in again. <!-- REVIEW: We could log them in here and return tokens. The strawman doesn't because reset is the moment to flush all sessions, including the attacker's. Forcing a fresh login keeps that intent crisp. -->

**Errors:** 401 `TOKEN_INVALID/EXPIRED/REVOKED/TYPE_MISMATCH`. 422 `VALIDATION_PASSWORD_*`.

---

## 14. POST /v2/auth/password/change

**Purpose:** Change password while logged in.
**Auth:** `bearer`.
**Rate limit:** 5 / account / hour.

**Request:** `{ "oldPassword": "required", "newPassword": "12..128, required" }`.

**Success 200:** new token pair (current family kept; all *other* families revoked).

```json
{
  "success": true,
  "data": {
    "accessToken": "...", "refreshToken": "...",
    "expiresIn": 900, "refreshExpiresIn": 2592000,
    "revokedSessions": 2
  }
}
```

**Errors:** 401 `AUTH_INVALID_CREDENTIALS`. 422 `VALIDATION_PASSWORD_*`, `VALIDATION_PASSWORD_SAME_AS_OLD`. 403 `CSRF_TOKEN_INVALID`.

---

## 15. POST /v2/auth/email/verify

**Purpose:** Verify email address using a `code:verify-email` token.
**Auth:** none. Carries `verifyToken` in body.
**Rate limit:** 10 / IP / hour.

**Request:** `{ "verifyToken": "required" }`.

**Success 200:** `{ "success": true, "data": { "emailVerified": true } }`.

If the user is currently logged in (cookie present), the next refresh broadens scope. If not logged in, no auto-login.

**Errors:** 401 `TOKEN_INVALID/EXPIRED/REVOKED`.

---

## 16. POST /v2/auth/email/resend

**Purpose:** Re-send the email verification link.
**Auth:** `bearer` (must be logged in to know what email to resend to).
**Rate limit:** 3 / account / hour.

**Request:** `{}`.
**Success 200:** `{ "success": true, "data": { "sent": true } }`.

**Errors:** 409 if email already verified — code `AUTH_EMAIL_UNVERIFIED` is misleading here; we use a non-error 200 with `{ alreadyVerified: true }`. <!-- REVIEW: I went back and forth on whether already-verified should be an error or a 200. Picked 200 because it's idempotent semantically. -->

---

## 17. POST /v2/auth/account/delete

**Purpose:** Delete (soft-delete) the current user's account.
**Auth:** `recent-auth` (bearer + a `code:recent-auth` issued within the last 5 minutes).
**Rate limit:** 3 / account / day.

**Request:**

```json
{ "recentAuthToken": "required", "confirmation": "DELETE", "reason": "optional" }
```

**Success 200:** `{ "success": true, "data": { "scheduledFor": "2026-05-31T..." } }`. Account is recoverable for 30 days, then hard-deleted.

To get a `recentAuthToken`: client calls `POST /v2/auth/login` again with current password while already logged in, OR a future `POST /v2/auth/recent-auth` endpoint we'll add when needed. <!-- REVIEW: Not specified in this strawman. The cleanest path is a dedicated /recent-auth endpoint. Add to v2.0 alongside this. -->

**Errors:** 403 `AUTH_RECENT_AUTH_REQUIRED` if token missing/old. 401 `TOKEN_*`. 422 if `confirmation != "DELETE"`.

---

## 18. POST /v2/auth/mfa/enroll/totp

**Purpose:** Begin TOTP enrollment. Returns a secret + QR-encodable URI.
**Auth:** `bearer`.
**Rate limit:** 5 / account / hour.

**Request:** `{}`.

**Success 200:**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/Bazaar:user@example.com?secret=...&issuer=Bazaar&period=30&digits=6",
    "recoveryCodes": ["abcd-efgh", "ijkl-mnop", "..."]
  }
}
```

10 single-use recovery codes, displayed once. Persisted hashed.

**Errors:** 409 `MFA_ALREADY_ENROLLED`.

---

## 19. POST /v2/auth/mfa/enroll/totp/confirm

**Purpose:** Confirm enrollment by submitting a code. Until confirmed, MFA is not active.
**Auth:** `bearer`.
**Rate limit:** 5 / account / hour.

**Request:** `{ "code": "6-digit string, required" }`.
**Success 200:** `{ "success": true, "data": { "mfaEnrolled": true } }`.
**Errors:** 400 `MFA_ENROLLMENT_INVALID_CODE`. 409 `MFA_ALREADY_ENROLLED`.

---

## 20. POST /v2/auth/mfa/verify

**Purpose:** Submit second factor during login.
**Auth:** `mfa-challenge` (the challenge token from `/v2/auth/login`).
**Rate limit:** 5 attempts per challenge token; 10 challenges / account / hour.

**Request:** `{ "code": "6-digit TOTP OR 9-char recovery, required", "tokenDelivery": "'cookie' | 'bearer', required" }`.

**Success 200:** full token pair (same shape as `/login`).

**Errors:** 401 `MFA_INVALID_CODE` (with `details.attemptsLeft`). 423 `MFA_LOCKED_OUT`. 401 `TOKEN_EXPIRED` (challenge timed out).

---

## 21. POST /v2/auth/mfa/disable

**Purpose:** Turn MFA off.
**Auth:** `recent-auth` (bearer + recent-auth code token).
**Rate limit:** 3 / account / day.

**Request:** `{ "recentAuthToken": "required" }`.
**Success 200:** `{ "success": true, "data": { "mfaEnrolled": false } }`. All recovery codes invalidated.

**Errors:** 403 `MFA_DISABLE_REQUIRES_AUTH`, `AUTH_RECENT_AUTH_REQUIRED`. 409 `MFA_NOT_ENROLLED`.

---

## Endpoint summary table

| # | Method + Path | Auth | RL | Purpose |
|---|---------------|------|----|---------|
| 1 | POST /v2/auth/signup | none | 5/IP/h | Create account |
| 2 | POST /v2/auth/login | none | 10/acct/15m | Email+pwd login |
| 3 | POST /v2/auth/oauth/google | none | 10/IP/m | Google login |
| 4 | POST /v2/auth/oauth/apple | none | 10/IP/m | Apple login |
| 5 | POST /v2/auth/refresh | refresh | 60/fam/h | Rotate tokens |
| 6 | POST /v2/auth/logout | bearer | 30/acct/h | Revoke this session |
| 7 | POST /v2/auth/logout-all | bearer | 5/acct/h | Revoke all sessions |
| 8 | GET /v2/auth/sessions | bearer | 60/acct/h | List sessions |
| 9 | DELETE /v2/auth/sessions/:id | bearer | 30/acct/h | Revoke session |
| 10 | GET /v2/auth/me | bearer | 120/acct/m | Current user |
| 11 | POST /v2/auth/password/forgot | none | 3/email/h | Send reset code |
| 12 | POST /v2/auth/password/verify-code | none | 5/email/h | Exchange code → reset token |
| 13 | POST /v2/auth/password/reset | none | 10/IP/h | Set new password |
| 14 | POST /v2/auth/password/change | bearer | 5/acct/h | Change password |
| 15 | POST /v2/auth/email/verify | none | 10/IP/h | Verify email |
| 16 | POST /v2/auth/email/resend | bearer | 3/acct/h | Resend verify email |
| 17 | POST /v2/auth/account/delete | recent-auth | 3/acct/d | Soft-delete account |
| 18 | POST /v2/auth/mfa/enroll/totp | bearer | 5/acct/h | Begin TOTP enroll |
| 19 | POST /v2/auth/mfa/enroll/totp/confirm | bearer | 5/acct/h | Confirm TOTP enroll |
| 20 | POST /v2/auth/mfa/verify | mfa-challenge | 5/chal | MFA second factor |
| 21 | POST /v2/auth/mfa/disable | recent-auth | 3/acct/d | Disable MFA |
