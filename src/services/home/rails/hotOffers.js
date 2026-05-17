'use strict';

const registry = require('../registry');
const { getHotOffers } = require('../../smartCategories/use-cases/getHotOffers');

// The shared v1 use-case returns a raw array of price-range buckets:
//   [ { priceRange, label, images }, ... ]
// Other rails return an object like { status, count, products } so the
// v2 rail controller can do `{ ...data, railName, page, limit }` and merge
// cleanly. If hot-offers returned a raw array, that spread would copy
// numeric indices and produce { "0": …, "1": …, railName, page, limit }
// — a Map-shaped envelope. Wrap into the same { status, count, priceRanges }
// object shape here. The underlying v1 use-case is untouched so old
// mobile/web builds still see the raw array on /api/products/hot-offers.
registry.register({
  name: 'hot-offers',
  platforms: ['mobile', 'web'],
  defaultParams: { priceField: 'tax_inclusive' },
  fetch: async (ctx) => {
    const priceRanges = await getHotOffers({ priceField: 'tax_inclusive', ...ctx.params });
    return {
      status: true,
      count: Array.isArray(priceRanges) ? priceRanges.length : 0,
      priceRanges: Array.isArray(priceRanges) ? priceRanges : [],
    };
  },
});
