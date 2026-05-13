'use strict';

const registry = require('../registry');
const favouritesOfWeek = require('../../smartCategories/use-cases/favouritesOfWeek');

registry.register({
  name: 'favourites-of-week',
  platforms: ['mobile', 'web'],
  defaultParams: {},
  fetch: () => favouritesOfWeek(),
});
