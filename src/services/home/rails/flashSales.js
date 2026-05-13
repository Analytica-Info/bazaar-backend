'use strict';

const registry = require('../registry');
const getFlashSales = require('../../smartCategories/use-cases/getFlashSales');

registry.register({
  name: 'flash-sales',
  platforms: ['mobile', 'web'],
  defaultParams: { paginated: true, page: 1, limit: 10 },
  fetch: (ctx) => getFlashSales({ paginated: true, page: 1, limit: 10, ...ctx.params }),
});
