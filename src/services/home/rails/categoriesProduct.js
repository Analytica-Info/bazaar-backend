'use strict';

const registry = require('../registry');
const { getCategoriesProduct } = require('../../product/use-cases/getCategoriesProduct');

registry.register({
  name: 'categories-product',
  platforms: ['mobile', 'web'],
  defaultParams: { categoryId: null, page: 1, limit: 10 },
  fetch: async (ctx) => {
    const { categoryId, ...rest } = { categoryId: null, page: 1, limit: 10, ...ctx.params };
    // Parameterized rail: skip silently when no categoryId is supplied
    // (plain GET /v2/home with no category context). classifyData(null)
    // → status:"empty" — no log warning, no manifest error.
    // async so withRailTimeout (which calls .then on the result) gets a Promise.
    if (!categoryId) return null;
    return getCategoriesProduct(categoryId, rest);
  },
});
