const searchSuggestionService = require("../../../services/v2/searchSuggestionService");
const logger = require("../../../utilities/logger");

/**
 * GET /api/v2/search/suggestions
 *
 * Query:
 *   limit=N   per-bucket cap (default 8, max 20)
 *
 * Response:
 *   { trending: string[], popularBrands: string[], topCategories: string[] }
 */
exports.getSuggestions = async (req, res) => {
  try {
    const limit = Math.min(
      20,
      Math.max(1, parseInt(req.query.limit, 10) || 8),
    );
    const data = await searchSuggestionService.getSuggestions({ limit });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error({ err: error }, "v2 search suggestions failed");
    res.status(500).json({
      success: false,
      trending: [],
      popularBrands: [],
      topCategories: [],
    });
  }
};
