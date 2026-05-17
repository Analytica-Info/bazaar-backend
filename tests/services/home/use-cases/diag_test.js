'use strict';

jest.mock('./src/utilities/cache', () => {
  const store = new Map(); const sets = [];
  return {
    _store: store, _sets: sets,
    key(...p) { return p.join(':'); },
    async get(k) { return store.has(k) ? store.get(k) : undefined; },
    async set(k, v, t) { store.set(k, v); sets.push({key:k,value:v,ttl:t}); return true; },
    async getOrSet(k, ttl, fetcher) {
      if (store.has(k)) return store.get(k);
      const value = await fetcher();
      store.set(k, value); sets.push({key:k,value,ttl});
      return value;
    },
  };
});
jest.mock('./src/utilities/clock', () => ({ now: () => new Date('2026-05-16T12:00:00.000Z') }));
jest.mock('./src/utilities/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('./src/config/runtime', () => ({ cache: { homeManifestTtl: 60 }, timeouts: { homeRail: 1500 } }));
jest.mock('./src/services/home/index', () => {
  const reg = {
    _rails: [],
    list({ platform }) { return reg._rails.filter(r => r.platforms.includes(platform)); },
    resolve(n) { return reg._rails.find(r => r.name === n) || null; },
  };
  return { registry: reg };
});

const buildHomeManifest = require('./src/services/home/use-cases/buildHomeManifest');
const { registry } = require('./src/services/home/index');

test('diag', async () => {
  registry._rails = [
    { name: 'a', platforms: ['mobile'], fetch: async () => ({ products: [{ id: 1 }] }), defaultParams: {}, enabled: () => true },
  ];
  const m = await buildHomeManifest({ platform: 'mobile' });
  console.log('result:', JSON.stringify(m, null, 2));
  expect(m.rails[0].status).toBe('ok');
});
