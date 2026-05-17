# Bazaar Platform — Deployment Map

**Single source of truth for what's deployed where, how to deploy each piece, and how to roll back.**

Hostinger VPS — single machine running multiple Docker containers + nginx reverse proxy.

- VPS: `89.116.33.22` (`srv650187`)
- SSH: `ssh -i ~/.ssh/hostinger_bazaar root@89.116.33.22`
- Deploy infra root: `/opt/bazaar/`
- Last updated: 2026-05-05

---

## 1. Active Services

### Docker containers (managed by `/opt/bazaar/docker-compose.yml`)

| Container | Image | Host port → Container port | Routed via nginx | Source repo path |
|---|---|---|---|---|
| `bazaar-backend-prod` | `bazaar-backend-prod` | `127.0.0.1:4002` → 3000 | `app.bazaar-uae.com`, `bazaar-ecom-server.bazaar-uae.com` | `/opt/bazaar/backend/repo/` |
| `bazaar-backend-test` | `bazaar-backend-test` | `127.0.0.1:4001` → 3000 | `test-server.bazaar-uae.com` | `/opt/bazaar/backend/repo/` (shared with prod) |
| `bazaar-web-prod` | `bazaar-frontend-prod` | `127.0.0.1:4012` → 80 | `www.bazaar-uae.com` | `/opt/bazaar/frontend/repo/` |
| `bazaar-web-test` | `bazaar-frontend-test` | `127.0.0.1:4011` → 80 | `test.bazaar-uae.com` | `/opt/bazaar/frontend/repo/` (shared) |
| `bazaar-admin-prod` | `bazaar-admin-prod` | `127.0.0.1:4022` → 80 | `dashboard-8m3v6z1p9t.bazaar-uae.com` | `/opt/bazaar/admin/repo/` |
| `bazaar-admin-test` | `bazaar-admin-test` | `127.0.0.1:4021` → 80 | (no public vhost; access via SSH tunnel) | `/opt/bazaar/admin/repo/` (shared) |
| `bazaar-redis` | `redis:7-alpine` | `6379` (container-internal only) | (n/a — internal cache) | (no source; pulled image) |

### Auxiliary apps (separate from docker-compose)

| App | Type | Location | Routed via |
|---|---|---|---|
| Auction server | Node (raw) | `/home/bazaar-uae-test-auction-server/` | `test-auction-server.bazaar-uae.com` |
| Auction static frontend | Static files | `/home/bazaar-uae-test-auction/htdocs/` | `test-auction.bazaar-uae.com` |
| User dashboards (test) | Static files | `/home/bazaar-uae-test-user-dashboard/htdocs/` etc. | `test-*-dashboard.bazaar-uae.com` |
| `clp` system app | Hostinger built-in | `/home/clp/` | (panel-managed) |

### Stopped / abandoned containers (do not restart blindly)

```
bazaar-dashboard-bazaar-uae-dashboard-prod-1  Exited 2 weeks ago
bazaar-react-client-dev-1                     Exited 3 weeks ago
bazaar-react-client-prod-1                    Exited 2 weeks ago
bazaar-react-server-prod-1                    Exited (137 = OOM-kill?) 2 weeks ago
bazaar-react-server-dev-1                     Exited (137) 2 weeks ago
```

These predate the Docker-Compose-managed setup. Removable with `docker rm <name>` once you've confirmed nothing in `/opt/bazaar/` references them.

---

## 2. Deployment Procedures

All deploys run as `root` on the VPS, from `/opt/bazaar/`.

### Backend (Node.js Express server)

**Source:** GitHub `Analytica-Info/bazaar-backend`, branch `main` for prod, any branch for test.

**Test:**
```bash
cd /opt/bazaar
./deploy-backend.sh test main                   # default branch
./deploy-backend.sh test feat/v2-api-unification # alternate branch
```

**Production:**
```bash
cd /opt/bazaar
./deploy-backend.sh prod main
```

**What the script does** (per `/opt/bazaar/deploy-backend.sh`):
1. `cd /opt/bazaar/backend/repo && git fetch && git checkout <branch> && git pull`
2. `docker compose build backend-<env>`
3. `docker compose up -d backend-<env>` (recreates container)
4. Sleeps 5s, curls `http://localhost:400[12]/health`, reports HTTP status

**Note:** The `git pull` step happens against the shared `backend/repo` checkout. Test and prod deploys both modify this same git workspace — so don't deploy test from a feature branch and prod from main back-to-back without verifying the intended state. Or: fetch-only and reference SHAs explicitly if doing parallel work.

### Web frontend (React)

**Source:** GitHub `Analytica-Info/bazaar-web` (or similar), branch `main` for prod.

```bash
cd /opt/bazaar
./deploy-frontend.sh test main
./deploy-frontend.sh prod main
```

**What it does:**
1. `cd /opt/bazaar/frontend/repo && git fetch && git checkout <branch> && git pull`
2. Copies `/opt/bazaar/frontend/env/.env.<env>` → `frontend/repo/.env` (Vite needs it at build time)
3. `docker compose build frontend-<env>`
4. `docker compose up -d frontend-<env>`
5. Sleeps 3s, curls `http://localhost:401[12]/`

### Admin dashboard (React, Vite)

**Source:** GitHub admin dashboard repo.

```bash
cd /opt/bazaar
./deploy-admin.sh test main
./deploy-admin.sh prod main
```

**What it does:**
1. `cd /opt/bazaar/admin/repo && git fetch && git checkout <branch> && git pull`
2. Reads `VITE_REACT_APP_API_URL` from `/opt/bazaar/admin/env/.env.<env>` (Vite-time env injection)
3. Removes any inherited `.env*` files in the repo (so they don't bleed into the build)
4. `docker compose build --build-arg VITE_REACT_APP_API_URL="..." admin-<env>`
5. `docker compose up -d --force-recreate admin-<env>`
6. Sleeps 3s, curls `http://localhost:402[12]/`

### Full platform deploy

Convenience script that deploys all 6 containers (backend × 2, frontend × 2, admin × 2):

```bash
cd /opt/bazaar
./deploy-all.sh [branch]
```

Sequence: `backend test → backend prod → frontend test → frontend prod → admin test → admin prod`. Each step calls the per-component script. If any step fails (`set -e`), subsequent steps don't run.

**Use sparingly** — for routine deploys, run only the components you actually changed. `deploy-all.sh` is for first-deploy-of-the-day or when multiple repos shipped together.

---

## 3. Environment Files

Per-component `.env` files live under `/opt/bazaar/<component>/env/`:

```
/opt/bazaar/
├── backend/env/
│   ├── .env.production    # 82 keys — backend prod runtime config
│   ├── .env.test          # 72 keys — backend test runtime config (subset of prod)
│   └── .env.test.backup   # Apr 13 historical
├── admin/env/
│   ├── .env.production    # admin prod (mostly VITE_* build-time)
│   └── .env.test
└── frontend/env/
    ├── .env.production
    └── .env.test
```

**File format**: `KEY=value` (no whitespace around `=`, normalized 2026-05-05). Multi-line PEM values supported (e.g., `APPLE_PRIVATE_KEY`).

**Section organization**: Backend env files use canonical sections (Core runtime, Database, Cache/Redis, Auth, Email, Payments — Stripe/Tabby/Nomod, Lightspeed, CMS, FTP, Order, Mobile gate). See `scripts/organize-env-file.py` in the bazaar-backend repo for the categorization map.

**Required keys (backend)** — without these, container crashes at startup:
- `MONGO_URI`, `JWT_SECRET`, `STRIPE_SK`, `API_KEY` (Lightspeed)

**Validation**: run `node scripts/validateEnv.js` (script lives in repo, not in container; copy via `docker cp`).

---

## 4. Health Endpoints

All backend containers expose:

| Path | Returns 200 when |
|---|---|
| `/health` | Process is alive (extended status: uptime, database) |
| `/healthz` | Process liveness only |
| `/readyz` | Mongo connection ready |

Smoke-test command (from VPS):
```bash
for p in 4001 4002; do
  for ep in health healthz readyz; do
    curl -s -o /dev/null -w "$p/$ep: %{http_code}\n" http://localhost:$p/$ep
  done
done
```

---

## 5. Rollback Procedures

### Backend or frontend rollback

`deploy-backend.sh` and `deploy-frontend.sh` only accept branch names, not SHAs. To roll back to a specific commit:

```bash
cd /opt/bazaar/backend/repo                       # or frontend/repo / admin/repo
git fetch
git checkout <previous-good-sha>
cd /opt/bazaar
docker compose build backend-prod                 # or backend-test / frontend-prod / admin-prod
docker compose up -d backend-prod
sleep 8
curl -s -o /dev/null -w '/health: %{http_code}\n' http://localhost:4002/health
```

Known-good rollback target SHAs (update as you ship):
- backend prod last-known-good before BUG-054 hotfix: `ad9d275`
- backend prod last-known-good before BUG-056 hotfix: `c010ae0`

### nginx-config rollback (pre-Docker migration safety net)

`/opt/bazaar/rollback-production.sh` restores all `*.pre-swap` nginx vhost configs to active. Use only if the **entire Docker migration regresses** — would route traffic to legacy non-Docker backends on ports 3001/3002 (only if those processes are still running).

```bash
/opt/bazaar/rollback-production.sh
```

### Env file rollback

Every env-file modification creates a timestamped `.bak-YYYYMMDD-HHMMSS` next to it. To restore:

```bash
ssh -i ~/.ssh/hostinger_bazaar root@89.116.33.22 \
  'cp /opt/bazaar/backend/env/.env.production.bak-<timestamp> /opt/bazaar/backend/env/.env.production'
# Container won't reload until next deploy/recreate
```

---

## 6. Nginx Reverse Proxy (vhost → backend map)

```
                                  ┌────────────────────────────┐
                                  │  Hostinger VPS 89.116.33.22 │
                                  │   nginx → containers       │
                                  └────────────────────────────┘
              ┌──────────┬─────────────┬─────────────┬──────────┐
              ▼          ▼             ▼             ▼          ▼
         backend-prod backend-test  web-prod     web-test    admin-prod
         :4002        :4001         :4012        :4011       :4022
              ▲          ▲             ▲             ▲          ▲
              │          │             │             │          │
   app.bazaar-uae.com         test-server.bazaar-uae.com
   bazaar-ecom-server.        test.bazaar-uae.com
     bazaar-uae.com           www.bazaar-uae.com (PROD WEB)
                              dashboard-8m3v6z1p9t.bazaar-uae.com
```

| Public hostname | Listen | Routes to | Notes |
|---|---|---|---|
| `app.bazaar-uae.com` | 80, 443 (SSL+QUIC) | backend-prod (4002) | Mobile app and primary backend |
| `bazaar-ecom-server.bazaar-uae.com` | 80, 443 | backend-prod (4002) | Legacy alias, ~3k req/day |
| `www.bazaar-uae.com` | 80, 443 | web-prod (4012) | Public storefront |
| `test-server.bazaar-uae.com` | 80, 443 | backend-test (4001) | Staging API |
| `test.bazaar-uae.com` | 80, 443 | web-test (4011) | Staging storefront |
| `dashboard-8m3v6z1p9t.bazaar-uae.com` | 80, 443 | admin-prod (4022) | Obfuscated admin URL |
| `test-admin-dashboard.bazaar-uae.com` | 80, 443 | static `/home/...` | Static admin staging |
| `test-auction-server.bazaar-uae.com` | 80, 443 | auction backend | Separate auction app |
| `test-auction.bazaar-uae.com` | 80, 443 | static auction frontend | |
| `ecom-user-dashboard.bazaar-uae.com` | 80, 443 | static `/home/...` | |
| `default.conf` | 80 default_server | returns 444 (drop) | Security default |
| `docker-sites.conf` | 80, 443 | `:5050` and `:8080` | Other Docker apps |

**Traffic levels (last 7 days)**:
- High: `app.bazaar-uae.com` (~410k req/wk), `www.bazaar-uae.com` (~244k req/wk), `bazaar-ecom-server` (~20k req/wk)
- Low: most `test-*` static sites (<300 req/wk)

**Recently removed (2026-05-05)**: `test-app.bazaar-uae.com.conf` — was a temporary mobile-app redirect, DNS no longer pointed here. Backup at `/root/test-app.bazaar-uae.com.conf.deleted-20260505-113210`.

---

## 7. Process Management

- **Docker Compose** manages all backend/web/admin containers via `restart: unless-stopped`. Containers auto-restart on crash.
- **Hostinger** does NOT manage Node processes directly — earlier `deploy.sh` script in the repo claimed otherwise but it's misleading; use `/opt/bazaar/deploy-*.sh` instead.
- **No PM2, no systemd unit** for bazaar containers — Docker Compose is the only orchestrator.
- **Container health checks** (Docker `HEALTHCHECK` directive) periodically curl `/health` and mark container `unhealthy` if it fails 3× — Docker then restarts.

### Monitor script

```bash
/opt/bazaar/monitor.sh
```

Prints health and resource summary across all bazaar containers (use it as a quick "is anything wrong" check).

### Restart-old-backends script

```bash
/opt/bazaar/restart-old-backends.sh
```

Restarts the legacy non-Docker Node backends on `:3001` and `:3002`. Useful only as a safety net if the Docker container layer fully regresses and you need to fall back to pre-Docker. Pair with `rollback-production.sh` for full nginx revert.

---

## 8. Cron / Scheduled Tasks

- **Root crontab**: `0 3 * * * sudo clp-update` (Hostinger control-panel update, daily 3 AM)
- **`/etc/cron.d/`**: certbot (TLS renewal), `clp` (Hostinger), `docker-image-prune` (cleanup unused images), `e2scrub_all`, `php`, `sysstat`
- **Application-level cron** (inside backend containers): scheduled notifications + product sync (cron-managed by `node-cron` inside Node, not OS cron)

---

## 9. SSH Access

```bash
ssh -i ~/.ssh/hostinger_bazaar root@89.116.33.22
```

Key path: `~/.ssh/hostinger_bazaar` on the developer's local machine. Tied to the `root` account on the VPS — full privileges. Treat the key as you would the database root password.

---

## 10. Observability

### Container logs

```bash
docker logs bazaar-backend-prod --tail 50          # last 50 lines
docker logs bazaar-backend-prod --since 1h         # last hour
docker logs bazaar-backend-prod -f                 # follow live
```

Logs use structured Pino JSON (or pretty-print on dev branch). Volume cap: 50MB × 5 rotations = 250MB max per container, configured in `docker-compose.yml`.

### Nginx logs (per vhost)

```
/home/<vhost-app>/logs/nginx/access.log         # current day
/home/<vhost-app>/logs/nginx/access.log-YYYY-MM-DD  # historical, daily-rotated
```

Some vhosts (bazaar-uae.conf, default.conf, test-app.conf [now deleted]) have **no access_log directive** — traffic isn't logged.

### Docker stats

```bash
docker stats --no-stream
```

Live CPU/memory/network for each container.

---

## 11. Common Operational Recipes

### Deploy a backend hotfix to test, validate, then prod

```bash
# Local: open PR, get reviewed, merge to main on GitHub
# Then on VPS:
ssh -i ~/.ssh/hostinger_bazaar root@89.116.33.22 \
  'cd /opt/bazaar && ./deploy-backend.sh test main'
# Verify test container healthy
curl -s -o /dev/null -w '%{http_code}\n' https://test-server.bazaar-uae.com/health
# Then prod:
ssh -i ~/.ssh/hostinger_bazaar root@89.116.33.22 \
  'cd /opt/bazaar && ./deploy-backend.sh prod main'
curl -s -o /dev/null -w '%{http_code}\n' https://app.bazaar-uae.com/health
```

### Force-recreate a container without code change

(e.g., to pick up an env file change)

```bash
cd /opt/bazaar && docker compose up -d --force-recreate backend-test
```

### Inspect what's running in a container

```bash
docker exec -it bazaar-backend-prod sh
# inside: ls /app, cat package.json, etc.
```

### Tail backend errors only (real-time)

```bash
docker logs -f bazaar-backend-prod 2>&1 | grep -iE 'error|warn|fatal'
```

---

## 12. Known Quirks & Gotchas

1. **Shared git checkout for test and prod**: `/opt/bazaar/backend/repo/` is one git working tree. Deploying test to a feature branch then prod to main creates a checkpoint diff between deploys. Always end with main checked out, or use SHA-explicit checkouts.
2. **The repo's `deploy.sh`** (`bazaar-backend/deploy.sh`) is misleading — claims Hostinger auto-restarts the app. The real deploy mechanism is `/opt/bazaar/deploy-backend.sh` which rebuilds the Docker image. Don't follow the repo's script.
3. **Cold-start Redis race**: post-deploy `/health` curl in deploy-backend.sh sleeps 5s, but Redis client warm-up sometimes takes 6-8s. False-positive `WARNING: Health check returned HTTP 503` is benign — re-curl `/health` 8 seconds later, expect 200.
4. **`v2_api_unification` branch on test**: backend test container can run any branch via `./deploy-backend.sh test <branch>`. Use this for staging the v2 modernization work.
5. **V2 routes are mounted unconditionally.** The earlier `V2_ENABLED` env flag was removed in commit `547bc44` (2026-05-17) once v2 hardening landed and client integration began; the gate was creating dev/prod drift and phantom 404s. V1 routes (`/api/*`, `/check-coupon`, `/create-coupon`, `/coupon`, etc.) coexist unchanged.
6. **Stripe / Tabby / API_KEY** loaded into running containers come from `.env.production` (canonical as of 2026-05-05). Earlier setups had Hostinger panel injection; now consolidated into the env file.

---

## 13. Deprecated / Archived Paths (do NOT use)

These paths look like sources of truth but are not. Cleaned up 2026-05-05.

| Old path | New location | Why it was archived |
|---|---|---|
| `/home/bazaar-backend/` | `/home/_archive/bazaar-backend.20260505/` | Orphan git checkout. Real source is `/opt/bazaar/backend/repo/`. |
| `/home/bazaar-web/` | `/home/_archive/bazaar-web.20260505/` | Pre-Docker-Compose deploy mechanism. Real source is `/opt/bazaar/frontend/repo/`. |
| `bazaar-backend/deploy.sh` (in repo) | (file deleted 2026-05-05) | Claimed "Hostinger auto-restarts the app." False — production uses Docker. The deploy script that matters lives at `/opt/bazaar/deploy-backend.sh` on the VPS. Recovering the old script if ever needed: `git show <commit-before-deletion>:deploy.sh`. |

**To restore from archive** (if ever needed):
```bash
ssh root@89.116.33.22 'mv /home/_archive/<name> /home/<name>'
```

A pointer note has been left in `/home/README.md` on the VPS for anyone who SSHs in expecting to find the old paths.

### Files NOT to delete (despite looking deprecated)

| Path | Why keep |
|---|---|
| `/etc/nginx/sites-enabled/*.pre-swap` | Pre-Docker-migration rollback artifacts. Referenced by `/opt/bazaar/rollback-production.sh` for layer-1 nginx revert. |
| `/etc/nginx/sites-enabled/*.bak` | Same — historical safety nets. |
| `/etc/nginx/sites-enabled/*.pre-prodtest` | Same. |
| `/opt/bazaar/restart-old-backends.sh` | Legacy non-Docker fallback. Pair with rollback. |

---

## 14. To-Do / Future Improvements

- [ ] Add `access_log` directive to `bazaar-uae.conf` so test-domain traffic is measurable.
- [ ] Bump deploy script's post-deploy sleep from 5s to 12s, or replace with poll-loop, to eliminate cold-start 503 false positives.
- [ ] Consolidate the abandoned exited containers (`bazaar-react-*`, etc.) — currently take no resources but clutter `docker ps -a`.
- [ ] Document the auction-server deploy procedure (likely lives outside `/opt/bazaar/`).
- [ ] Add a CI step that runs `docker build` against the new package.json on every PR — would have caught BUG-055-style "deps in wrong block" pre-merge.
- [ ] Consider GitHub-Actions-driven deploy (current setup is SSH-only, no audit trail of who deployed what).
