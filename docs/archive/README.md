# Archived docs

Time-bound audits, snapshots, and sprint artifacts that are no longer
the source of truth but are preserved for historical record. Living
documentation is at the top level of `docs/`.

## Convention

Each subdirectory corresponds to a discrete sprint, migration, or
quarter. The directory name is `YYYY-qN-<topic>` (e.g.
`2026-q2-v2-migration`). Files inside are date-frozen at the point
they were archived — do not edit them after archival; they're history.

If you need to update an idea that lived in an archived audit, write a
new living doc at the top level of `docs/` and link back to the
archived audit for context.

## What's archived

| Directory | Topic | When |
|-----------|-------|------|
| [2026-q2-v2-migration/](2026-q2-v2-migration/) | One-time audits produced during the v2 API unification sprint — v1 backward-compat verification, login-flow inventory, payment-flow parity, mobile-build prod audit. Superseded by the living `docs/V2_URL_CONTRACT.md`, `docs/MOBILE-VERSION-COMPATIBILITY.md`, and `docs/api-changelog.md`. | Archived 2026-05-17 |
