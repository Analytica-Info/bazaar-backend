# Service Layer Overview

All controllers import from facade files (`src/services/<name>Service.js`).
Never import directly from `src/services/<name>/use-cases/` in a controller.

---

## Public Surface — Facades

| Facade                         | Module Directory              | Key Exports |
|--------------------------------|-------------------------------|-------------|
| `authService.js`               | `auth/`                       | `login`, `refreshToken`, `register`, `verifyOtp`, ... |
| `checkoutService.js`           | `checkout/`                   | `createStripeCheckout`, `createNomodCheckout`, `verifyStripePayment`, ... |
| `cmsService.js`                | `cms/`                        | `getCmsData`, `updateCouponCms`, `updateHeader`, `updateSlider`, `uploadEditorImage`, ... |
| `couponService.js`             | `coupon/`                     | `getCoupons`, `checkCouponCode`, `redeemCoupon`, `createCoupon`, ... |
| `orderService.js`              | `order/`                      | `getOrders`, `getOrderById`, `updateOrderStatus`, ... |
| `productService.js`            | `product/`                    | `getHomeProducts`, `getCategories`, `getAllCategories`, `getProducts`, `searchProducts`, ... |
| `productSyncService.js`        | `product/sync/`               | `handleProductUpdate`, `handleInventoryUpdate`, `syncWebhookDiscounts`, ... |
| `smartCategoriesService.js`    | `smartCategories/`            | `getHotOffers`, `getTrendingProducts`, `getFlashSales`, `getNewArrivals`, `todayDeal`, ... |
| `adminService.js`              | `admin/`                      | `getDashboardStats`, `getUsers`, `updateUserRole`, ... |

### Still-monolithic facades (follow-up PR candidates)

| Facade                      | LOC  | Note |
|-----------------------------|------|------|
| `cartService.js`            | ~417 | Complex cart operations; high coupling |
| `userService.js`            | ~494 | User CRUD + profile; separate profile module planned |
| `shippingService.js`        | ~405 | Shipping calculation + address; split by concern |
| `notificationService.js`    | ~422 | Push + in-app notification dispatch |
| `newsletterService.js`      | ~362 | Newsletter subscribe/unsubscribe + mail dispatch |
| `contactService.js`         | ~463 | Contact form + CRM integration |
| `bankPromoCodeService.js`   | ~151 | Bank promo CRUD + validation |
| `metricsService.js`         | ~291 | Analytics aggregations |

---

## Internal Layout — Module Directories

Each modularized service follows this structure:

```
src/services/<name>/
├── use-cases/          # One file per use-case (≤300 LOC each)
│   ├── doX.js          # exports { doX }
│   └── doY.js          # exports { doY }
├── domain/             # Pure functions, constants, projections — no I/O
│   └── helpers.js
├── adapters/           # Thin wrappers around external systems (cache, HTTP)
│   └── cache.js
├── shared/             # Utilities shared between use-cases in this module
└── index.js            # Re-exports everything; facade imports only from here
```

### `_kernel/` — foundation layer

```
src/services/_kernel/
├── errors.js       # DomainError hierarchy
├── ports.js        # Port interface definitions (JSDoc)
├── cache.js        # makeRedisCache / makeNullCache adapters
├── container.js    # makeContainer — pure DI factory
├── bootstrap.js    # Singleton container (production wiring)
└── index.js        # Re-exports all kernel exports
```

### `shared/` — cross-service utilities

```
src/services/shared/
└── ...             # Utilities used by multiple service modules
```

### `payments/` — payment provider strategy

```
src/services/payments/
├── StripeProvider.js
├── NomodProvider.js
└── index.js
```

---

## LOC Guardrail

`npm run lint:service-size` enforces:

- Facade files (`*Service.js` at top level): **≤ 120 LOC**
- All other module files (use-cases/, domain/, adapters/): **≤ 300 LOC**

Pre-existing files that exceed these limits are tracked as exceptions in `scripts/check-service-size.js`.

See `docs/CACHING.md` for cache key conventions and TTLs.
