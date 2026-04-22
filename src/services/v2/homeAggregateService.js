/**
 * Home aggregate service (v2).
 *
 * Orchestrates multiple existing services into a single `/api/v2/home/summary`
 * response so the mobile client only makes one round-trip on home load.
 * All sub-fetches run in parallel with Promise.allSettled — a single failing
 * section never takes down the whole response.
 *
 * IMPORTANT: This service never *modifies* existing endpoints. It's a
 * composition layer only. The underlying v1 endpoints stay byte-for-byte
 * the same, which means the published mobile app (v1.0.23) is unaffected.
 */
const smartCategoriesService = require("../smartCategoriesService");
const productService = require("../productService");
const bannerService = require("../bannerService");
const cartService = require("../cartService");

const ALL_SECTIONS = [
  "banners",
  "categories",
  "trending",
  "topRated",
  "newArrivals",
  "flashSales",
  "address",
  "cart",
];

const DEFAULT_SECTIONS = [
  "banners",
  "categories",
  "trending",
  "topRated",
  "newArrivals",
];

/**
 * @param {Object} opts
 * @param {Object|null} opts.user — req.user if authenticated, else null
 * @param {string[]} opts.include — section keys to include
 * @param {Object} opts.limits — per-section limits, e.g. { trending: 8 }
 * @returns {Promise<Object>} — partial response; each section is either a
 *   data array/object OR `{ error: 'message' }`. Never throws.
 */
async function getHomeSummary({ user = null, include, limits = {} } = {}) {
  const sections = (Array.isArray(include) && include.length > 0
    ? include.filter((s) => ALL_SECTIONS.includes(s))
    : DEFAULT_SECTIONS);

  // Jobs are tuples of [section, fn]. Only run what's requested.
  const jobs = [];
  for (const section of sections) {
    const fn = _jobFor(section, { user, limit: limits[section] });
    if (fn) jobs.push([section, fn]);
  }

  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));

  const response = { sections: {} };
  jobs.forEach(([section], idx) => {
    const r = results[idx];
    if (r.status === "fulfilled") {
      response.sections[section] = r.value;
    } else {
      response.sections[section] = {
        error: r.reason?.message || "Failed to load section",
      };
    }
  });

  response.meta = {
    generatedAt: new Date().toISOString(),
    authenticated: Boolean(user),
    included: sections,
  };
  return response;
}

function _jobFor(section, { user, limit }) {
  switch (section) {
    case "banners":
      return async () => {
        const data = await bannerService.getAllBanners();
        return _unwrapList(data, "banners", limit);
      };

    case "categories":
      return async () => {
        const data = await productService.getCategories();
        return _unwrapList(data, "categories", limit);
      };

    case "trending":
      return async () => {
        const data = await smartCategoriesService.getTrendingProducts({
          timeWindowHours: 100,
        });
        return _unwrapList(data, "products", limit ?? 10);
      };

    case "topRated":
      return async () => {
        const data = await smartCategoriesService.getTopRatedProducts();
        return _unwrapList(data, "products", limit ?? 10);
      };

    case "newArrivals":
      return async () => {
        const data = await smartCategoriesService.getNewArrivals({
          page: 1,
          limit: limit ?? 10,
          maxItemsFromDb: 200,
          firstPageLimit: null,
        });
        return _unwrapList(data, "products", limit ?? 10);
      };

    case "flashSales":
      return async () => {
        const data = await smartCategoriesService.getFlashSales({
          page: 1,
          limit: limit ?? 10,
        });
        return _unwrapList(data, "products", limit ?? 10);
      };

    case "address":
      if (!user) return null;
      return async () => {
        // Addresses are embedded on the User doc (see models/User.js).
        // `req.user` is the already-loaded User document, so read directly.
        const addresses = user.addresses || [];
        if (addresses.length === 0) return null;
        const primary = addresses.find((a) => a.isPrimary) || addresses[0];
        return {
          _id: primary._id,
          name: primary.name,
          mobile: primary.mobile,
          country: primary.country,
          city: primary.city,
          area: primary.area,
          buildingName: primary.buildingName,
          floorNo: primary.floorNo,
          apartmentNo: primary.apartmentNo,
          landmark: primary.landmark,
          isPrimary: Boolean(primary.isPrimary),
        };
      };

    case "cart":
      if (!user) return null;
      return async () => {
        const cart = await cartService.getCart(user._id);
        const items = cart?.items || cart?.cartItems || [];
        return {
          itemCount: Array.isArray(items)
            ? items.reduce((sum, i) => sum + (i.quantity || 1), 0)
            : 0,
          distinctItemCount: Array.isArray(items) ? items.length : 0,
        };
      };

    default:
      return null;
  }
}

/**
 * Services in this repo inconsistently return either an array, or
 * `{ success, <listKey>: [...] }`, or `{ products: [...] }`. Unwrap them
 * into a plain array and apply a cap if requested.
 */
function _unwrapList(raw, preferredKey, limit) {
  if (Array.isArray(raw)) return _cap(raw, limit);
  if (raw && typeof raw === "object") {
    const list = raw[preferredKey] ?? raw.products ?? raw.data ?? raw.items;
    if (Array.isArray(list)) return _cap(list, limit);
  }
  return [];
}

function _cap(list, limit) {
  if (!limit || list.length <= limit) return list;
  return list.slice(0, limit);
}

module.exports = {
  getHomeSummary,
  ALL_SECTIONS,
  DEFAULT_SECTIONS,
};
