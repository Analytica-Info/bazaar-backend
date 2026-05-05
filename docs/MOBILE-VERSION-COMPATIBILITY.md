# Mobile Version Compatibility & Auth Migration Policy

> **Status:** policy + ops playbook. Effective 2026-05-04.

## The core principle

**v1 endpoints are frozen forever. All auth improvements ship in v2. Clients migrate to v2 on their own schedule.**

This is a one-line policy, but everything else in this document follows from it. Read this first; the rest is mechanics.

### Why this is the only sane policy for a published mobile app

Once a binary lands on a phone via the App Store / Play Store, you do not get to update it. Industry data: about 60% of users update within two weeks; a long tail of 15-25% are still on versions older than six months; some users **never** update. Any change to a v1 endpoint's response shape, status codes, or request contract will silently break those users with no recourse other than asking them to update.

The escape valve is **versioned endpoints**. v1 stays exactly as it is on the day this policy is signed. Every new feature, every bug fix that requires a shape change, every security improvement, lives in v2 (or v3, v4 later). Clients pull v2 in on their next release; old binaries keep using v1 forever.

### What this means in practice

- ✅ **Allowed in v1:** purely additive changes (new optional fields, new endpoints). Anything an old client can ignore.
- ✅ **Allowed in v1:** backend-internal changes that don't alter response shape (refactor, perf, logging).
- ✅ **Allowed in v1:** bug fixes where the old behavior was a crash or 500. Old apps can't depend on a crash, so fixing it is safe.
- ❌ **NOT allowed in v1:** renaming a field, changing a field's type, removing a field, changing a status code, changing the meaning of a value.
- ❌ **NOT allowed in v1:** any auth change that affects token format, signing, expiry, or cookie shape.
- ❌ **NOT allowed in v1:** adding a required header or required body field.

If someone proposes one of the ❌ items "just for v1," push back hard. The right answer is always "ship it in v2."

---

## Current state of the safety valve (2026-05-04)

The safety valve for force-updating old mobile versions is **not functional today.** Two bugs filed:

- **BUG-052 (HIGH)** — `MIN_SUPPORTED_MOBILE_VERSION` env var exists but no backend middleware enforces it. The value is echoed via `/api/mobile/config` only.
- **BUG-053 (HIGH)** — mobile app does not send `X-App-Version` header, does not consume `/api/mobile/config`, has no force-update dialog. No `package_info_plus` integration, no version comparison anywhere in `lib/`.

**Until these two bugs are fixed, you have no way to force a stale app version to update.** The mitigation is the v1-frozen policy itself: if you never break v1, you never need to force an update.

---

## What the safety valve looks like once fixed

### Backend side (BUG-052 fix)

A new middleware `src/middleware/versionGate.js`:

```
on every request:
  if request has X-App-Version header:
    if clientVersion < MIN_SUPPORTED_MOBILE_VERSION:
      return 426 Upgrade Required
        body: { forceUpdate: true, minimumVersion: '...', updateUrl: '...' }
    else:
      proceed
  else:
    proceed (web/admin/cURL — no version-gate enforcement)
```

Two important details:
- **Skip when header absent.** Web and admin don't send the header; failing-open avoids breaking them.
- **Use semver comparison, not string comparison.** `1.0.10` is greater than `1.0.9`, but `'1.0.10' < '1.0.9'` is true under string ordering.

Add a `MIN_SUPPORTED_MOBILE_VERSION_ENFORCE=false` flag so the middleware can be deployed inert and turned on after the mobile side ships.

### Mobile side (BUG-053 fix)

In `Bazaar-Mobile-App`:

1. Add `package_info_plus` dependency (Flutter standard).
2. On app launch (before any login flow), read `PackageInfo.fromPlatform().version` and store it.
3. Call `GET /api/mobile/config`. Compare local version to `minSupportedVersion`. If lower, show a non-dismissable dialog with a deep link to the App Store / Play Store.
4. Add a Dio interceptor (or modify `ApiService` base headers) to send `X-App-Version: <currentVersion>` on every request.
5. Handle `426 Upgrade Required` responses by showing the same force-update dialog (covers any case where config wasn't fetched).

The dialog should not have a "skip" button. The user's only options are "Update Now" (deep link) or "Quit App."

---

## Token versioning (forward-looking)

Even with the policy of "all auth changes in v2," you'll eventually want to evolve v2's token format. The protection mechanism is **token version stamps**.

Every JWT issued by v2 carries a `tv` claim:

```json
{
  "sub": "user-id",
  "iss": "bazaar-backend",
  "aud": "bazaar-mobile",
  "iat": 1714694400,
  "exp": 1714698000,
  "jti": "uuid",
  "tv": 1
}
```

When you change anything about the token format (new claims, new signing algorithm, new structure), you bump `tv` to 2. The verifier accepts both `tv: 1` and `tv: 2` for one full refresh-token TTL window (currently 7 days). After that window, the verifier rejects `tv: 1` — clients are forced through `/refresh`, which issues a `tv: 2` token.

This is how big-tech rolls forward auth changes without coordinating with mobile releases. **Build this into v2 from day one** — adding `tv` later is itself a breaking change.

---

## Per-change deployment strategies

Different categories of auth change need different rollout playbooks.

### Category A — Bug fixes that don't change shape (deploy now)

Examples: BUG-003, BUG-004 (`req.user?._id` guards), BUG-006 (string typo), BUG-046 (iOS Google audience).

**Strategy:** ship as a normal PR. No phased rollout needed. Old apps benefit; nothing breaks.

### Category B — Additive shape changes to v1 (deploy now, carefully)

Examples: BUG-039 (add `accessToken` to checkAccessToken success path), BUG-041 (add `success: true` to checkCouponCode response).

**Strategy:** add the new field; never remove the old behavior. Verify no v1 contract test snapshot would change. Ship.

**Caveat:** mobile clients sometimes parse JSON strictly and reject unknown fields. Audit before assuming "additive = safe."

### Category C — JWT format changes (v2 only, two-phase deploy)

Examples: HS256 → RS256, adding `iss`/`aud`/`jti`, refresh-token rotation.

**Strategy:**

```
Phase 1 — Deploy backend
  - Sign new tokens with new format (e.g., RS256, with new claims)
  - Verifier accepts BOTH old format (HS256) and new format (RS256)
  - Issue period: tokens issued post-deploy are new format
Phase 2 — Soak window
  - Wait for the longest-lived old token to expire naturally
  - For your config: 7 days (refresh token TTL)
  - Monitor: count of HS256 tokens still being verified, should trend to zero
Phase 3 — Cleanup
  - Verifier stops accepting old format
  - Old signing key can be rotated out of the keystore
```

**Never skip phase 2.** Removing old format support immediately would log out every active user.

### Category D — Refresh-token rotation with reuse detection

When you adopt rotation (BUG-048), pre-existing refresh tokens cannot be treated as suspicious on first use. They were issued before rotation existed.

**Strategy: grandfather mode.**

```
Phase 1 — Deploy
  - New refresh tokens carry { rotation: true } claim
  - Pre-existing tokens (no claim) are accepted but never trigger reuse-detection
  - On first use of a grandfathered token: issue a new { rotation: true } token; old token marked used
Phase 2 — Soak
  - 7 days (refresh TTL), all tokens have rotated
Phase 3 — Cleanup
  - Verifier rejects tokens without { rotation: true } claim
```

### Category E — Things that genuinely require an app update

Examples: adding mandatory MFA, requiring a new request header, switching cookie format, changing the request shape mobile sends.

**Strategy:**

1. Ship a new mobile version that supports both old and new behavior.
2. Wait for adoption to reach ~90% (use analytics: `app_version` distribution from `/api/mobile/config` calls or in-app telemetry).
3. Bump `MIN_SUPPORTED_MOBILE_VERSION` to force the laggards to update.
4. Once the floor moves, turn on the new server-side enforcement.

This pattern requires BUG-052 + BUG-053 to be fixed first. Until then, **avoid Category E entirely.**

---

## Deploy runbook template

Every PR that touches auth must include this section in its description:

```markdown
## Auth-change deploy runbook

**Change category:** A / B / C / D / E

**Mobile impact:** none / additive / requires app update

**Web impact:** none / additive / breaking (web is easier — deploy and refresh)

**Token version bump?** no / yes (current → new)

**Soak window:** N/A / 7 days / 30 days

**Phases:**
  1. Deploy backend with feature flag OFF
  2. Toggle flag to 5%, monitor login_success_rate, refresh_success_rate, 401_count, 426_count for 24h
  3. Ramp to 25%, 50%, 100% over 5 days
  4. After [soak window], remove old behavior code

**Rollback:** toggle flag OFF (no deploy needed)

**Monitors that must stay green during rollout:**
  - login_success_rate (target: ≥99%)
  - refresh_success_rate (target: ≥99.5%)
  - 401_count (no spike vs baseline)
  - 426_count (only nonzero if MIN_SUPPORTED_MOBILE_VERSION was bumped)
```

If a PR can't fill this section out, it's not ready to merge.

---

## v1 → v2 client migration plan (for the team)

When the backend hardening is complete and you're ready to migrate clients:

1. **Per resource, pick a cutover date.** Start with the resources that have the smallest API surface and fewest consumers. Auth is *not* the first one — it's the most coupled.
2. **Mobile and web migrate independently.** Don't wait for both.
3. **Each client release migrates one resource.** Don't migrate everything in one mobile release — too much risk.
4. **For each migration:**
   - Mobile/web release with v2 calls behind a feature flag (default OFF).
   - Wait until that release reaches 50%+ adoption.
   - Toggle flag ON for 5% → 25% → 100% over a week.
   - Once stable, mobile/web stop calling v1 entirely in their next release.
   - Once analytics show 0 v1 calls for 30 days, the v1 endpoint can be removed.

**Order of migration (suggested):**
1. Auth (foundation)
2. Cart (frequent, low-risk)
3. Product list / detail (read-only, low-risk)
4. Order placement / checkout (high-risk, high-value — last)

---

## Quick reference: when to use what

| Situation | Action |
|---|---|
| Bug crashes a v1 endpoint | Fix in v1 (Category A) — old apps can't depend on crashes |
| Bug returns wrong status code | Fix in v1 if backwards compatible, else v2 |
| Need to add a new field to v1 | Yes if additive only, never if it replaces a field |
| Need to change v1 field type | No. Build in v2. |
| Need to add MFA | v2 only. Plus mobile release with v2 support. Plus floor bump after adoption. |
| Need to rotate JWT signing key | Two-phase deploy with 7-day soak. Token version stamp. |
| Need to change cookie shape | v2 only. Web migrates faster than mobile; treat them separately. |
| Suspicious traffic from old app version | Bump `MIN_SUPPORTED_MOBILE_VERSION` (only after BUG-052 + BUG-053 are fixed) |

---

## Action items, ordered

1. **Fix BUG-052** — DONE (pending merge). `versionGate` middleware implemented in `src/middleware/versionGate.js`. Deployed inert with `MIN_SUPPORTED_MOBILE_VERSION_ENFORCE=false` by default. Flipping enforcement to `true` is a separate ops step — see `docs/CONFIG.md` for the runbook.
2. **Coordinate with mobile team on BUG-053** — `package_info_plus`, `X-App-Version` interceptor, force-update dialog. Ship in next mobile release.
3. **Once mobile release adoption ≥80%** — turn on `MIN_SUPPORTED_MOBILE_VERSION_ENFORCE=true`. The safety valve is now functional.
4. **For v2 auth design** — bake in `tv` (token version) claim from day one. Use RS256/ES256, not HS256. Issue tokens with `iss`/`aud`/`sub`/`jti` populated.
5. **For v2 auth design** — implement refresh-token rotation with reuse detection from day one (don't bolt it on later — that's its own migration).
6. **For every auth PR going forward** — require the deploy runbook section in the description.

---

## Cross-references

- `docs/BUGS.md` — BUG-046 (iOS Google audience), BUG-047..051 (auth security gaps), BUG-052 (version-gate middleware missing), BUG-053 (mobile-side version check missing)
- `docs/LOGIN-AUDIT.md` — current state of all 27 login flows
- `docs/CRITICAL-FLOWS-AUDIT.md` — cart/checkout/payment shape parity
- `docs/api-map/MAP.md` — full v1/v2 endpoint inventory with `V2-DEV` markings
