const Product = require("../models/Product");
const ProductId = require("../models/ProductId");
const ProductView = require("../models/ProductView");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Review = require("../models/Review");
const NodeCache = require("node-cache");
// spellingCache keeps 7-day in-memory storage for fuzzy-match suggestions —
// left on NodeCache: tiny, very hot, fine to re-warm on restart.
const spellingCache = new NodeCache({ stdTTL: 604800 }); // 7 days
// Shared Redis-backed cache for everything else (fetchAndCacheCategories, etc.).
// Graceful-degradation: falls back to direct Lightspeed/DB call on Redis outage.
const cache = require("../utilities/cache");
const { escapeRegex } = require("../utilities/stringUtils");
const axios = require("axios");
const Typo = require("typo-js");
const dictionary = new Typo("en_US");
const fs = require("fs");
const path = require("path");

const logger = require("../utilities/logger");
const API_KEY = process.env.API_KEY;
const CATEGORIES_URL = process.env.CATEGORIES_URL;
const BRANDS_URL = process.env.BRANDS_URL;
const PRODUCT_TYPE = process.env.PRODUCT_TYPE;

// -----------------------------------------------------------------------------
// Bandwidth optimization: list-endpoint projection
// -----------------------------------------------------------------------------
// Audit (2026-04-24) confirmed these fields are NEVER read by mobile, web, or
// admin frontends when rendering product lists. They account for ~60-70% of
// every product list payload. Detail endpoint (getProductDetails) keeps them.
//
// When adding new list endpoints, use one of:
//   - Aggregate:  pipeline.push({ $project: LIST_EXCLUDE_PROJECTION })
//   - Mongoose:   Product.find(...).select(LIST_EXCLUDE_SELECT).lean()
// -----------------------------------------------------------------------------
const LIST_EXCLUDE_PROJECTION = {
  // Phase 1a — raw Lightspeed fields never rendered in lists
  "product.variants": 0,
  "product.product_codes": 0,
  "product.suppliers": 0,
  "product.composite_bom": 0,
  "product.tag_ids": 0,
  "product.attributes": 0,
  "product.account_code_sales": 0,
  "product.account_code_purchase": 0,
  "product.price_outlet": 0,
  "product.brand_id": 0,
  "product.deleted_at": 0,
  "product.version": 0,
  "product.created_at": 0,
  "product.updated_at": 0,
  // Phase 2 — wrapper-level backend internals, not used by any frontend
  webhook: 0,
  webhookTime: 0,
  __v: 0,
  updatedAt: 0, // top-level wrapper updatedAt — keep createdAt (admin gift page uses it)
  // Phase 3 — HTML description only shown on product DETAIL page, not on cards/lists
  "product.description": 0,
};

const LIST_EXCLUDE_SELECT = [
  // Phase 1a
  "product.variants",
  "product.product_codes",
  "product.suppliers",
  "product.composite_bom",
  "product.tag_ids",
  "product.attributes",
  "product.account_code_sales",
  "product.account_code_purchase",
  "product.price_outlet",
  "product.brand_id",
  "product.deleted_at",
  "product.version",
  "product.created_at",
  "product.updated_at",
  // Phase 2
  "webhook",
  "webhookTime",
  "__v",
  "updatedAt",
  // Phase 3
  "product.description",
]
  .map((f) => `-${f}`)
  .join(" ");
const PRODUCTS_URL = process.env.PRODUCTS_URL;

// ─── Private Helpers ─────────────────────────────────────────────

const logStatusFalseItems = (endpoint, requestData, responseData) => {
  try {
    let products = [];
    if (responseData && typeof responseData === "object") {
      if (responseData.products) products = responseData.products;
      else if (responseData.filteredProducts)
        products = responseData.filteredProducts;
      else if (responseData.data && responseData.data.products)
        products = responseData.data.products;
      else if (responseData.data && Array.isArray(responseData.data)) {
        responseData.data.forEach((item) => {
          if (item.products && Array.isArray(item.products)) {
            products = products.concat(item.products);
          }
        });
      } else if (responseData.product && responseData.id) {
        products = [responseData];
      } else if (Array.isArray(responseData)) products = responseData;
    }

    const falseStatusItems = products.filter(
      (item) => item && item.status === false
    );

    if (falseStatusItems.length > 0) {
      const logFilePath = path.join(__dirname, "../status_false_log.md");
      const timestamp = new Date().toISOString();

      let logContent = `\n---\n## STATUS FALSE ITEM DETECTED\n\n`;
      logContent += `**Timestamp:** ${timestamp}\n\n`;
      logContent += `**API Endpoint:** ${endpoint}\n\n`;
      logContent += `**Request Data:**\n\`\`\`json\n${JSON.stringify(
        requestData || {},
        null,
        2
      )}\n\`\`\`\n\n`;
      logContent += `**False Status Items Found:** ${falseStatusItems.length}\n\n`;

      falseStatusItems.forEach((item, index) => {
        logContent += `### Item ${index + 1}:\n`;
        logContent += `- **ID:** ${item._id || item.id || "N/A"}\n`;
        logContent += `- **Product ID:** ${item.product?.id || "N/A"}\n`;
        logContent += `- **Name:** ${item.product?.name || "N/A"}\n`;
        logContent += `- **Status:** ${item.status}\n`;
        logContent += `- **Total Qty:** ${item.totalQty || "N/A"}\n\n`;
      });

      logContent += `---\n`;

      try {
        if (fs.existsSync(logFilePath)) {
          fs.appendFileSync(logFilePath, logContent);
        } else {
          fs.writeFileSync(
            logFilePath,
            `# Status False Items Log\n\n${logContent}`
          );
        }
        console.log(
          `ALERT: ${falseStatusItems.length} items with status: false found in ${endpoint}`
        );
      } catch (fileError) {
        logger.error({ err: fileError }, "Error writing to status log file:");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error in status logging:");
  }
};

async function trackProductView(productId, userId = null) {
  try {
    const filter = { product_id: productId, user_id: userId };
    const existingView = await ProductView.findOne(filter);

    if (!existingView) {
      await ProductView.create({
        product_id: productId,
        user_id: userId,
        views: 1,
        lastViewedAt: new Date(),
      });
    } else {
      await ProductView.updateOne(filter, {
        $inc: { views: 1 },
        $set: { lastViewedAt: new Date() },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error tracking product view:");
  }
}

async function fetchAndCacheCategories() {
  const cacheKey = cache.key("lightspeed", "categories", "v1");

  try {
    const cachedCategories = await cache.get(cacheKey);
    if (cachedCategories) {
      logger.info("Fetching categories from cache");
      return cachedCategories;
    }

    logger.info("Fetching categories from Lightspeed API");

    const categoriesResponse = await axios.get(CATEGORIES_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const categories =
      categoriesResponse.data.data?.data?.categories || [];

    // 30 minutes — matches previous NodeCache stdTTL
    await cache.set(cacheKey, categories, 1800);

    return categories;
  } catch (error) {
    console.warn(
      "Error fetching categories from Lightspeed:",
      error.message
    );

    if (error.response && error.response.status >= 500) {
      throw new Error("Server error while fetching categories");
    }

    throw new Error("Failed to fetch categories");
  }
}

async function fetchCategoriesType(id) {
  // Lightspeed call for a product_type (category) — one external HTTP hit per
  // category view. Categories change rarely; 30 min TTL is safe.
  const cacheKey = cache.key("lightspeed", "product-type", String(id), "v1");
  return cache.getOrSet(cacheKey, 1800, async () => {
    try {
      const categoriesResponse = await axios.get(PRODUCT_TYPE + "/" + id, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      });
      return categoriesResponse.data || [];
    } catch (error) {
      console.warn(
        "Error fetching products from Lightspeed:",
        error.message
      );
      return [];
    }
  });
}

const checkSpelling = async (word) => {
  if (!word || typeof word !== "string") {
    return null;
  }

  const normalizedWord = word.trim().toLowerCase();
  const cacheKey = `spelling:${normalizedWord}`;

  const cachedResult = spellingCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    let suggestion = null;

    if (!dictionary.check(normalizedWord)) {
      const suggestions = dictionary.suggest(normalizedWord);
      suggestion = suggestions.length > 0 ? suggestions[0] : null;
    }

    spellingCache.set(cacheKey, suggestion);
    return suggestion;
  } catch (error) {
    logger.error({ err: error }, "Error in checkSpelling:");
    return null;
  }
};

async function fetchBrands() {
  try {
    const brandsResponse = await axios.get(BRANDS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });
    return brandsResponse.data || [];
  } catch (error) {
    console.warn("Error fetching brands from Lightspeed:", error.message);
    return [];
  }
}

async function fetchCategories() {
  try {
    const categoriesResponse = await axios.get(CATEGORIES_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });
    return categoriesResponse.data.data.data.categories || [];
  } catch (error) {
    console.warn(
      "Error fetching categories from Lightspeed:",
      error.message
    );
    return [];
  }
}

// ─── Exported Functions ──────────────────────────────────────────

/**
 * Paginated product listing (based on mobile version, enhanced with web version features)
 */
exports.getProducts = async (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 54;
  const filter = query.filter;
  const minPrice = parseFloat(query.minPrice);
  const maxPrice = parseFloat(query.maxPrice);

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
        $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0],
      },
    },
  });

  if (filter && filter.length > 0 && filter !== "[]") {
    try {
      const filterWords = JSON.parse(filter);
      if (filterWords.length > 0) {
        const words = filterWords.map((word) => word.toLowerCase());

        aggregationPipeline.push({
          $match: {
            "variantsData.sku": {
              $regex: new RegExp(`^(${words.join("|")}) - .*`, "i"),
            },
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Error parsing filter:");
    }
  }

  try {
    const countPipeline = [...aggregationPipeline, { $count: "total" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    const productsPipeline = [
      ...aggregationPipeline,
      { $addFields: { randomSort: { $rand: {} } } },
      { $sort: { randomSort: 1 } },
      { $project: { randomSort: 0 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: LIST_EXCLUDE_PROJECTION },
    ];

    const products = await Product.aggregate(productsPipeline);
    const totalPages = Math.ceil(totalCount / limit);

    const responseData = {
      success: true,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: totalCount,
        productsPerPage: limit,
      },
      products,
    };

    return responseData;
  } catch (error) {
    logger.error({ err: error }, "Error fetching products:");
    throw { status: 500, message: "An error occurred while fetching products" };
  }
};

/**
 * Product details + track view
 */
exports.getProductDetails = async (productId, userId) => {
  try {
    const product = await Product.findOne({ "product.id": productId });
    if (!product) {
      throw { status: 404, message: "No product found." };
    }

    await trackProductView(product._id, userId || null);

    // .lean() — reviews are read-only, no Mongoose overhead needed
    const reviews = await Review.find({ product_id: product._id }).lean();

    let totalQuality = 0;
    let totalValue = 0;
    let totalPrice = 0;
    const count = reviews.length;

    for (const review of reviews) {
      totalQuality += review.quality_rating || 0;
      totalValue += review.value_rating || 0;
      totalPrice += review.price_rating || 0;
    }

    const avgQuality = count ? (totalQuality / count).toFixed(1) : 0;
    const avgValue = count ? (totalValue / count).toFixed(1) : 0;
    const avgPrice = count ? (totalPrice / count).toFixed(1) : 0;

    const result = await ProductView.aggregate([
      { $match: { product_id: product._id } },
      { $group: { _id: null, totalViews: { $sum: "$views" } } },
    ]);

    const totalViews = result[0]?.totalViews || 0;

    const responseData = {
      _id: product._id,
      id: product._id,
      product: product.product,
      variantsData: product.variantsData,
      totalQty: product.totalQty,
      originalPrice: product.originalPrice || 0,
      discountedPrice: product.discountedPrice || 0,
      discount: product.discount || 0,
      reviews: reviews,
      reviewsCount: reviews.length,
      avgQuality: avgQuality,
      avgValue: avgValue,
      avgPrice: avgPrice,
      total_view: totalViews,
    };

    logStatusFalseItems(
      "/api/products/productsDetails",
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw {
      status: 500,
      message: "An error occurred while fetching product.",
    };
  }
};

/**
 * Home page products grouped by category
 */
exports.getHomeProducts = async () => {
  try {
    logger.info("API - Fetch Home Products");

    return await cache.getOrSet(
      cache.key('catalog', 'home-products', 'v1'),
      300, // 5-minute TTL — same as other smart-category endpoints
      async () => {

    const categories = await fetchAndCacheCategories();
    // Full product load is required here because the grouping is done in JS
    // (products are bucketed by product_type_id across arbitrary subcategories).
    // The cache wrapper above ensures this only hits MongoDB once per 5 minutes.
    const products = await Product.find({ status: true }).select(LIST_EXCLUDE_SELECT).lean();

    const sortedCategories = {};
    const categoryLookup = Object.fromEntries(
      categories.map((category) => [category.id, category.name])
    );

    categories.forEach((category) => {
      if (category.parent_category_id === null) {
        sortedCategories[category.name] = {
          id: category.id,
          name: category.name,
          sub_categories: [],
        };
      } else {
        const rootName = categoryLookup[category.root_category_id];
        if (rootName && sortedCategories[rootName]) {
          sortedCategories[rootName].sub_categories.push({
            id: category.id,
            name: category.name,
          });
        }
      }
    });

    const result = {};
    const categoriesArrays = {
      Electronics: "eb38712b-3652-4969-b34b-4389e770de4c",
      Home: "0aa39cca-853e-46cc-a7a0-2cddcc11cc70",
      "Home Improvement": "7bf90217-e79a-46ec-9aa3-5231071b487f",
      "Sports, Fitness & Outdoors":
        "5ce3bbd8-28cf-4643-b871-1f28a0eb216c",
      Toys: "ada654b6-9fb7-4c6f-bf40-1bae7c6dcbc6",
    };

    for (const [key, categoryId] of Object.entries(categoriesArrays)) {
      if (sortedCategories[key]) {
        const subcategories = sortedCategories[key].sub_categories;
        const subcategoriesWithProductCount = [];
        const getRandomItems = (array, count) => {
          const shuffled = array.sort(() => 0.5 - Math.random());
          return shuffled.slice(0, count);
        };

        subcategories.forEach((subcategory) => {
          const subcategoryProducts = products.filter(
            (product) =>
              product.product.product_type_id === subcategory.id
          );
          subcategoriesWithProductCount.push({
            id: subcategory.id,
            name: subcategory.name,
            product_count: subcategoryProducts.length,
            products: getRandomItems(subcategoryProducts, 24),
          });
        });

        subcategoriesWithProductCount.sort(
          (a, b) => b.product_count - a.product_count
        );
        result[key] = {
          sub_categories: subcategoriesWithProductCount.slice(0, 4),
        };
      }
    }

    const uncategorizedProducts = products.filter(
      (product) => product.product.product_type_id === null
    );
    if (uncategorizedProducts.length > 0) {
      result["Uncategorized"] = {
        sub_categories: [
          {
            id: "null-subcategory-id",
            name: "Uncategorized",
            products: uncategorizedProducts.slice(0, 24),
          },
        ],
      };
    }

    logger.info("Return - API - Fetch Home Products");
    return { result };

      }); // end cache.getOrSet
  } catch (error) {
    logger.error({ err: error }, "Error fetching products:");
    throw { status: 500, message: "Failed to fetch home products" };
  }
};

/**
 * Advanced search with Atlas/regex fallback + spell check
 */
exports.searchProducts = async (query) => {
  const { item_name, category_id } = query;

  try {
    if (!item_name || item_name.length < 3) {
      throw {
        status: 400,
        message: "Search term must be at least 3 characters long",
        data: {
          filteredProducts: [],
          filteredProductsCount: 0,
          noResult: true,
        },
      };
    }

    let searchStage = {
      $search: {
        index: "product_search",
        compound: {
          should: [
            {
              text: {
                query: item_name,
                path: "product.name",
                score: { boost: { value: 5 } },
                fuzzy: { maxEdits: 2, prefixLength: 1 },
              },
            },
            {
              autocomplete: {
                query: item_name,
                path: "product.name",
                score: { boost: { value: 3 } },
                fuzzy: { maxEdits: 1 },
              },
            },
            {
              text: {
                query: item_name,
                path: "product.description",
                score: { boost: { value: 1 } },
                fuzzy: { maxEdits: 2 },
              },
            },
          ],
          must: [
            { equals: { path: "status", value: true } },
            { range: { path: "totalQty", gt: 0 } },
          ],
          minimumShouldMatch: 1,
        },
      },
    };

    if (category_id) {
      searchStage.$search.compound.must.push({
        equals: {
          path: "product.product_type_id",
          value: category_id,
        },
      });
    }

    const pipeline = [
      searchStage,
      { $addFields: { score: { $meta: "searchScore" } } },
      {
        $match: {
          $expr: {
            $gt: [
              { $size: { $ifNull: ["$product.images", []] } },
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
        const searchTerms = item_name
          .trim()
          .split(/\s+/)
          .map(escapeRegex);

        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  {
                    "product.name": {
                      $regex: term,
                      $options: "i",
                    },
                  },
                  {
                    "product.description": {
                      $regex: term,
                      $options: "i",
                    },
                  },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery["product.product_type_id"] = category_id;
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
        aggError.message.includes("$search") ||
        aggError.message.includes("index")
      ) {
        const searchTerms = item_name
          .trim()
          .split(/\s+/)
          .map(escapeRegex);

        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  {
                    "product.name": {
                      $regex: term,
                      $options: "i",
                    },
                  },
                  {
                    "product.description": {
                      $regex: term,
                      $options: "i",
                    },
                  },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery["product.product_type_id"] = category_id;
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
          `${product.product?.name || ""} ${product.product?.description || ""}`.toLowerCase();
        const matched = searchWords.filter((word) =>
          text.includes(word)
        ).length;
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
    logger.error({ err: error }, "Error processing search request:");

    if (
      error.code === 40324 ||
      (error.message && error.message.includes("$search"))
    ) {
      throw { status: 500, message: "Search index not configured" };
    }

    throw {
      status: 500,
      message: "An error occurred while processing the request",
    };
  }
};

/**
 * Single product search
 */
exports.searchSingleProduct = async (name) => {
  try {
    const productName = escapeRegex(name.toLowerCase());
    const products = await Product.find({
      "product.name": { $regex: productName, $options: "i" },
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();
    if (products.length === 0) {
      throw {
        status: 404,
        message: `Product not found with the name "${name}"`,
      };
    }
    let filteredProducts = products.map((product) => product);
    filteredProducts = filteredProducts.filter(
      (product) => product.status === true
    );
    return { filteredProducts };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error searching for product:");
    throw { status: 500, message: "Internal Server Error" };
  }
};

/**
 * Sidebar + search categories
 */
exports.getCategories = async () => {
  try {
    const categories = await Category.find();
    if (categories.length === 0) {
      throw { status: 404, message: "No categories found." };
    }

    return {
      success: true,
      side_bar_categories: categories[0].side_bar_categories,
      search_categoriesList: categories[0].search_categoriesList,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw {
      status: 500,
      message: "An error occurred while fetching categories.",
    };
  }
};

/**
 * Search/filter categories (mobile-specific)
 */
exports.getSearchCategories = async (query) => {
  try {
    const { category_name } = query;
    const searchTerm = (category_name || "").toLowerCase();

    const categories = await Category.find();

    if (categories.length === 0) {
      throw { status: 404, message: "No categories found." };
    }

    const matchedCategories =
      categories[0].side_bar_categories.filter((category) =>
        category.name.toLowerCase().includes(searchTerm)
      );

    return {
      success: true,
      side_bar_categories: matchedCategories,
      search_categoriesList: categories[0].search_categoriesList,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw {
      status: 500,
      message: "An error occurred while fetching categories.",
    };
  }
};

/**
 * Products by category (with pagination)
 */
exports.getCategoriesProduct = async (categoryId, query) => {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(categoryId);

    // Build the list of category IDs that are descendants of `categoryId`
    // BEFORE we touch the DB, so we can push the filter down to Mongo.
    const categoryIds = [];
    categories.forEach((category) => {
      if (
        category.category_path[0] &&
        category.category_path[0].id === categoryId
      ) {
        category.category_path.forEach((path) => {
          categoryIds.push(path.id);
        });
      }
    });

    if (
      categoriesTypes &&
      categoriesTypes.data &&
      Array.isArray(categoriesTypes.data.category_path) &&
      categoriesTypes.data.category_path.length > 0
    ) {
      const categoryPath = categoriesTypes.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
    } else {
      categories = null;
    }

    const uniqueCategoryIds = [...new Set(categoryIds)];

    // If no categories resolved, short-circuit — nothing to return.
    if (uniqueCategoryIds.length === 0) {
      return {
        success: true,
        categories,
        categoryId,
        pagination: { currentPage: page, totalPages: 0, totalProducts: 0, productsPerPage: limit },
        filteredProductsCount: 0,
        filteredProducts: [],
      };
    }

    // Push every filter to MongoDB. Uses:
    //   - { status, totalQty, discountedPrice } compound index
    //   - { "product.product_type_id": 1 } index
    // We get only the page we need instead of loading ~2000 docs + slicing.
    const baseQuery = {
      totalQty: { $gt: 0 },
      status: true,
      discountedPrice: { $exists: true, $gt: 0 },
      "product.product_type_id": { $in: uniqueCategoryIds },
      "product.images.0": { $exists: true },
    };

    const [paginatedProducts, filteredProductsCount] = await Promise.all([
      Product.find(baseQuery)
        .select(LIST_EXCLUDE_SELECT)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(baseQuery),
    ]);

    const totalPages = Math.ceil(filteredProductsCount / limit);

    const responseData = {
      success: true,
      categories,
      categoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems(
      "/api/products/categoriesProduct",
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    throw {
      status: 500,
      message: "Failed to fetch categories or products",
    };
  }
};

/**
 * Products by subcategory (with pagination)
 */
exports.getSubCategoriesProduct = async (subCategoryId, query) => {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(subCategoryId);

    // Resolve target sub-category IDs BEFORE touching the DB.
    const categoryIds = [];
    categories.forEach((category) => {
      if (
        category.category_path[1] &&
        category.category_path[1].id === subCategoryId
      ) {
        category.category_path.forEach((path) => {
          categoryIds.push(path.id);
        });
      }
    });

    if (
      categoriesTypes &&
      categoriesTypes.data &&
      Array.isArray(categoriesTypes.data.category_path) &&
      categoriesTypes.data.category_path.length > 0
    ) {
      const categoryPath = categoriesTypes.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
    } else {
      categories = null;
    }

    const uniqueCategoryIds = [...new Set(categoryIds)];

    if (uniqueCategoryIds.length === 0) {
      return {
        success: true,
        categories,
        categoryId: subCategoryId,
        pagination: { currentPage: page, totalPages: 0, totalProducts: 0, productsPerPage: limit },
        filteredProductsCount: 0,
        filteredProducts: [],
      };
    }

    // Push every filter to MongoDB.
    const baseQuery = {
      totalQty: { $gt: 0 },
      status: true,
      discountedPrice: { $exists: true, $gt: 0 },
      "product.product_type_id": { $in: uniqueCategoryIds },
      "product.images.0": { $exists: true },
    };

    const [paginatedProducts, filteredProductsCount] = await Promise.all([
      Product.find(baseQuery)
        .select(LIST_EXCLUDE_SELECT)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(baseQuery),
    ]);

    const totalPages = Math.ceil(filteredProductsCount / limit);

    const responseData = {
      success: true,
      categories,
      categoryId: subCategoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems(
      "/api/products/subCategoriesProduct",
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    throw {
      status: 500,
      message: "Failed to fetch categories or products",
    };
  }
};

/**
 * Products by sub-subcategory (with pagination)
 */
exports.getSubSubCategoriesProduct = async (subSubCategoryId, query) => {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = [];

    // Push every filter to MongoDB — exact match on product_type_id.
    const baseQuery = {
      totalQty: { $gt: 0 },
      status: true,
      "product.product_type_id": subSubCategoryId,
      "product.images.0": { $exists: true },
    };

    // Push pagination to MongoDB (same pattern as getCategoriesProduct / getSubCategoriesProduct).
    // countDocuments + paginated find in parallel — avoids loading the full category into memory.
    const skip = (page - 1) * limit;
    const [filteredProductsCount, paginatedProducts, categoriesTypes] = await Promise.all([
      Product.countDocuments(baseQuery),
      Product.find(baseQuery).select(LIST_EXCLUDE_SELECT).skip(skip).limit(limit).lean(),
      fetchCategoriesType(subSubCategoryId),
    ]);

    if (
      categoriesTypes &&
      categoriesTypes.data &&
      Array.isArray(categoriesTypes.data.category_path) &&
      categoriesTypes.data.category_path.length > 0
    ) {
      const categoryPath = categoriesTypes.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
    } else {
      categories = null;
    }

    const totalPages = Math.ceil(filteredProductsCount / limit);

    const responseData = {
      success: true,
      categories,
      categoryId: subSubCategoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems(
      "/api/products/subSubCategoriesProduct",
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    throw {
      status: 500,
      message: "Failed to fetch categories or products",
    };
  }
};

/**
 * Full category tree
 */
exports.getAllCategories = async () => {
  try {
    logger.info("API - All Categories");

    const categories = await Category.find();
    // Only need product_type_id, totalQty for category counting — strip everything else.
    // Status filter pushed to DB (was loading all then filtering in JS).
    const allProducts = await Product.find({ status: true })
      .select("product.product_type_id totalQty")
      .lean();

    const productCountMap = {};
    allProducts.forEach((product) => {
      const productTypeId = product.product.product_type_id;
      if (!productCountMap[productTypeId]) {
        productCountMap[productTypeId] = 0;
      }

      if (product.totalQty > 0) {
        productCountMap[productTypeId]++;
      }
    });

    const categoryTree = {};
    const flatCategoryList = [];

    categories.forEach((category) => {
      const path = category.category_path;
      if (path && path.length > 0) {
        let currentLevel = categoryTree;
        const fullCategoryPath = [];

        path.forEach((categoryItem, index) => {
          const productTypeId = categoryItem.id;
          const qty = productCountMap[productTypeId] || 0;

          fullCategoryPath.push(categoryItem.name);

          if (!currentLevel[categoryItem.id]) {
            currentLevel[categoryItem.id] = {
              id: categoryItem.id,
              name: categoryItem.name,
              qty: 0,
              sub_categories: {},
            };
          }

          currentLevel[categoryItem.id].qty += qty;

          currentLevel =
            currentLevel[categoryItem.id].sub_categories;
        });

        flatCategoryList.push({
          id: category.id,
          name: fullCategoryPath.join(" / "),
          qty: productCountMap[category.id] || 0,
        });
      }
    });

    const aggregateSubCategoryQuantities = (category) => {
      let totalQty = category.qty;

      for (const subCategoryId in category.sub_categories) {
        const subCategory = category.sub_categories[subCategoryId];
        totalQty += aggregateSubCategoryQuantities(subCategory);
      }

      category.qty = totalQty;

      return totalQty;
    };

    Object.values(categoryTree).forEach((category) => {
      aggregateSubCategoryQuantities(category);
    });

    const convertToArray = (obj) => {
      return Object.values(obj).map((item) => ({
        ...item,
        sub_categories: convertToArray(item.sub_categories),
      }));
    };

    const finalCategoryTree = convertToArray(categoryTree);

    flatCategoryList.sort((a, b) => a.name.localeCompare(b.name));

    logger.info("Return - API - All Categories");
    return {
      side_bar_categories: finalCategoryTree,
      search_categoriesList: flatCategoryList,
    };
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    throw {
      status: 500,
      message: "Failed to fetch categories or products",
    };
  }
};

/**
 * Sync + return brands
 */
exports.getBrands = async () => {
  try {
    const brandsData = await fetchBrands();
    if (!brandsData.data || !Array.isArray(brandsData.data)) {
      throw { status: 500, message: "brandsData.data is not an array" };
    }
    const simplifiedBrands = brandsData.data.map((brand) => ({
      id: brand.id,
      name: brand.name,
    }));

    const bulkOps = simplifiedBrands.map((brand) => ({
      updateOne: {
        filter: { id: brand.id },
        update: { $set: { name: brand.name } },
        upsert: true,
      },
    }));
    await Brand.bulkWrite(bulkOps);

    logger.info("Return - API - All Brands");
    return {
      success: true,
      message:
        "Brands processed and saved to the database successfully.",
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Brands API error:");
    throw { status: 500, message: "Failed to fetch or save brands" };
  }
};

/**
 * Brand name lookup
 */
exports.getBrandNameById = async (id) => {
  try {
    const brand = await Brand.findOne({ id: id }).select("id name");
    if (!brand) {
      throw { status: 404, message: "Brand not found" };
    }
    return {
      brand: {
        id: brand.id,
        name: brand.name,
      },
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error fetching brand name:");
    throw { status: 500, message: "Server error" };
  }
};

/**
 * Category name lookup
 */
exports.getCategoryNameById = async (id) => {
  try {
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });

    if (!categoryDoc) {
      throw { status: 404, message: "Category ID not found" };
    }

    const item = categoryDoc.search_categoriesList.find(
      (cat) => cat.id === id
    );

    if (!item) {
      throw {
        status: 404,
        message: "ID found in doc but not in array",
      };
    }

    const mainCategory = item.name.split(/\s*\/\s*/)[0];

    return { name: mainCategory };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error fetching category name:");
    throw { status: 500, message: "Server error" };
  }
};

/**
 * Random products
 */
exports.getRandomProducts = async (excludeId) => {
  try {
    const categoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/product_types/${excludeId}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );
    const categoryDetails = categoryResponse.data;
    let categories = null;
    let categoryId = null;
    if (categoryDetails.data) {
      const categoryPath = categoryDetails.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
      categoryId = categoryDetails.data.id;
    }

    // Push status + product_type_id filter to DB (was loading all, filtering in JS)
    const subcategoryProducts = await Product.find({
      status: true,
      "product.product_type_id": excludeId,
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    const filteredProducts = subcategoryProducts.filter((product) => {
      return (
        product.variantsData &&
        product.variantsData.length > 0 &&
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
      );
    });

    const getRandomItems = (array, count) => {
      const shuffled = array.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };
    const randomProducts = getRandomItems(filteredProducts, 10);
    return { randomProducts };
  } catch (error) {
    logger.error({ err: error }, "Error fetching product details:");
    throw { status: 500, message: "Failed to fetch product details" };
  }
};

/**
 * Similar products
 */
exports.getSimilarProducts = async (productTypeId, productId) => {
  try {
    if (!productTypeId || productTypeId.trim() === "") {
      throw {
        status: 400,
        message: "Product type ID is required",
      };
    }

    const escapedId = productTypeId.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const products = await Product.find({
      $or: [{ status: { $exists: false } }, { status: true }],
      "product.product_type_id": {
        $regex: escapedId,
        $options: "i",
      },
      variantsData: { $exists: true, $ne: [] },
      discountedPrice: { $exists: true, $gt: 0 },
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    const filteredProducts = products.filter((product) => {
      if (
        productId &&
        product._id.toString() === productId.toString()
      ) {
        return false;
      }

      return (
        product.variantsData &&
        product.variantsData.length > 0 &&
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
      );
    });

    const getRandomItems = (array, count) => {
      const shuffled = array.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };

    const similarProducts = getRandomItems(filteredProducts, 20);

    const responseData = { similarProducts };

    logStatusFalseItems(
      "/api/products/similarProducts",
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    if (error.status) throw error;
    console.error(
      "Error fetching similar products:",
      error.message
    );
    throw {
      status: 500,
      message: "Failed to fetch similar products",
    };
  }
};

/**
 * Admin: paginated DB products
 */
exports.fetchDbProducts = async (query) => {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = query.search || "";
    const status = query.status;
    const qty = query.qty;

    const safeSearchQuery = escapeRegex(searchQuery);

    let dbQuery = {};

    if (status !== undefined) {
      const statusValue = status === "true" || status === true;
      dbQuery.status = statusValue;
    }

    if (qty !== undefined) {
      if (qty === "0") {
        dbQuery.totalQty = { $eq: 0 };
      } else if (qty === "greater" || qty === "gt") {
        dbQuery.totalQty = { $gt: 0 };
      } else if (qty === "gte") {
        dbQuery.totalQty = { $gte: 0 };
      }
    }

    if (searchQuery) {
      const searchConditions = {
        $or: [
          {
            "product.name": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
          {
            "product.description": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
          {
            "product.sku_number": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
        ],
      };

      if (Object.keys(dbQuery).length > 0) {
        dbQuery = {
          $and: [dbQuery, searchConditions],
        };
      } else {
        dbQuery = searchConditions;
      }
    }

    const products = await Product.find(dbQuery)
      .select(LIST_EXCLUDE_SELECT)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalCount = await Product.countDocuments(dbQuery).exec();

    return {
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      products,
    };
  } catch (error) {
    logger.error({ err: error }, "Error fetching products:");
    throw { status: 500, message: "Failed to fetch products" };
  }
};

/**
 * Admin: products missing images
 */
exports.fetchProductsNoImages = async (query) => {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = query.search || "";

    const safeSearchQuery = escapeRegex(searchQuery);

    let dbQuery = {
      $or: [
        { "product.images": { $exists: false } },
        { "product.images": null },
        { "product.images": [] },
        {
          $expr: {
            $eq: [
              { $size: { $ifNull: ["$product.images", []] } },
              0,
            ],
          },
        },
      ],
    };

    if (searchQuery) {
      const searchCondition = {
        "product.name": {
          $regex: `.*${safeSearchQuery}.*`,
          $options: "i",
        },
      };

      dbQuery = {
        $and: [dbQuery, searchCondition],
      };
    }

    const products = await Product.find(dbQuery)
      .select(LIST_EXCLUDE_SELECT)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalCount = await Product.countDocuments(dbQuery).exec();

    return {
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      products,
    };
  } catch (error) {
    logger.error({ err: error }, "Error fetching products with no images:");
    throw {
      status: 500,
      message: "Failed to fetch products with no images",
    };
  }
};

/**
 * Simple fetch all products
 */
exports.getAllProducts = async () => {
  try {
    logger.info("API - Fetch All Products");
    // Push status filter to DB (was loading all, filtering in JS)
    const allProducts = await Product.find({ status: true })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    logger.info("Return - API - Fetch All Products");
    return allProducts;
  } catch (error) {
    logger.error({ err: error }, "Error fetching data from API:");
    throw { status: 500, message: "Internal Server Error" };
  }
};
