# Repository Layer

The repository layer sits between `src/services/` and `src/models/`. Services
call repositories; only repositories touch Mongoose. This separation lets us
test services without spinning up MongoDB, swap persistence later, and keep
schema-level concerns (projections, lean vs hydrated, dual-field
reconciliation) in one place per entity.

## Layout

```
src/
├── repositories/
│   ├── BaseRepository.js     # generic CRUD, lean-by-default reads, session-aware writes
│   ├── UnitOfWork.js         # transaction wrapper around mongoose.startSession()
│   ├── index.js              # singleton registry: { notifications, users, admins, ..., unitOfWork }
│   ├── NotificationRepository.js
│   ├── UserRepository.js
│   └── AdminRepository.js
├── services/
│   └── *.js                  # consume `require('../repositories')`
└── models/
    └── *.js                  # Mongoose schemas — only repositories may import these
```

## How services use repositories

```js
const repos = require('../repositories');

async function getUserNotifications(userId, opts) {
    const { items, total, unreadCount } = await repos.notifications.listForUser(userId, opts);
    return { notifications: items, total, unreadCount };
}
```

## Rules

1. **Repositories never import services or controllers.** One-way dependency.
2. **Reads default to `.lean()`** and return plain objects. Use
   `{ lean: false }` (or repo-specific `*AsDocument` methods) when the caller
   needs `.save()`, virtuals, or middleware.
3. **Every write method accepts `{ session }`.** Used together with
   `UnitOfWork.runInTransaction` for atomic multi-entity writes.
4. **No business logic in repositories.** They own queries, projection,
   indexes, lean/populate decisions, and field reconciliation. Validation,
   orchestration, and side effects (email, notifications) stay in services.
5. **Method names express caller intent**, not Mongoose verbs:
   `listAdminNotificationsPaginated`, not `findWithPopulate`.
6. **Mutation paths must respect Mongoose middleware.** If a model has
   `pre('save')` hooks (e.g. password hashing, timestamps), the repository
   must use a hydrated document or pass `runValidators: true` on `updateOne`.
   Audit hooks before migrating each entity.

## Transactions

```js
const repos = require('../repositories');

await repos.unitOfWork.runInTransaction(async (session) => {
    await repos.orders.create(orderData, { session });
    await repos.products.decrementStock(productId, qty, { session });
});
```

If MongoDB is standalone (local dev), the helper logs a warning and runs the
callback without a session. Production must run as a replica set for
atomicity guarantees.

## Adding a new repository

1. Create `src/repositories/<Entity>Repository.js` extending `BaseRepository`.
2. Add semantic methods named for caller intent.
3. Register it in `src/repositories/index.js`.
4. Add `tests/repositories/<Entity>Repository.test.js` against the in-memory
   Mongo setup at `tests/setup.js`. Cover query shape, projection,
   lean-vs-hydrated returns, and any dual-field normalization.
5. Migrate consuming services one at a time. Existing service tests stay as
   integration tests and act as the parity guarantee.

## Migration status

The persistence boundary is complete: **services, controllers, middleware,
helpers, and utilities no longer import Mongoose models directly.** All
access is mediated by `src/repositories/`. The guardrail script
`scripts/check-no-direct-model-imports.js` enforces this.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations (Base, UoW, registry, docs) | ✅ done |
| 1a | NotificationService pilot — full semantic migration | ✅ done |
| 1b | UserService — full semantic migration | ✅ done |
| 2–5 | All remaining services (auth, admin, catalog, cart, order, checkout, …) — model imports routed through registry | ✅ done |
| 6 | Guardrail (`npm run lint`) + docs | ✅ done |
| **B (follow-up)** | **Semantic migration of large-service call sites** (replace `repos.x.rawModel().find(...)` with `repos.x.findX(...)` semantic methods) | pending |

### What "done" means today

- 45 entities have repositories registered in `src/repositories/index.js`.
- Zero `require('../models/*')` calls outside the allowlist
  (`src/repositories/`, `src/scripts/`, `src/tests/`).
- Two services (notificationService, userService) are fully semantically
  migrated — they call `repos.x.findX()` style methods and do not use
  `rawModel()`. These are the reference implementations.
- All other services obtain their model via `repos.x.rawModel()` and
  continue to call Mongoose verbs directly. Behavior is unchanged; the
  registry is a **single seam** that makes the next phase mechanical.
- Full test suite: 640 passing, 3 skipped, 0 failing.

### Phase B: semantic migration (follow-up)

For each service still using `rawModel()`:
1. Identify the Mongoose call sites.
2. Add semantic methods to the corresponding repository (named after the
   caller's intent).
3. Replace call sites with the new methods.
4. Remove the `rawModel()` line when no call sites remain.
5. Verify tests stay green.

Recommended order: smaller services first (wishlistService, bannerService,
emailConfigService, roleService, permissionService, bankPromoCodeService),
then mid-size (cartService, contactService, newsletterService, shippingService,
couponService), then the large ones (productService, smartCategoriesService,
productSyncService, cmsService, adminService, authService, checkoutService,
orderService). The orderService/checkoutService cut should still happen
behind a `USE_ORDER_REPOSITORY` flag as planned.

## ESLint guardrail (future)

The current guardrail is a small Node script. When the project adopts ESLint,
replace `npm run lint` with this rule:

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["**/models/*"],
        "message": "Import via src/repositories instead of touching Mongoose models directly."
      }]
    }]
  },
  "overrides": [
    { "files": ["src/repositories/**", "src/scripts/**", "src/tests/**"], "rules": { "no-restricted-imports": "off" } }
  ]
}
```
