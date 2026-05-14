'use strict';

const registry = require('../registry');
const { getHotOffers } = require('../../smartCategories/use-cases/getHotOffers');

registry.register({
  name: 'hot-offers',
  platforms: ['mobile', 'web'],
  defaultParams: { priceField: 'tax_inclusive' },
  fetch: (ctx) => getHotOffers({ priceField: 'tax_inclusive', ...ctx.params }),
});
