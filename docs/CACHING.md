# Caching Reference

All caches are backed by `src/utilities/cache.js` (Redis with graceful no-op fallback when Redis is unavailable or `CACHE_ENABLED=false`).

Keys are constructed with `cache.key(...segments)` which joins segments with `:`.

---

## Cache Keys, TTLs, and Invalidation

### Catalog (smart categories)

| Key Pattern                                       | TTL   | Invalidated by                    |
|---------------------------------------------------|-------|-----------------------------------|
| `catalog:hot-offers:{priceField}:v1`             | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:top-rated:v1`                            | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:trending:w{timeWindowHours}:v1`         | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:today-deal:v1`                           | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:new-arrivals:p{page}:l{limit}:fpl{n}:v1` | 300s | handleProductUpdate, handleInventoryUpdate |
| `catalog:flash-sale:mobile:{page}:{limit}`       | 300s  | storeFlashSales (delPattern `catalog:flash-sale:*`) |
| `catalog:flash-sale:ecom`                         | 300s  | storeFlashSales (delPattern `catalog:flash-sale:*`) |
| `catalog:super-saver:n{minItems}:v1`             | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:favourites-of-week:v1`                  | 300s  | handleProductUpdate, handleInventoryUpdate |
| `catalog:home-products:v1`                       | 300s  | handleProductUpdate, handleInventoryUpdate |

### Product / Categories

| Key Pattern                          | TTL   | Invalidated by                    |
|--------------------------------------|-------|-----------------------------------|
| `product:sidebar-categories:v1`     | 300s  | handleProductUpdate, handleInventoryUpdate (`delPattern product:*`) |
| `product:all-categories:v1`         | 300s  | handleProductUpdate, handleInventoryUpdate (`delPattern product:*`) |

### Lightspeed API

| Key Pattern                              | TTL    | Invalidated by                   |
|------------------------------------------|--------|----------------------------------|
| `lightspeed:categories:v1`              | 1800s  | handleProductUpdate (explicit del) |
| `lightspeed:product-type:{id}:v1`       | 1800s  | TTL expiry only                  |
| `lightspeed:products-inventory:v1`      | varies | handleInventoryUpdate (explicit del) |

### CMS

| Key Pattern   | TTL    | Invalidated by                                  |
|---------------|--------|-------------------------------------------------|
| `cms:data:v1` | 1800s  | All `update*` functions in `src/services/cms/use-cases/` call `invalidateCmsCache()` which calls `cache.del('cms:data:v1')` |

---

## Key Convention

```
{domain}:{resource}[:{qualifier}...]:v{version}
```

- **domain** — `catalog`, `product`, `cms`, `lightspeed`, `webhook`
- **resource** — short noun describing the cached entity
- **qualifier** — optional discriminator (page, limit, variant, etc.)
- **version** — bump when the shape of the cached value changes to avoid stale-type errors

Example: `catalog:trending:w72:v1`

---

## Graceful Degradation

`src/utilities/cache.js` returns `null` from `get()` and silently no-ops `set()`/`del()`/`delPattern()` when:

- `CACHE_ENABLED=false` in the environment
- Redis client is not connected
- Redis throws an error during a call

This means all `getOrSet(key, ttl, loader)` calls transparently fall through to the loader on every request when Redis is unavailable.  No behavior change; only performance impact.

---

## Adding a New Cached Endpoint

1. Choose a key following the convention above.
2. Wrap the DB query with `cache.getOrSet(cache.key(...), TTL_SECONDS, loader)`.
3. Document the key + TTL in this file.
4. If the data changes via a write path, add `cache.del(key)` or `cache.delPattern(prefix + ':*')` after the write.
5. Bump the version suffix if the return shape changes.
