# Bazaar Backend — Unified API

Consolidated backend API for the Bazaar UAE e-commerce platform. Merges the Ecommerce web server and Mobile App API into a single Express application serving all clients.

## Clients Served

| Client | Auth Method | Original Port |
|--------|-------------|---------------|
| Storefront (React) | JWT cookie (`user_token`) | 5050 |
| User Dashboard (React) | JWT cookie (`user_token`) | 5050 |
| Admin Dashboard (React) | JWT Bearer header + RBAC | 5050 |
| Mobile App (Flutter) | JWT Bearer header + refresh tokens | 5000 |

All clients now point to a single server (default port 5000).

## Prerequisites

- **Node.js** 18+ (22 recommended)
- **MongoDB** (Atlas or local)
- **Firebase** service account JSON (for push notifications)
- **Stripe** account (for card payments)
- **Tabby** account (for installment payments)

## Setup

### 1. Clone and install

```bash
git clone git@github.com:Analytica-Info/bazaar-backend.git
cd bazaar-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all values. Required variables:

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed web origins (CORS) |
| `STRIPE_SK` | Stripe secret key |
| `TABBY_SECRET_KEY` | Tabby secret key |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USERNAME`, `EMAIL_PASSWORD` | SMTP credentials |

See `.env.example` for the full list.

### 3. Firebase setup

Place your Firebase service account JSON file at:

```
src/config/bazaar-2aa3a-firebase-adminsdk-fbsvc-<hash>.json
```

This file is gitignored and must be obtained from your Firebase console (Project Settings > Service Accounts > Generate New Private Key).

### 4. Apple Sign-In (optional)

If using Apple Sign-In, set these in `.env`:

```
APPLE_CLIENT_ID=com.example.bazaarECommerce
APPLE_TEAM_ID=<your-team-id>
APPLE_KEY_ID=<your-key-id>
APPLE_PRIVATE_KEY=<your-private-key-contents>
```

## Running

### Development

```bash
npm run dev
```

Starts with nodemon (auto-reload on file changes). Default port: 5000.

### Production

```bash
npm start
```

### Docker

```bash
# Development (with hot reload)
docker-compose up api-dev

# Production
docker-compose up api-prod
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node src/server.js` | Start production server |
| `npm run dev` | `nodemon src/server.js` | Start with auto-reload |
| `npm test` | `jest` | Run test suite (39 tests) |
| `npm run cron` | `node src/scripts/cronWorker.js` | Run cron jobs as standalone worker |
| `npm run seed:roles` | `node src/scripts/seedRolesAndPermissions.js` | Seed RBAC roles and permissions |
| `npm run migrate` | `node src/scripts/migrateOrderFields.js` | Dry run — show field inconsistencies |
| `npm run migrate:apply` | `...migrateOrderFields.js --apply` | Apply field sync across collections |
| `npm run migrate:cleanup` | `...migrateOrderFields.js --cleanup` | Remove old field names after verification |

## Project Structure

```
bazaar-backend/
├── src/
│   ├── server.js                          # Express app entry point
│   ├── config/                            # Database, JWT, Firebase, FTP config
│   ├── middleware/                         # Auth (cookie+bearer), admin, RBAC permissions
│   ├── models/                            # 42 Mongoose schemas
│   ├── controllers/
│   │   ├── ecommerce/                     # 16 controllers (web + admin endpoints)
│   │   ├── mobile/                        # 7 controllers (mobile app endpoints)
│   │   └── shared/                        # 2 controllers (identical across platforms)
│   ├── routes/
│   │   ├── ecommerce/                     # 12 route files → /admin/*, /user/*, /cart/*, /*
│   │   └── mobile/                        # 9 route files → /api/auth/*, /api/products/*, etc.
│   ├── services/                          # Framework-agnostic business logic
│   │   ├── cartService.js                 # Cart CRUD + gift-with-purchase logic
│   │   └── smartCategoriesService.js      # Product collections with configurable params
│   ├── helpers/                           # Validators, email verification, push notifications
│   ├── utilities/                         # Activity logger, backend logger, file upload
│   ├── mail/                              # Nodemailer SMTP config + email sender
│   └── scripts/                           # Cron jobs, migrations, seed scripts
├── uploads/                               # Runtime file uploads (gitignored)
├── tests/                                 # Jest test suites
├── Dockerfile                             # Multi-stage (dev + prod)
├── docker-compose.yml                     # Dev + prod services
├── .env.example                           # Environment variable template
└── package.json
```

## API Routes

### Ecommerce Routes (web + admin clients)

| Prefix | Description | Auth |
|--------|-------------|------|
| `/admin/*` | Admin panel operations (users, orders, CMS, analytics, roles, notifications, logs) | Admin JWT + RBAC |
| `/admin/roles/*` | Role management | Admin JWT |
| `/admin/permissions/*` | Permission management | Admin JWT |
| `/user/*` | User auth, profile, orders, reviews, notifications | User JWT (cookie) |
| `/cart/*` | Cart CRUD | User JWT (cookie) |
| `/webhook/*` | Lightspeed POS webhooks (product/inventory sync) | Signature |
| `/*` | Public routes — products, categories, search, CMS data, checkout | None / User JWT |

### Mobile API Routes (Flutter app)

| Prefix | Description | Auth |
|--------|-------------|------|
| `/api/auth/*` | Register, login, OAuth (Google/Apple), refresh token, account management | None / User JWT (Bearer) |
| `/api/products/*` | Product listing, search, categories, reviews, smart collections | None / User JWT (Bearer) |
| `/api/cart/*` | Cart CRUD with gift-with-purchase logic | User JWT (Bearer) |
| `/api/wishlist/*` | Wishlist CRUD | User JWT (Bearer) |
| `/api/order/*` | Checkout (Stripe/Tabby), orders, addresses | User JWT (Bearer) |
| `/api/notification/*` | User notifications, read/click tracking | User JWT (Bearer) |
| `/api/*` | Coupons, contact form, feedback, banners | None / User JWT (Bearer) |

### Shared Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (DB status, uptime) |
| `POST /tabby/webhook` | Tabby payment webhook |
| `GET /api/user/auth/check` | JWT validation from cookie |
| `POST /api/user/auth/logout` | Clear auth cookie |
| `GET /api/user/profile` | User profile with coupon status |

## Authentication

The unified auth middleware (`src/middleware/authMiddleware.js`) supports both token sources:

1. **Cookie** — `user_token` HttpOnly cookie (set by web login). Used by storefront and user dashboard.
2. **Bearer header** — `Authorization: Bearer <token>`. Used by mobile app and admin dashboard.

Cookie is checked first. If not present, falls back to Bearer header. Both work transparently.

### Admin Auth

Admin endpoints use a separate `adminMiddleware` that reads from Bearer header only, plus `permissionMiddleware` for RBAC with 45 permission slugs.

## Database

- **MongoDB** via Mongoose
- **42 model files** covering: users, products, orders, cart, wishlist, coupons, reviews, notifications, CMS content, admin/roles/permissions, activity logs, flash sales, payment tracking
- Models use `strict: false` where ecommerce and mobile backends wrote different field names to the same collection — this preserves all data without schema changes

### Migration

Both original backends wrote to the same MongoDB with slightly different field names. The migration script syncs these:

```bash
# See what's inconsistent (read-only)
npm run migrate

# Fix it
npm run migrate:apply

# After verifying, remove old field names
npm run migrate:cleanup
```

## Cron Jobs

Two scheduled jobs (run inside the API server or as a standalone worker):

| Job | Schedule | Description |
|-----|----------|-------------|
| Product sync | Daily 3 AM (Dubai) | Fetches products from Lightspeed POS, updates MongoDB |
| Notifications | Every minute | Sends scheduled push notifications via Firebase |

To run cron separately from the API:

```bash
npm run cron
```

## Testing

```bash
npm test
```

39 tests across 4 suites:
- **cartService** — Cart CRUD, stock validation, gift logic
- **smartCategoriesService** — Product collection queries
- **authMiddleware** — Cookie auth, Bearer auth, expired/blocked/missing tokens
- **wishlist** — Model-level CRUD operations

Uses `mongodb-memory-server` for isolated test database.

## Security

- **Helmet** — security headers (XSS, clickjacking, MIME sniffing protection)
- **Rate limiting** — 20 attempts/15min on login, 5 attempts/15min on password reset
- **Request size limits** — 10MB max body
- **CORS** — restricted to `ALLOWED_ORIGINS` for web; mobile (no origin) allowed
- **JWT validation** — server refuses to start if `JWT_SECRET` is missing
- **Cookie security** — `secure: true`, `sameSite: strict` in production
- **CMS protection** — all CMS write endpoints require admin auth
- **Global error handler** — no stack traces leaked to clients in production

## Deployment Notes

- All production services bind to `127.0.0.1` — use a reverse proxy (Nginx/Apache) in front
- Set `NODE_ENV=production` for secure cookies and minimal error responses
- Set `ALLOWED_ORIGINS` to your production domains
- Never commit `.env`, Firebase JSON, or Apple `.p8` files
- The `uploads/` directory must persist across deployments (mount as volume in Docker)

## Secrets Checklist

These files must NEVER be committed to git:

- `.env` — all environment variables with secrets
- `src/config/bazaar-*-firebase-adminsdk-*.json` — Firebase service account
- `*.p8` — Apple Sign-In private keys

All are covered by `.gitignore`. If you suspect secrets were committed in the past (from the original repos), rotate them immediately:
- Stripe API keys (both publishable and secret)
- JWT secrets
- SMTP passwords
- Tabby keys
- Firebase service account
