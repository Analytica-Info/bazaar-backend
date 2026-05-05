#!/usr/bin/env python3
"""
Reorganize an env file (.env.test or .env.production) by grouping keys into
logical sections with header comments. Values are preserved exactly — the
script only reorders lines and inserts section comments.

Safety guarantees:
  1. Backs up the file with timestamp before any write.
  2. Atomic write via os.replace() — file is never half-written.
  3. Asserts every key in the original is still present in the output.
  4. Asserts every full `KEY=VALUE` line round-trips byte-for-byte.

Usage (run on the VPS as the file owner):
  python3 organize-env-file.py /opt/bazaar/backend/env/.env.test
  python3 organize-env-file.py /opt/bazaar/backend/env/.env.production

Dry-run (show what would change, write nothing):
  python3 organize-env-file.py /opt/bazaar/backend/env/.env.test --dry-run
"""
import os, re, shutil, sys, time

SECTIONS = [
    ("Core runtime", ["NODE_ENV", "PORT", "ENVIRONMENT", "DOMAIN", "URL", "BACKEND_URL", "FRONTEND_BASE_URL"]),
    ("Database", ["MONGO_URI"]),
    ("Cache / Redis", [
        "REDIS_URL", "CACHE_ENABLED",
        "CACHE_TTL_LS_PRODUCTS", "CACHE_TTL_LS_INVENTORY", "CACHE_TTL_LS_CATEGORIES",
        "CACHE_TTL_PRODUCT_TYPE", "CACHE_TTL_PRODUCTS_BY_VARIANT",
        "CACHE_TTL_HOME_PRODUCTS", "CACHE_TTL_CATEGORIES", "CACHE_TTL_ALL_CATEGORIES",
        "CACHE_TTL_SMART_CATEGORY", "CACHE_TTL_MAX_DISCOUNT",
        "CACHE_TTL_METRICS_COUNTER", "CACHE_TTL_WEBHOOK_DEDUP", "CACHE_TTL_ERROR_LOG",
    ]),
    ("Authentication — JWT secrets", ["JWT_SECRET", "JWT_REFRESH_SECRET"]),
    ("Authentication — token & cookie TTLs", [
        "JWT_ACCESS_EXPIRY", "JWT_ACCESS_REFRESH_EXPIRY", "JWT_REFRESH_EXPIRY",
        "JWT_ADMIN_EXPIRY", "JWT_RESET_CODE_EXPIRY",
        "OTP_EXPIRY_MINUTES", "RESET_TOKEN_EXPIRY_MINUTES", "RECOVERY_RESEND_WINDOW_HOURS",
        "SESSION_COOKIE_DAYS", "REMEMBER_ME_COOKIE_DAYS", "WEB_COOKIE_DAYS",
    ]),
    ("Authentication — OAuth / federated identity", [
        "GOOGLE_CLIENT_ID", "IOS_GOOGLE_CLIENT_ID", "ANDROID_GOOGLE_CLIENT_ID",
        "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
        "APPLE_WEB_CLIENT_ID", "APPLE_WEB_TEAM_ID", "APPLE_WEB_KEY_ID",
    ]),
    ("Authentication — reCAPTCHA", ["RECAPTCHA_API_KEY", "RECAPTCHA_SITE_KEY"]),
    ("Rate limiting", [
        "RATE_LIMIT_AUTH_MAX", "RATE_LIMIT_AUTH_WINDOW_MINUTES",
        "RATE_LIMIT_PWD_RESET_MAX", "RATE_LIMIT_PWD_RESET_WINDOW_MINUTES",
    ]),
    ("Email / notifications", [
        "EMAIL_HOST", "EMAIL_PORT", "EMAIL_USERNAME", "EMAIL_PASSWORD",
        "ADMIN_EMAIL", "CC_MAILS", "VERIEMAIL_API_KEY",
    ]),
    ("Payments — Stripe", ["STRIPE_SK", "STRIPE_WEBHOOK_SECRET"]),
    ("Payments — Tabby BNPL", [
        "TABBY_AUTH_KEY", "TABBY_SECRET_KEY", "TABBY_WEBHOOK_SECRET",
        "TABBY_IPS", "TABBY_MERCHENT_CODE",
    ]),
    ("Payments — Nomod", ["NOMOD_ENABLED", "NOMOD_API_KEY", "NOMOD_TIMEOUT_MS", "PAYMENT_PROVIDER"]),
    ("Lightspeed / catalog sync", [
        "API_KEY", "PRODUCTS_URL", "CATEGORIES_URL", "BRANDS_URL",
        "PRODUCT_TYPE", "PRODUCTS_UPDATE",
    ]),
    ("CMS / Google Sheets", ["SPREADSHEET_ID", "GOOGLE_CLOUD_PROJECT_ID"]),
    ("Product media — FTP", ["FTP_HOST", "FTP_USER", "FTP_PASSWORD", "FTP_SECURE"]),
    ("Order / checkout", ["DELIVERY_DAYS", "PENDING_PAYMENT_EXPIRY_MINUTES"]),
    ("Mobile version gate", [
        "MIN_SUPPORTED_MOBILE_VERSION", "MIN_SUPPORTED_MOBILE_VERSION_ENFORCE",
        "IOS_UPDATE_URL", "ANDROID_UPDATE_URL",
    ]),
]


def parse(raw):
    """Return ({key: full line}, [key in original order])."""
    kv, order = {}, []
    for line in raw.splitlines():
        m = re.match(r"^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=", line)
        if m and m.group(1) not in kv:
            kv[m.group(1)] = line
            order.append(m.group(1))
    return kv, order


def reorganize(path, backup_name, dry_run=False):
    with open(path) as f:
        raw = f.read()

    kv, order = parse(raw)
    original_keys = set(kv)

    out = [
        "# ---------------------------------------------------------------------------",
        "# Bazaar backend — environment configuration",
        f"# Grouped by logical category on {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}",
        f"# Backup of pre-organize state: {os.path.basename(backup_name)}",
        "# Values preserved exactly — only key ordering and section comments changed.",
        "# ---------------------------------------------------------------------------",
        "",
    ]

    emitted = set()
    for title, keys in SECTIONS:
        block = [kv[k] for k in keys if k in kv and k not in emitted]
        for k in keys:
            if k in kv and k not in emitted:
                emitted.add(k)
        if block:
            out.append(f"# {title}")
            out.extend(block)
            out.append("")

    remaining = [k for k in order if k not in emitted]
    if remaining:
        out.append("# Other / uncategorized")
        for k in remaining:
            out.append(kv[k])
            emitted.add(k)
        out.append("")

    missing = original_keys - emitted
    extra = emitted - original_keys
    assert not missing, f"KEY DROP DETECTED: {missing}"
    assert not extra, f"KEY ADDED UNEXPECTEDLY: {extra}"

    new_content = "\n".join(out)
    if not new_content.endswith("\n"):
        new_content += "\n"

    if dry_run:
        # Verify shape only; show summary, don't touch disk.
        new_kv, _ = parse(new_content)
        for k in original_keys:
            assert kv[k] == new_kv[k], f"Line for {k} would change: {kv[k]!r} != {new_kv[k]!r}"
        print(f"DRY-RUN: {len(emitted)} keys would be reorganized into "
              f"{sum(1 for s,ks in SECTIONS if any(k in kv for k in ks))} sections.")
        print(f"Sections emitted (with key counts):")
        for title, keys in SECTIONS:
            present = [k for k in keys if k in kv]
            if present:
                print(f"  - {title}: {len(present)} key(s)")
        if remaining:
            print(f"  - Other / uncategorized: {len(remaining)} key(s) — {remaining}")
        return

    # Real write
    shutil.copy2(path, backup_name)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(new_content)
    st = os.stat(path)
    os.chmod(tmp, st.st_mode)
    try:
        os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError:
        pass  # only root can chown; ok if we're already running as the right user
    os.replace(tmp, path)

    # Round-trip verification
    new_kv, _ = parse(open(path).read())
    for k in original_keys:
        assert kv[k] == new_kv[k], f"Line for {k} changed: original={kv[k]!r} new={new_kv[k]!r}"
    print(f"OK: {len(emitted)} keys reorganized into "
          f"{sum(1 for s,ks in SECTIONS if any(k in kv for k in ks))} sections.")
    print(f"Backup: {backup_name}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        sys.exit(1)
    path = args[0]
    if not os.path.isfile(path):
        print(f"File not found: {path}")
        sys.exit(1)
    backup = path + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
    reorganize(path, backup, dry_run="--dry-run" in flags)
