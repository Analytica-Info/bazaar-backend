'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { escapeRegex } = require('../../../utilities/stringUtils');
const { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Advanced search with Atlas/regex fallback + spell check
 */
async function searchProducts(query) {
  const { item_name, category_id } = query;

  try {
    if (!item_name || item_name.length < 3) {
      throw {
        status: 400,
        message: 'Search term must be at least 3 characters long',
        data: {
          filteredProducts: [],
          filteredProductsCount: 0,
          noResult: true,
        },
      };
    }

    let searchStage = {
      $search: {
        index: 'product_search',
        compound: {
          should: [
            {
              text: {
                query: item_name,
                path: 'product.name',
                score: { boost: { value: 5 } },
                fuzzy: { maxEdits: 2, prefixLength: 1 },
              },
            },
            {
              autocomplete: {
                query: item_name,
                path: 'product.name',
                score: { boost: { value: 3 } },
                fuzzy: { maxEdits: 1 },
              },
            },
            {
              text: {
                query: item_name,
                path: 'product.description',
                score: { boost: { value: 1 } },
                fuzzy: { maxEdits: 2 },
              },
            },
          ],
          must: [
            { equals: { path: 'status', value: true } },
            { range: { path: 'totalQty', gt: 0 } },
          ],
          minimumShouldMatch: 1,
        },
      },
    };

    if (category_id) {
      searchStage.$search.compound.must.push({
        equals: {
          path: 'product.product_type_id',
          value: category_id,
        },
      });
    }

    const pipeline = [
      searchStage,
      { $addFields: { score: { $meta: 'searchScore' } } },
      {
        $match: {
          $expr: {
            $gt: [
              { $size: { $ifNull: ['$product.images', []] } },
              0,
            ],
          },
        },
      },
      { $sort: { score: -1 } },
      { $limit: 100 },
      { $project: LIST_EXCLUDE_PROJECTION },
    ];

    let filteredProducts = [];
    try {
      filteredProducts = await Product.aggregate(pipeline);

      if (filteredProducts.length === 0) {
        const searchTerms = item_name.trim().split(/\s+/).map(escapeRegex);

        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  { 'product.name': { $regex: term, $options: 'i' } },
                  { 'product.description': { $regex: term, $options: 'i' } },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery['product.product_type_id'] = category_id;
        }

        const fallbackProducts = await Product.find(fallbackQuery)
          .select(LIST_EXCLUDE_SELECT)
          .lean()
          .limit(100);

        filteredProducts = fallbackProducts.filter(
          (p) =>
            p.status === true &&
            (p.totalQty === undefined || p.totalQty > 0) &&
            p.product?.images &&
            Array.isArray(p.product.images) &&
            p.product.images.length > 0
        );
      }
    } catch (aggError) {
      if (
        aggError.code === 40324 ||
        aggError.message.includes('$search') ||
        aggError.message.includes('index')
      ) {
        const searchTerms = item_name.trim().split(/\s+/).map(escapeRegex);

        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  { 'product.name': { $regex: term, $options: 'i' } },
                  { 'product.description': { $regex: term, $options: 'i' } },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery['product.product_type_id'] = category_id;
        }

        const fallbackProducts = await Product.find(fallbackQuery)
          .select(LIST_EXCLUDE_SELECT)
          .lean()
          .limit(100);
        filteredProducts = fallbackProducts.filter(
          (p) =>
            p.status === true &&
            (p.totalQty === undefined || p.totalQty > 0) &&
            p.product?.images &&
            Array.isArray(p.product.images) &&
            p.product.images.length > 0
        );
      } else {
        throw aggError;
      }
    }

    filteredProducts = filteredProducts.filter(
      (product) =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    );

    const searchWords = item_name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (searchWords.length > 1) {
      filteredProducts = filteredProducts.filter((product) => {
        const text =
          `${product.product?.name || ''} ${product.product?.description || ''}`.toLowerCase();
        const matched = searchWords.filter((word) => text.includes(word)).length;
        return matched >= Math.ceil(searchWords.length * 0.7);
      });
    }

    return {
      noResult: filteredProducts.length === 0,
      filteredProductsCount: filteredProducts.length,
      filteredProducts,
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Error processing search request:');

    if (
      error.code === 40324 ||
      (error.message && error.message.includes('$search'))
    ) {
      throw { status: 500, message: 'Search index not configured' };
    }

    throw {
      status: 500,
      message: 'An error occurred while processing the request',
    };
  }
}

module.exports = { searchProducts };
