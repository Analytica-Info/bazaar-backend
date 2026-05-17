#!/usr/bin/env node
/* User-authorized: invalidate the same cache patterns the webhook handlers do. */
require('dotenv').config();
const cache = require('../src/utilities/cache');

(async () => {
  const results = await Promise.all([
    cache.delPattern('catalog:*'),
    cache.delPattern('product:*'),
    cache.del(cache.key('lightspeed', 'categories', 'v1')),
    cache.del(cache.key('lightspeed', 'products-inventory', 'v1')),
  ]);
  console.log('Cache invalidation results:');
  console.log({
    'catalog:*':                    results[0],
    'product:*':                    results[1],
    'lightspeed:categories:v1':     results[2],
    'lightspeed:products-inventory:v1': results[3],
  });
  // cache module uses ioredis under the hood — give it a tick to flush, then exit.
  setTimeout(() => process.exit(0), 200);
})().catch((e) => { console.error(e?.stack || e?.message || e); process.exit(1); });
