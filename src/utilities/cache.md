# Cache Utility — Usage Guide

## Key Naming Convention

```
bazaar:<domain>:<specifier>[:v<n>]
```

Examples:
- `bazaar:catalog:top-rated:v1`
- `bazaar:cms:full:v1`
- `bazaar:category:list:v1`
- `bazaar:spelling:dict:v1`

Always include a version suffix (`:v1`, `:v2`, …) so cached payloads can be
invalidated by bumping the version when the response schema changes — without
requiring a Redis FLUSHDB.

## Building Keys

```js
const cache = require('./cache');

// cache.key() joins parts with ':'
const k = cache.key('catalog', 'top-rated', 'v1');
// → 'catalog:top-rated:v1'
// The NAMESPACE prefix ('bazaar:') is applied automatically on read/write.
```

## TTL Guidance

| Data type                         | Recommended TTL      |
|-----------------------------------|----------------------|
| Dynamic product / search lists    | 300 s  (5 min)       |
| Category trees, CMS pages         | 1800 s (30 min)      |
| Long-lived dictionaries / configs | 86400 s (24 hr)      |
| **Never**                         | unbounded (no TTL)   |

## Graceful Degradation

If Redis is unreachable **or** `CACHE_ENABLED=false` **or** `REDIS_URL` is
unset, every cache operation falls back silently:

- `get(key)` → `undefined`
- `set(key, value, ttl)` → `false`
- `del(key)` → `0`
- `delPattern(pattern)` → `0`
- `getOrSet(key, ttl, fetcher)` → `await fetcher()` (result not cached)

No request ever fails because of a Redis error.

## Wiring into a Controller / Service

```js
const cache = require('../utilities/cache');

async function getTopRated() {
  return cache.getOrSet(
    cache.key('catalog', 'top-rated', 'v1'),
    300,             // 5-minute TTL
    () => Product.find({ featured: true }).limit(20).lean()
  );
}
```
