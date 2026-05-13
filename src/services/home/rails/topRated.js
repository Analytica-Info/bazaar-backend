'use strict';

const registry = require('../registry');
const getTopRatedProducts = require('../../smartCategories/use-cases/getTopRatedProducts');

registry.register({
  name: 'top-rated',
  platforms: ['mobile', 'web'],
  defaultParams: {},
  fetch: () => getTopRatedProducts(),
});
