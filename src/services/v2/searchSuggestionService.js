/**
 * Search suggestions (v2).
 *
 * Produces "popular search terms" for the empty-state of the mobile
 * search screen. Derives suggestions from existing data — trending
 * products (last 100h sales), plus top brand names — so we don't need
 * to track a separate "search query analytics" collection.
 */
const smartCategoriesService = require("../smartCategoriesService");
const Brand = require("../../models/Brand");

/**
 * @returns {Promise<{trending: string[], popularBrands: string[], topCategories: string[]}>}
 */
async function getSuggestions({ limit = 8 } = {}) {
  const [trending, brands, topCats] = await Promise.allSettled([
    _trendingTerms(limit),
    _popularBrandNames(limit),
    _topCategoryNames(limit),
  ]);

  return {
    trending: _unwrap(trending, []),
    popularBrands: _unwrap(brands, []),
    topCategories: _unwrap(topCats, []),
  };
}

async function _trendingTerms(limit) {
  const trendingResult = await smartCategoriesService.getTrendingProducts({
    timeWindowHours: 100,
  });
  const items = trendingResult?.products || [];
  // Use the first word or two of each product name as the search term,
  // lightly deduplicated by lowercase.
  const seen = new Set();
  const terms = [];
  for (const p of items) {
    const name = p?.product?.name;
    if (!name) continue;
    const short = name.split(/\s+/).slice(0, 2).join(" ").trim();
    if (!short) continue;
    const key = short.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(short);
    if (terms.length >= limit) break;
  }
  return terms;
}

async function _popularBrandNames(limit) {
  const brands = await Brand.find({}).limit(limit).lean();
  return brands.map((b) => b.name).filter(Boolean);
}

async function _topCategoryNames(limit) {
  // Category docs have a nested `side_bar_categories` list per market.
  // Rather than ship that full tree here, return a lightweight
  // flattened list of top-level category names.
  const Category = require("../../models/Category");
  const doc = await Category.findOne({}).lean();
  const list = doc?.side_bar_categories || [];
  const names = list
    .map((c) => c.name || c.title)
    .filter(Boolean)
    .slice(0, limit);
  return names;
}

function _unwrap(settled, fallback) {
  return settled.status === "fulfilled" ? settled.value : fallback;
}

module.exports = { getSuggestions };
