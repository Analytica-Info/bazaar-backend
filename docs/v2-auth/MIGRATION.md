# v2 Auth Migration Plan

> Status: STRAWMAN. See [README.md](./README.md).
> Policy reference: [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md).

v1 endpoints are frozen forever. v2 is net-new. Each client moves on its own schedule. The shared pattern: **a client-side `bazaarAuth` SDK abstracts which version the call hits**, gated by a remote feature flag, with telemetry on both paths.

---

## Pattern: `bazaarAuth` SDK adapter

All three clients adopt the same indirection:

```ts
// Pseudo-TypeScript
class BazaarAuth {
  constructor(private flags: FeatureFlagClient) {}

  async login(email, password) {
    if (this.flags.isOn('auth.v2.login')) {
      return v2Login({ email, password, tokenDelivery: this.tokenDelivery() })
    }
    return v1Login({ email, password })
  }
  // similar for refresh, logout, signup, oauth, ...
}
```

Benefits:
- Single rollback lever (flip the flag).
- Per-method ramping (we can move `/login` to v2 while keeping `/refresh` on v1, or vice versa, if telemetry surprises us).
- Telemetry naturally gets a `version: "v1" | "v2"` tag.

The flag system is whatever the project already uses (unleash, growthbook, or a config-table); this doc doesn't pick one.

<!-- REVIEW: A method-by-method ramp is more flexible but more state to track. Some teams will argue "ramp the whole surface or nothing." The strawman keeps method-level granularity because login and refresh have very different risk profiles. -->

---

## Web (`bazaar-web`)

**Goal:** First client to migrate. Lowest user count of any *paying* surface, easiest rollback.

**Phases:**

| Phase | Duration | Users on v2 | Trigger to advance |
|-------|----------|-------------|---------------------|
| Internal | 1 week | 0 (employees only via cookie override) | No surprises in error rates / login funnel. |
| 5% | 3 days | 5% of sessions | v2 login success rate within 1pp of v1; refresh success ≥99%. |
| 25% | 4 days | 25% | Same gates; no spike in support tickets tagged `auth`. |
| 100% | 1 week observation | 100% | Same gates. After 1 week clean, v1 calls from web are deprecated (still work — see "Cleanup phase"). |

**Rollback:** flip flag → all sessions issued on v2 keep working (until refresh expires); new logins go back to v1. v2 sessions in flight do *not* break.

**Cookie domain note:** v2 cookies are `Domain=.bazaar-uae.com`, `SameSite=Strict`. v1 cookies (if any) live alongside; we don't need to clear them. The transition is zero-cookie-collision because cookie names differ (`bz_at` / `bz_rt` for v2; v1 used either `Authorization` headers or a different cookie name — verify before launch).

---

## Admin (`Bazaar-Admin-Dashboard`)

**Goal:** Migrate after web is stable. Lower urgency (smaller user base, internal tool).

**Notes:**
- Admin scope hits the full 12-char password floor immediately. Some staff will be forced to reset on first v2 login. Coordinate with Ops to pre-warn.
- Admin login should be MFA-required at v2 cutover. This is a policy bump, not a strawman invention. Confirm with security before flipping the default.

**Phases:** Same shape as web but compressed (1 week internal → 100% in single step).

**Rollback:** same flag pattern.

---

## Mobile (`Bazaar-Mobile-App`)

**Goal:** App release with v2 support; coordinate `MIN_SUPPORTED_MOBILE_VERSION` after adoption.

This is the hardest of the three because mobile cannot be flipped server-side past unsupported app versions.

**Steps:**

1. **App release N**: ships `bazaarAuth` SDK with both v1 and v2 paths. Flag-gated. Default to v1.
2. **Server flag flips** for app version ≥ N: `auth.v2.login = on` for that version cohort. Older versions still get v1.
3. **Adoption ≥80%** of N or later: bump `MIN_SUPPORTED_MOBILE_VERSION` to N. Clients on N-1 receive 426 with the upgrade nudge per `MOBILE-VERSION-COMPATIBILITY.md`.
4. **Subsequent app release N+1** drops the v1 code path entirely. Ships clean v2-only client.

**Refresh-token handling at cutover:**
- A user logged in via v1 has a v1 refresh token. v1 refresh stays on v1 — we don't try to upgrade tokens in place. After flag flip, the *next login* uses v2.
- Sessions that exist as v1 will expire naturally and not be refreshed past their TTL.
- The mobile SDK detects a v1 token in storage and either keeps using v1 refresh or clears it on next launch (configurable, default keep-using-v1-refresh-until-natural-expiry).

**Rollback:** server-side flag flip cohorts back to v1. App releases that already shipped v2-only (N+1+) cannot be rolled back without a force-update of clients onto N — accept this risk by keeping at least N+1 dual-stack until v2 has been stable for 60 days.

---

## Telemetry to watch

Per surface (web, mobile, admin), per version (v1, v2):

| Metric | Threshold |
|--------|-----------|
| Login success rate | v2 within 1 percentage point of v1; alert on ≥1pp drop sustained 30 min. |
| Refresh success rate | ≥99.0%; alert on <99.0%. |
| 401 rate (post-login) | Should track v1 baseline ±10%. |
| 426 (Upgrade Required) count | Alert on sudden jump after a flag flip. |
| MFA enrollment rate | Watch trend after v2 makes MFA available; not a gate. |
| `TOKEN_REUSE_DETECTED` rate | Alert on >0.1% of refreshes — indicates real attacks or a client bug. |
| Mean time-to-first-byte for `/v2/auth/login` | p95 ≤ 600 ms; alert on regression. |

Audit log fields (every v2 auth event): `userId, familyId, jti, eventType, client, appVersion, ip(/24), userAgent, outcome, errorCode, ts`.

---

## Cleanup phase

After **30 consecutive days of zero v1 traffic from a given client**:

1. Mark the v1 endpoints as deprecated in code (no behavior change, only annotations).
2. Wait one more billing cycle (30 days) for any forgotten clients to surface.
3. Remove v1 code paths and routes.

Until then, v1 is frozen but live. This aligns with [`MOBILE-VERSION-COMPATIBILITY.md`](../MOBILE-VERSION-COMPATIBILITY.md): freezing means we don't *change* v1, not that we delete it.

<!-- REVIEW: 30 + 30 days is conservative. Some teams cut to 7 + 14. Pick one and put it in the actual deletion runbook before launching v2. -->

---

## Rollback decision matrix

| Symptom | Action |
|---------|--------|
| v2 login success drops ≥3pp for 10 min | Flip `auth.v2.login` to off. Page on-call. |
| v2 refresh failures spike | Flip `auth.v2.refresh` to off. Investigate. New logins keep using v2 login but refresh on v1 — won't work mixed. So in practice, flip both off. |
| `TOKEN_REUSE_DETECTED` >1% of refreshes | Likely a client bug (storing tokens twice, double-firing). Don't flag-flip on its own; investigate. If genuinely under attack, flip v2 off and force re-auth. |
| Sudden 5xx on /v2/auth/* | Flip off; page; investigate. |
| Specific app version failing | Cohort flag off for that version only. |
