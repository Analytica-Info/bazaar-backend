# Bazaar Backend Architecture

## Layout

```
src/
├── config/           # App config, DB, Redis clients
├── controllers/      # Express request handlers (v1 and v2)
├── helpers/          # Thin cross-cutting utilities (email, push notifications)
├── middleware/        # Express middleware (auth, error handling, validation)
├── models/           # Mongoose schema definitions
├── repositories/     # Data-access layer — one repository per entity
│   └── index.js      # Registry that instantiates all repositories
├── services/
│   ├── _kernel/      # Foundation layer (PR-MOD-1) — see below
│   ├── payments/     # Payment provider strategy pattern (Stripe, Nomod)
│   ├── auth/         # Auth use-cases (PR-MOD-4)
│   ├── authService.js        # Thin facade → auth/
│   ├── checkout/     # Checkout use-cases (PR-MOD-3)
│   ├── checkoutService.js    # Thin facade → checkout/
│   ├── cms/          # CMS use-cases (PR-MOD-8)
│   ├── cmsService.js         # Thin facade → cms/
│   ├── coupon/       # Coupon use-cases (PR-MOD-8)
│   ├── couponService.js      # Thin facade → coupon/
│   ├── order/        # Order use-cases (PR-MOD-2)
│   ├── orderService.js       # Thin facade → order/
│   ├── product/      # Product use-cases + sync (PR-MOD-5)
│   ├── productService.js     # Thin facade → product/
│   ├── productSyncService.js # Thin facade → product/sync/
│   ├── smartCategories/      # Smart-category use-cases (PR-MOD-8)
│   ├── smartCategoriesService.js # Thin facade → smartCategories/
│   ├── admin/        # Admin use-cases (PR-MOD-7)
│   ├── adminService.js       # Thin facade → admin/
│   └── shared/       # Cross-service helpers
└── utilities/        # Low-level shared utilities (cache, clock, logger)
```

### _kernel directory layout

```
src/services/_kernel/
├── errors.js       # Typed DomainError hierarchy + isDomainError + toEnvelope
├── ports.js        # JSDoc-only port definitions (no runtime code)
├── cache.js        # Cache port adapters: makeRedisCache + makeNullCache
├── container.js    # makeContainer() — pure DI factory function
├── bootstrap.js    # Singleton container wired with real adapters
└── index.js        # Barrel re-export
```

### Target domain service layout (used from PR-MOD-2 onward)

```
src/services/<domain>/
├── index.js          # Public facade — keeps the same exports as the old <domain>Service.js
├── useCases/
│   ├── createOrder.js
│   ├── getOrder.js
│   └── ...
└── <domain>Service.js  # Thin shim that delegates to the facade (for backward compat)
```

---

## Ports

Ports are defined in `src/services/_kernel/ports.js` as JSDoc `@typedef` entries.
They are documentation artifacts; the file exports `{}` at runtime.

| Port | File | Purpose |
|------|------|---------|
| `Repository<T>` | ports.js | Uniform CRUD over any entity |
| `Clock` | ports.js | Swappable time source (matches `utilities/clock.js`) |
| `Cache` | ports.js | Key-value cache with TTL (matches `utilities/cache.js` interface) |
| `Logger` | ports.js | Structured logging (matches `pino` shape) |
| `PaymentProvider` | ports.js | Payment checkout / refund / webhook |
| `OAuthVerifier` | ports.js | Third-party identity token verification |
| `EmailSender` | ports.js | Transactional email |

Concrete adapters live in:
- `_kernel/cache.js` — `makeRedisCache` (wraps `utilities/cache.js`), `makeNullCache`
- `utilities/clock.js` — real clock + `setClock`/`resetClock` seam for tests
- `utilities/logger.js` — pino-based logger
- `repositories/index.js` — all entity repositories
- `services/payments/` — `StripeProvider`, `NomodProvider`

---

## Container

`makeContainer({ repos, clock, cache, logger, providers })` is a pure factory
function that returns a frozen object.  It enforces that all five dependencies
are present at construction time and performs no side-effects.

```js
const { makeContainer } = require('./_kernel/container');
const container = makeContainer({ repos, clock, cache, logger, providers });
```

Services added in later PRs will be injected via additional keys on the same
container shape (e.g. `container.orders`, `container.checkout`).

---

## Bootstrap

`src/services/_kernel/bootstrap.js` is a module-level singleton that wires the
real adapters and exports the container:

```js
const container = require('./_kernel/bootstrap');
container.clock.now();   // live Date
container.repos.orders;  // real OrderRepository
container.providers.create('stripe');  // real StripeProvider
```

New facades (PR-MOD-2+) import the bootstrap container instead of instantiating
dependencies themselves.  Tests that need isolation use `makeContainer` with
fakes instead of importing bootstrap.

---

## Backward-compat contract

**Invariant (must hold across all 8 PRs):**
> `src/services/<name>Service.js` must keep its existing named exports.

Controllers import `const { getOrder } = require('../services/orderService')`.
That import must continue to work unchanged throughout the refactor.
The migration strategy is:

1. Create `src/services/<domain>/` module with use-cases.
2. Rewrite `<domain>Service.js` to delegate to the new module.
3. Keep exports identical.
4. Delete nothing until a future breaking-change PR.

---

## 8-PR Roadmap — ALL DONE

| PR | Name | Status | Key files |
|----|------|--------|-----------|
| MOD-1 | Kernel foundation | DONE | `src/services/_kernel/**` |
| MOD-2 | Order use-cases | DONE | `src/services/order/`, thin `orderService.js` |
| MOD-3 | Checkout use-cases | DONE | `src/services/checkout/`, thin `checkoutService.js` |
| MOD-4 | Auth use-cases | DONE | `src/services/auth/`, thin `authService.js` |
| MOD-5 | Product use-cases | DONE | `src/services/product/`, thin `productService.js` |
| MOD-6 | Product sync | DONE | `src/services/product/sync/`, thin `productSyncService.js` |
| MOD-7 | Admin use-cases | DONE | `src/services/admin/`, thin `adminService.js` |
| MOD-8 | smartCategories + cms + coupon + cache + guardrails | DONE | 3 new modules, cache adoption, `scripts/check-service-size.js`, `docs/CACHING.md` |

### Adding a New Service (post-MOD-8 pattern)

```
src/services/
├── myThing/
│   ├── use-cases/
│   │   ├── doX.js          # One exported async function per file
│   │   └── doY.js
│   ├── domain/             # Pure functions, constants, types — no I/O
│   │   └── helpers.js
│   ├── adapters/           # External I/O adapters (HTTP, cache helpers)
│   │   └── cache.js
│   └── index.js            # Re-exports all use-cases
└── myThingService.js       # Thin facade: const { doX, doY } = require('./myThing'); exports.doX = doX; ...
```

Rules:
- `myThingService.js` ≤ 120 LOC (enforced by `npm run lint:service-size`)
- All files in `myThing/` ≤ 300 LOC (same guardrail)
- Cache hot READ paths with `cache.getOrSet(cache.key(...), TTL, loader)`
- Add invalidation hooks in write use-cases (`cache.del` or `cache.delPattern`)
- Document cache keys + TTLs in `docs/CACHING.md`

Each PR:
- Must leave all existing tests green.
- Must not change public service exports.
- Should add new unit tests for each extracted use-case.
- Should target 80%+ coverage on new files.
