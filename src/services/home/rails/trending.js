'use strict';

const registry = require('../registry');
const { getTrendingProducts } = require('../../smartCategories/use-cases/getTrendingProducts');

registry.register({
  name: 'trending',
  platforms: ['mobile', 'web'],
  defaultParams: { timeWindowHours: 72 },
  fetch: (ctx) => getTrendingProducts({ timeWindowHours: 72, ...ctx.params }),
});
