'use strict';

const registry = require('../registry');
const { getCategoriesProduct } = require('../../product/use-cases/getCategoriesProduct');

registry.register({
  name: 'categories-product',
  platforms: ['mobile', 'web'],
  defaultParams: { categoryId: null, page: 1, limit: 10 },
  fetch: (ctx) => {
    const { categoryId, ...rest } = { categoryId: null, page: 1, limit: 10, ...ctx.params };
    if (!categoryId) return Promise.resolve({ products: [] });
    return getCategoriesProduct(categoryId, rest);
  },
});
