'use strict';

const registry = require('../registry');
const todayDeal = require('../../smartCategories/use-cases/todayDeal');

registry.register({
  name: 'today-deal',
  platforms: ['mobile', 'web'],
  defaultParams: {},
  fetch: () => todayDeal(),
});
