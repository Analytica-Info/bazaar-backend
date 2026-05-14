# Login Flow Audit (2026-05-01)

Branch: `feat/v2-api-unification`. Audit covers `bazaar-web` (main),
`Bazaar-Admin-Dashboard` (main), `Bazaar-Mobile-App` (main b5e76a3) against
backend mounts in `src/server.js:303-330` (v1) and `src/routes/v2/index.js`.

## Summary

| | Count |
|---|---|
| Total flows audited | 27 |
| OK | 24 |
| DRIFT | 2 |
| GONE | 0 |
| NEW (informational) | many — entire `/v2/auth/*` surface unused by clients |

No client currently calls `/v2/auth/*`. v2 router is only consumed by
`bazaar-web/src/services/recommendations.js` (recommendations only). All
login flows still travel the v1 paths.

---

## Web (`bazaar-web`) — base URL `VITE_REACT_APP_API_URL`, `axios.defaults.withCredentials = true` (`src/main.jsx:26`)

### Email/password login — OK
- Client `src/account/Login.jsx:756`: `POST /user/login` with `{ email, password, rememberMe }`. Reads only `response.status`.
- Backend `src/routes/ecommerce/userRoutes.js:16` -> `controllers/ecommerce/userController.js:62`. Sets httpOnly `user_token` cookie via `setCookie` (`userController.js:18-29`, `sameSite=none`, `secure`, `maxAge` from `runtimeConfig.auth.{sessionCookieMaxAgeMs|rememberMeCookieMaxAgeMs}` — defaults 7 / 30 days, `src/config/runtime.js:104,110`). Returns `{ message }` on 200, `{ message }` on error (status 400 for bad creds, `services/auth/use-cases/login.js:31,54,60`).

### Google OAuth login — OK
- Client `src/account/Login.jsx:684`, `src/account/SignUp.jsx:137`: `POST /user/google-login` with `{ tokenId }`.
- Backend `userRoutes.js:21` -> `userController.js:86`. Verifies via `googleVerifier.js` against `GOOGLE_CLIENT_ID` env (web path uses default audience, `services/auth/adapters/googleVerifier.js:18,27,46`). Sets cookie + returns `{ message, refreshToken }`. Client only checks status.

### Apple OAuth login — OK
- Client `src/account/Login.jsx:724`, `SignUp.jsx:180`: `POST /user/apple-login` with `{ idToken, authorizationCode }`.
- Backend `userRoutes.js:22` -> `userController.js:113`. Sets cookie then **redirects** to `${APPLE_SUCCESS_URL || WEB_URL+'/success'}?apple_login=success` (line 145). Client uses status 200 — but `axios` follows the 302 to the success URL, so `apiResponse.status` reflects the final hop. Behavior matches prior; flagging as OK with note that this relies on success URL resolving 200 OK (which is the SPA shell).

### Logout — OK
- Client `src/account/Logout.jsx:14`: `POST /api/user/auth/logout` (axiosInstance with credentials).
- Backend inline route `src/server.js:258-266`: clears `user_token` cookie, returns 200 `{ message }`. Match.

### Refresh token — OK (not used)
- Web client never calls a refresh endpoint; relies on `axiosInstance` 401 → redirect (`src/axiosInstance.js:21-29`). Backend exposes `/api/auth/refresh-token` (mobile namespace) — irrelevant to web. NEW: `/v2/auth/refresh-token` exists for v2 mobile only.

### Forgot password / Verify code / Reset password — OK
- Forgot: `Login.jsx:132,607` `POST /user/forgot-password { email }` -> `userController.js:234`, returns `{ message }`. Match.
- Verify: `Login.jsx:299` `POST /user/verify-code { email, code }` -> `userController.js:246`. Match.
- Reset: `Login.jsx:444` `POST /user/reset-password { email, code, new_password }` -> `userController.js:291` reads `{ email, code, new_password }` (`userController.js:293`). Match.

### Auth check / current user — OK
- Client uses two probes:
  - `axiosInstance.get('/api/user/auth/check')` (`Header.jsx`, `Dashboard.jsx`). Backend `src/server.js:267-279` returns `{ authenticated, user }`. Match.
  - `axiosInstance.get('/api/user/profile')`. Backend `src/server.js:281-294` returns flat user object + `coupon`. Match.

### Resend recovery code — OK
- Client `SignUp.jsx:263` `POST /user/resend-recovery-code { email }` -> `userRoutes.js:27` -> controller `resendRecoveryCode`. Status 200/error path used loosely. Match.

### Register — OK
- Client `SignUp.jsx:318` `POST /user/register`. Backend `userController.js:35`. Returns 201 `{ message }` or 200 `{ message: 'Account restored successfully' }`. Match.

### Recovery account (account recovery flow) — OK
- Client `SignUp.jsx:229` `POST /user/recovery-account { email, recoveryCode, newPassword }`. Backend `userController.js:357` reads same shape. Match.

---

## Admin (`Bazaar-Admin-Dashboard`) — base URL `VITE_REACT_APP_API_URL`, Bearer token in `sessionStorage`

### Email/password admin login — OK
- Client `src/components/Login/Login.jsx:37`: `POST /admin/login { email, password }`. Reads `response.data.token` and `response.data.data` (lines 41-44). Stores token in `sessionStorage`.
- Backend `routes/ecommerce/adminRoutes.js:41` -> `controllers/ecommerce/adminController.js:79`. Returns `{ token, data: admin }`. Match.

### Forgot / verify / reset / update password — OK
- Forgot: `Login.jsx:72` `POST /admin/forgot-password { email }` -> `adminController.js:95` `{ message }`. Match.
- Verify: `Login.jsx:95` `POST /admin/verify-code { email, code }` -> `adminController.js:108` `{ message }`. Match.
- Reset: `ResetPasswordModal.jsx:14` `POST /admin/reset-password { email, code, newPassword }` -> `adminController.js:121` reads `{ email, code, newPassword }`. Match.
- Update password (post-login): client uses Bearer + `POST /admin/update-password` (route `adminRoutes.js:45`) reading `{ oldPassword, newPassword }` (`adminController.js:134`). Match.

### Auth check / current admin — OK
- Client `AdminContext.jsx:21`: `GET /admin/admins/me` with Bearer.
- Backend `adminRoutes.js:33` -> `adminController.js:424`. Returns `{ success: true, admin }`. Client reads `response.data.success && response.data.admin` (`AdminContext.jsx:25`). Match.

### Logout — OK (client-side only)
- Admin clears `sessionStorage`; no backend call. No drift.

---

## Mobile (`Bazaar-Mobile-App`, commit b5e76a3) — base URL `AppConfig.apiBaseUrl`, Bearer token from prefs (`api_service.dart:43-47`)
Confidence HIGH unless noted.

### Email/password login — OK
- Client `lib/controllers/auth_controller.dart:569`: `POST /api/auth/login { email, password, fcmToken }` (raw `http.post`, no Bearer). Reads `data['token']`, `data['refreshToken']`, `data['data'][...]` via `storeUserPref` (`auth_controller.dart:1210-1215`).
- Backend `routes/mobile/authRoutes.js:10` -> `controllers/mobile/authController.js:123`. Returns `{ token, refreshToken, fcmToken, data:user, coupon, totalOrderCount, usedFirst15Coupon }`. Match.

### Register — OK
- Client `auth_controller.dart:207` `POST /api/auth/register` — reads only status + `data['message']`. Backend `authController.js:99` returns `{ message }`. Match.

### Google login (Android & iOS) — OK
- Client `auth_controller.dart:870` `POST /api/auth/google-login { tokenId, fcmToken }` with header `User-Agent: android|ios` (`auth_controller.dart:875`).
- Backend `authController.js:64` calls `authService.googleLogin({ tokenId, ..., userAgent, platform:'mobile' })`. `googleVerifier.js:27-44` switches audience by `userAgent`/`platform` to `ANDROID_GOOGLE_CLIENT_ID` / `IOS_GOOGLE_CLIENT_ID`. Match — but **HIGH-severity dependency on env vars being set** for both client IDs in production.

### Apple login (mobile) — OK
- Client `auth_controller.dart:936` `POST /api/auth/apple-login { idToken, name, fcmToken }`.
- Backend `authController.js:30` -> `authService.appleLogin` returns `{ token, refreshToken, data, ... }`. Apple verifier audience = `clientId || APPLE_CLIENT_ID` (`appleVerifier.js:36`). Match.

### Refresh / check access token — DRIFT (client side)
- Client `lib/data/services/api_service.dart:102-145`: `POST /api/auth/check-access-token` with `Authorization: Bearer <access>` and `Authorization-Refresh: Bearer <refresh>`. Treats success as **only** when `data['accessToken'] != null`; otherwise returns `false` and triggers `handleSessionExpired()` (clears prefs + redirects to auth).
- Backend `authController.js:258` -> `services/auth/use-cases/checkAccessToken.js`. When access token is **still valid**, returns `{ valid:true, message, userId }` — **no `accessToken` field**. Only when expired AND refreshed does it return `{ valid:false, accessToken, refreshToken }` (lines 16, 45-50).
- **Verdict: DRIFT (client).** A 401 retry with a still-valid access token (or any 200 from `check-access-token` that isn't a refresh) will be misread as failure → user gets logged out. `_retryRequest` in `api_service.dart:50-86` only invokes refresh on 401, but the check itself is the problem when refresh is invoked. Behavior was the same before this branch (server response shape predates v2 work), so this is a pre-existing latent bug, not regression introduced by `feat/v2-api-unification`. Not a release-blocker for v2.
- The unused `/api/auth/refresh-token` route (`authRoutes.js:16`, controller line 242) returns `{ accessToken, refreshToken }` — that one would be matched, but mobile never calls it.

### Forgot / verify / reset password — OK
- `auth_controller.dart:625` `POST /api/auth/forgot-password { email }` → `authController.js:174` `{ message }`. Match.
- `auth_controller.dart:691` `POST /api/auth/verify-code { email, code }` → `authController.js:186` `{ message }`. Match.
- `auth_controller.dart:760` `POST /api/auth/reset-password { email, code, new_password }` → `authController.js:198` reads `{ email, code, new_password }`. Match.

### Logout — OK
- Mobile clears prefs locally (`api_service.dart:88-99`); no server call. No drift.

### Update profile — OK
- `auth_controller.dart:419` `POST /api/auth/user/update` (multipart with Bearer). Backend `authRoutes.js:19` mounts `multer` + `authController.userUpdate`. Match.

### Resend recovery code — OK
- `auth_controller.dart:825` `POST /api/auth/resend-recovery-code { email }` → `authRoutes.js:25`. Match.

### Recovery account — OK
- `auth_controller.dart:246` `POST /api/auth/recovery-account` → `authRoutes.js:24`. Match.

### Delete account — OK (functional but unconventional)
- Client `auth_controller.dart:990` `GET /api/auth/delete-account` (Bearer). Backend `authRoutes.js:22` is `router.get('/delete-account', authMiddleware, authController.deleteAccount)`. Match. (Style nit: destructive action over GET; not a drift.)

---

## Drift / risks

1. **DRIFT (mobile, pre-existing): `check-access-token` failure path.**
   `lib/data/services/api_service.dart:126-145` returns `false` whenever the
   server doesn't include `accessToken` in the body. The server only includes
   `accessToken` when refreshing an expired token; for a still-valid token it
   returns `{valid:true,...}`. Net effect: any path that calls
   `_retryRequest` after a transient 401 (e.g. server hiccup, eventual
   consistency) and gets a still-valid access token back will log the user
   out. Not a `feat/v2-api-unification` regression — server shape unchanged
   in this branch.

2. **Risk (config): Google audience env vars.** Mobile relies on the backend
   resolving `ANDROID_GOOGLE_CLIENT_ID` / `IOS_GOOGLE_CLIENT_ID`
   (`googleVerifier.js:31,33,38,40`). If either is unset in production,
   the corresponding platform login fails with `Invalid token audience`
   even though backend "looks fine." Verify these are set before shipping.

3. **Cookie max-age PR-MOD migration — OK.** Defaults
   (`runtime.js:104,110,116`) match prior hardcoded values
   (`SESSION_COOKIE_DAYS=7`, `REMEMBER_ME_COOKIE_DAYS=30`,
   `WEB_COOKIE_DAYS=1`). No client assumed a specific cookie expiry beyond
   axios 401 → redirect, so no client-side drift.

4. **NEW (informational): entire `/v2/auth/*` surface (web + mobile)**
   exists in `src/routes/v2/web/index.js:18-33` and
   `src/routes/v2/mobile/index.js:21-36` but **no client calls it yet**.
   Any future client cutover should be a separate, client-led PR — server
   side is ready. v2 envelope is `{ success, data, error, meta }` (per
   `controllers/v2/_shared/responseEnvelope`) and is **not** consumed
   anywhere outside recommendations.

## Recommended fixes (out of scope for this branch)

- Mobile (separate PR): patch `api_service.dart` `refreshToken()` to treat
  `data['valid'] == true` as success (return `true` without rotating the
  token), and only rotate when the body includes `accessToken`. This
  closes the spurious-logout drift.
- Backend: optionally add `valid:true, accessToken: <unchanged>` to the
  still-valid branch of `checkAccessToken.js` so legacy mobile builds
  recover; lower-effort than shipping a new app. Document as an MR alongside
  any forced client upgrade.

## Ship readiness (login only)

Yes — ship. No login flow on this branch is broken vs. main. The single
DRIFT (mobile `check-access-token` body check) is a pre-existing latent
bug whose behavior is unchanged by `feat/v2-api-unification`. v2 auth
routes are inert until a client adopts them.
