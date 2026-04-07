# Backend Standardization Plan

## Goal
Reduce code duplication and structure the codebase so business logic lives in framework-agnostic service files — making it straightforward to migrate to Next.js API routes later.

## Duplication Analysis

| Controller Pair | Duplication | Action |
|-----------------|------------|--------|
| wishlistController | 100% identical | Merge into one shared controller |
| bannerImageController | 100% identical | Merge into one shared controller |
| cartController | ~70% overlap | Extract shared service, keep thin controllers |
| smartCategoriesController | ~75% overlap | Extract shared service with config params |
| notificationController | 0% (different purpose) | Keep separate (admin vs user) |
| orderController | Partial (different functions) | Keep separate |
| publicController vs productController | ~15% overlap | Keep separate |
| authController vs userController | ~10% overlap | Keep separate |

## Architecture: Services Pattern

```
routes (Express-specific) → controllers (thin, req/res handling) → services (pure business logic)
```

Services are plain JS functions that:
- Accept plain objects as input (not req/res)
- Return data or throw errors
- Have no Express dependency
- Can be called from Express controllers OR Next.js route handlers OR tests

## Changes

### Phase 1: Deduplicate identical controllers
- Create `src/controllers/shared/wishlistController.js` — single copy
- Create `src/controllers/shared/bannerImageController.js` — single copy
- Update ecommerce + mobile routes to import from shared/
- Delete the duplicates

### Phase 2: Extract services for heavily duplicated logic
- Create `src/services/cartService.js` — core cart CRUD + gift logic
- Create `src/services/smartCategoriesService.js` — product queries with configurable params
- Keep controllers as thin wrappers

### Phase 3: Add tests
- Unit tests for all services
- Integration tests for critical endpoints (auth, cart, checkout)
