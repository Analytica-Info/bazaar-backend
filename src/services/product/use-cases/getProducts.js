'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');
const { getSkuPrefixesForColor } = require('../domain/variantColors');
const { fetchAndCacheCategories } = require('../adapters/cache');

/**
 * Build a deterministic sort spec from the sort query param.
 * @param {string|undefined} sortParam
 * @returns {{ [key: string]: 1 | -1 }}
 */
function buildSortSpec(sortParam) {
  switch (sortParam) {
    case 'price_asc':
      return { discountedPrice: 1, _id: 1 };
    case 'price_desc':
      return { discountedPrice: -1, _id: -1 };
    case 'newest':
    default:
      return { createdAt: -1, _id: -1 };
  }
}

/**
 * Resolve all descendant category ids (including the root) from the cached
 * category tree for a given categoryId string.
 * @param {string} categoryId
 * @returns {Promise<string[]>} uniqueCategoryIds — may be empty if not found
 */
async function resolveCategoryDescendants(categoryId) {
  const categories = await fetchAndCacheCategories();
  const categoryIds = [];

  categories.forEach((category) => {
    if (
      category.category_path &&
      category.category_path[0] &&
      category.category_path[0].id === categoryId
    ) {
      category.category_path.forEach((path) => {
        categoryIds.push(path.id);
      });
    }
  });

  return [...new Set(categoryIds)];
}

/**
 * Paginated product listing — unified endpoint.
 *
 * Query params:
 *   page        {number}  default 1
 *   limit       {number}  default 54
 *   filter      {string}  JSON array of variant-word prefixes, e.g. '["Brand New"]'
 *   minPrice    {number}
 *   maxPrice    {number}
 *   sort        {string}  'price_asc' | 'price_desc' | 'newest' (default)
 *   categoryId  {string}  filter to category + all descendants
 *
 * Response shape (unchanged for backward compat):
 *   { success, pagination: { currentPage, totalPages, totalProducts, productsPerPage }, products }
 */
async function getProducts(query) {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 54;
  const filter = query.filter;
  const minPrice = parseFloat(query.minPrice);
  const maxPrice = parseFloat(query.maxPrice);
  const sortSpec = buildSortSpec(query.sort);
  // Parse comma-separated categoryId(s): "ID_A,ID_B" → ['ID_A', 'ID_B']
  const rawCategoryId = query.categoryId;
  const rootCategoryIds = rawCategoryId
    ? rawCategoryId.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // ── categoryId resolution ─────────────────────────────────────────────────
  let uniqueCategoryIds = null; // null means "no filter"; [] means "resolved to nothing"
  if (rootCategoryIds.length > 0) {
    const unionSet = new Set();
    for (const rootId of rootCategoryIds) {
      try {
        const descendants = await resolveCategoryDescendants(rootId);
        descendants.forEach((id) => unionSet.add(id));
      } catch (err) {
        logger.error({ err }, 'Error resolving category descendants:');
      }
    }
    uniqueCategoryIds = [...unionSet];

    if (uniqueCategoryIds.length === 0) {
      return {
        success: true,
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalProducts: 0,
          productsPerPage: limit,
        },
        products: [],
      };
    }
  }

  // ── base match stage ──────────────────────────────────────────────────────
  let matchStage = {
    totalQty: { $gt: 0 },
    $or: [{ status: { $exists: false } }, { status: true }],
  };

  if (!isNaN(minPrice) && !isNaN(maxPrice)) {
    matchStage.discountedPrice = {
      $gte: minPrice,
      $lte: maxPrice,
      $gt: 0,
    };
  }

  let aggregationPipeline = [];

  aggregationPipeline.push({ $match: matchStage });

  aggregationPipeline.push({
    $match: {
      $expr: {
        $gt: [{ $size: { $ifNull: ['$product.images', []] } }, 0],
      },
    },
  });

  if (filter && filter.length > 0 && filter !== '[]') {
    try {
      const filterWords = JSON.parse(filter);
      if (filterWords.length > 0) {
        const words = filterWords.map((word) => word.toLowerCase());

        aggregationPipeline.push({
          $match: {
            'variantsData.sku': {
              $regex: new RegExp(`^(${words.join('|')}) - .*`, 'i'),
            },
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error parsing filter:');
    }
  }

  // `color` shortcut — resolves to the same SKU-prefix list the v1
  // /products-by-variant endpoint used. Unknown colours match nothing.
  if (query.color) {
    const prefixes = getSkuPrefixesForColor(query.color);
    if (prefixes && prefixes.length > 0) {
      aggregationPipeline.push({
        $match: { 'variantsData.sku': { $in: prefixes } },
      });
    } else {
      return {
        success: true,
        pagination: { currentPage: page, totalPages: 0, totalProducts: 0, productsPerPage: limit },
        products: [],
      };
    }
  }

  // ── category filter ───────────────────────────────────────────────────────
  if (uniqueCategoryIds !== null && uniqueCategoryIds.length > 0) {
    aggregationPipeline.push({
      $match: { 'product.product_type_id': { $in: uniqueCategoryIds } },
    });
  }

  // ── count + paginate ──────────────────────────────────────────────────────
  try {
    const countPipeline = [...aggregationPipeline, { $count: 'total' }];
    const countResult = await Product.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    const productsPipeline = [
      ...aggregationPipeline,
      { $sort: sortSpec },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: LIST_EXCLUDE_PROJECTION },
    ];

    const products = await Product.aggregate(productsPipeline);
    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: totalCount,
        productsPerPage: limit,
      },
      products,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching products:');
    throw { status: 500, message: 'An error occurred while fetching products' };
  }
}

module.exports = { getProducts };
