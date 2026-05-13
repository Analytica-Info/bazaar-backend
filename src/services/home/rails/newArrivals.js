'use strict';

const registry = require('../registry');
const getNewArrivals = require('../../smartCategories/use-cases/getNewArrivals');

registry.register({
  name: 'new-arrivals',
  platforms: ['mobile', 'web'],
  defaultParams: { page: 1, limit: 10, maxItemsFromDb: 100, firstPageLimit: null },
  fetch: (ctx) => getNewArrivals({ page: 1, limit: 10, maxItemsFromDb: 100, firstPageLimit: null, ...ctx.params }),
});
