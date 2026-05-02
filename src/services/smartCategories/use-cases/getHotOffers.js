'use strict';

const Product = require('../../../repositories').products.rawModel();
const cache = require('../../../utilities/cache');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');

// Shared TTL for smart-category reads — 5 minutes.
const SMART_CAT_TTL = 300;

/**
 * Get hot offers grouped by price ranges.
 * @param {Object} config
 * @param {string} config.priceField - "tax_inclusive" or "tax_exclusive"
 */
async function getHotOffers({ priceField }) {
    return cache.getOrSet(
        cache.key('catalog', 'hot-offers', priceField, 'v1'),
        SMART_CAT_TTL,
        async () => {
            const ranges = [
                { min: 1, max: 49, priceRange: "AED 1 - 49", label: "Budget Finds" },
                { min: 50, max: 99, priceRange: "AED 50 - 99", label: "Hot Mid-Range Deals" },
                { min: 100, max: 199, priceRange: "AED 100 - 199", label: "Smart Value Picks" },
                { min: 200, max: 299, priceRange: "AED 200 - 299", label: "Premium at a Price" },
                { min: 300, max: 399, priceRange: "AED 300 - 399", label: "Crowd Favorites" },
                { min: 400, max: 499, priceRange: "AED 400 - 499", label: "Quality Meets Value" },
            ];

            const result = await Promise.all(
                ranges.map(async (range) => {
                    const pipeline = [
                        {
                            $match: {
                                status: true,
                                totalQty: { $gt: 0 },
                                discountedPrice: { $gte: range.min, $lte: range.max },
                                "product.images.0": { $exists: true },
                            },
                        },
                        { $sample: { size: 20 } },
                        {
                            $project: {
                                images: "$product.images.sizes.original",
                            },
                        },
                    ];

                    const products = await Product.aggregate(pipeline);

                    let photos;
                    if (priceField === "tax_exclusive") {
                        photos = products
                            .flatMap((p) => p.images || [])
                            .filter(
                                (img) =>
                                    typeof img === "string" &&
                                    !img.toLowerCase().endsWith(".webp")
                            );
                    } else {
                        photos = products
                            .flatMap((p) => p.images || [])
                            .filter((img) => {
                                if (typeof img !== "string" || !img.trim()) return false;
                                const lower = img.toLowerCase();
                                return /\.(jpg|jpeg|png|gif|webp|svg|bmp|jfif|tiff)(\?.*)?$/.test(lower);
                            });
                    }

                    if (photos.length > 4) {
                        photos = photos.sort(() => 0.5 - Math.random()).slice(0, 4);
                    }

                    return {
                        priceRange: range.priceRange,
                        label: range.label,
                        images: photos,
                    };
                })
            );

            return result;
        }
    );
}

module.exports = { getHotOffers };
