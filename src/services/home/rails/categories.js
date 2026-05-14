'use strict';

const registry = require('../registry');
const { getCategories } = require('../../product/use-cases/getCategories');

registry.register({
  name: 'categories',
  platforms: ['mobile', 'web'],
  defaultParams: {},
  fetch: () => getCategories(),
});
