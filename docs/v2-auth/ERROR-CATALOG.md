# v2 Auth Error Catalog

> Status: STRAWMAN. See [README.md](./README.md).

All v2 auth error codes. Stable identifiers. Clients switch on `code`, never on `message`.

Envelope (matches `src/controllers/v2/_shared/responseEnvelope.js`):

```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "details": null
  }
}
```

`retryable` describes whether the same request, unchanged, might succeed later (e.g. a network blip vs. a logical rejection). `client_action` is the recommended UX response.

---

## Authentication errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Email or password is incorrect. | No | Show generic "wrong email or password". Do not distinguish which is wrong. |
| `AUTH_ACCOUNT_LOCKED` | 423 | Too many failed attempts. Try again in 15 minutes or reset your password. | After cooldown | Show cooldown UI; offer password reset link. |
| `AUTH_ACCOUNT_DELETED` | 410 | This account no longer exists. | No | Send to signup. |
| `AUTH_ACCOUNT_DISABLED` | 403 | This account has been disabled. Contact support. | No | Show support contact. |
| `AUTH_EMAIL_UNVERIFIED` | 403 | Verify your email to continue. | After verification | Surface "resend verification" CTA. Note: most flows return tokens with narrow scope rather than this error — use scope checks first. |
| `AUTH_RECENT_AUTH_REQUIRED` | 403 | This action requires you to re-confirm your password. | After re-auth | Show password reprompt; on success retry with new recent-auth code token. |
| `AUTH_PASSWORD_EXPIRED` | 403 | Your password has expired. Please reset. | After reset | Send to forced-reset flow. Carries `details.resetCode` for a one-shot reset bypass. |
| `AUTH_SCOPE_INSUFFICIENT` | 403 | You don't have permission to do that. | No | Hide the action; this should not appear if UI gates correctly. |

## Token errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `TOKEN_MISSING` | 401 | Authentication required. | After login | Send to login. |
| `TOKEN_INVALID` | 401 | Invalid token. | No | Discard tokens locally; send to login. |
| `TOKEN_EXPIRED` | 401 | Token expired. | After refresh | Trigger silent refresh; if that fails, login. |
| `TOKEN_REVOKED` | 401 | This session has been revoked. | No | Discard tokens locally; send to login. |
| `TOKEN_REUSE_DETECTED` | 401 | Suspicious activity detected. Please sign in again. | No | Discard tokens; send to login. Surface security notice. |
| `TOKEN_TYPE_MISMATCH` | 401 | Wrong token type for this endpoint. | No | Bug in client; report. |
| `TOKEN_VERSION_UNSUPPORTED` | 401 | Please update the app to continue. | After app update | Force update banner. |
| `TOKEN_AUDIENCE_MISMATCH` | 401 | This token isn't valid for this client. | No | Bug in client; report. |
| `TOKEN_ISSUER_MISMATCH` | 401 | Token issuer is not recognized. | No | Bug or environment mix-up. |
| `TOKEN_KID_UNKNOWN` | 401 | Signing key not recognized. | No | Possible stale token after rotation; re-auth. |

## CSRF errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `CSRF_TOKEN_MISSING` | 403 | Missing CSRF token. | After re-fetch | Re-read `bz_csrf` cookie and retry. |
| `CSRF_TOKEN_INVALID` | 403 | CSRF token mismatch. | After re-fetch | Re-read `bz_csrf` cookie and retry. If repeats → re-auth. |

## MFA errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `MFA_REQUIRED` | 200 (in `status`) | Please enter your authenticator code. | — | Switch UI to MFA prompt; carry `challengeToken`. |
| `MFA_INVALID_CODE` | 401 | The code is incorrect. | Yes (≤5 attempts) | Show "wrong code" inline; show attempts remaining if `details.attemptsLeft` set. |
| `MFA_LOCKED_OUT` | 423 | Too many incorrect codes. Sign in again to retry. | No | Discard challenge; send back to login. |
| `MFA_NOT_ENROLLED` | 409 | MFA is not enabled for this account. | No | Hide MFA-only flows. |
| `MFA_ALREADY_ENROLLED` | 409 | MFA is already enabled. | No | Show settings. |
| `MFA_ENROLLMENT_INVALID_CODE` | 400 | The setup code is incorrect. Try again. | Yes | Stay on enrollment screen. |
| `MFA_DISABLE_REQUIRES_AUTH` | 403 | Re-enter your password to disable MFA. | After re-auth | Prompt password. |

## OAuth errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `OAUTH_INVALID_TOKEN` | 401 | Sign-in failed. The token from {provider} is invalid. | Yes (re-attempt) | Restart the OAuth flow. |
| `OAUTH_TOKEN_EXPIRED` | 401 | Sign-in token expired. Try again. | Yes | Restart OAuth flow. |
| `OAUTH_EMAIL_CONFLICT` | 409 | An account with this email already exists. Sign in with your password to link. | After link | Send to "link account" flow which prompts for password then merges. |
| `OAUTH_EMAIL_NOT_VERIFIED` | 403 | The {provider} account's email is not verified. | No | Show provider-specific guidance. |
| `OAUTH_PROVIDER_DISABLED` | 503 | {provider} sign-in is currently unavailable. | Yes | Show fallback to email/password. |
| `OAUTH_AUDIENCE_MISMATCH` | 401 | This {provider} token wasn't issued for Bazaar. | No | Bug in client. |

## Validation errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `VALIDATION_REQUIRED_FIELD` | 422 | Missing required field: {field}. | Yes | Inline field error. |
| `VALIDATION_EMAIL_INVALID` | 422 | Enter a valid email address. | Yes | Inline field error. |
| `VALIDATION_PASSWORD_TOO_SHORT` | 422 | Password must be at least 12 characters. | Yes | Inline field error with rule. |
| `VALIDATION_PASSWORD_TOO_LONG` | 422 | Password must be at most 128 characters. | Yes | Inline field error. |
| `VALIDATION_PASSWORD_BREACHED` | 422 | This password appears in known breach lists. Please choose another. | Yes | Inline field error; explain. |
| `VALIDATION_PASSWORD_SAME_AS_OLD` | 422 | New password must differ from the current one. | Yes | Inline field error. |
| `VALIDATION_NAME_INVALID` | 422 | Name contains invalid characters. | Yes | Inline field error. |
| `VALIDATION_PHONE_INVALID` | 422 | Phone number is invalid. | Yes | Inline field error. |
| `VALIDATION_TOKEN_DELIVERY_INVALID` | 422 | tokenDelivery must be 'cookie' or 'bearer'. | Yes | Bug in client. |

## Rate limit errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `RATE_LIMITED_LOGIN` | 429 | Too many sign-in attempts. Try again in {retryAfter}s. | After cooldown | Show cooldown UI. Honour `Retry-After` header. |
| `RATE_LIMITED_SIGNUP` | 429 | Too many signups from this IP. Try again later. | After cooldown | Show cooldown. |
| `RATE_LIMITED_PASSWORD_RESET` | 429 | Too many reset attempts. Try again in {retryAfter}s. | After cooldown | Show cooldown. |
| `RATE_LIMITED_REFRESH` | 429 | Too many refresh attempts. | After cooldown | Wait and retry. Likely a client bug. |
| `RATE_LIMITED_MFA` | 429 | Too many MFA attempts. Sign in again. | After re-login | Send to login. |
| `RATE_LIMITED_EMAIL_SEND` | 429 | Please wait before requesting another email. | After cooldown | Show cooldown timer. |

## Server / infra errors

| Code | HTTP | Default message | Retryable | Client action |
|------|------|-----------------|-----------|---------------|
| `INTERNAL_ERROR` | 500 | Something went wrong. Please try again. | Yes | Retry once with backoff. Then surface generic error. |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable. | Yes | Show maintenance state if persistent. |
| `UPSTREAM_UNAVAILABLE` | 502 | A required service is unavailable. | Yes | Retry with backoff. |

---

## Cross-references

- All these codes are referenced from [CONTRACT.md](./CONTRACT.md) per-endpoint. If a code appears here but not in CONTRACT.md it should still be considered legal — the contract lists *expected* errors, not the complete set.
- [STATE-MACHINE.md](./STATE-MACHINE.md) references these codes as transition triggers.
- [THREAT-MODEL.md](./THREAT-MODEL.md) discusses why some codes deliberately conflate cases (e.g. `AUTH_INVALID_CREDENTIALS` covers both bad-email and bad-password).

<!-- REVIEW: Returning HTTP 410 for a deleted account is debatable; some shops use 401 to avoid leaking that the email exists. Same argument applies to AUTH_ACCOUNT_DISABLED. The strawman picks "be honest about the state" because the user genuinely needs to know they can't sign in. Worth challenging. -->
