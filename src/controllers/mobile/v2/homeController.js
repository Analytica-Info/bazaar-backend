const jwt = require("jsonwebtoken");
const User = require("../../../models/User");
const JWT_SECRET = require("../../../config/jwtSecret");
const homeAggregateService = require("../../../services/v2/homeAggregateService");
const logger = require("../../../utilities/logger");

/**
 * Soft-authenticate: if a valid Bearer token is present, attach req.user.
 * If no token or invalid token, proceed with user=null (public path).
 *
 * Used instead of the strict authMiddleware so the home aggregate works
 * for both anonymous and logged-in users — same endpoint, enriched
 * response when authenticated.
 */
async function resolveOptionalUser(req) {
  try {
    const rawToken =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.user_token ||
      null;
    if (!rawToken) return null;
    const decoded = jwt.verify(rawToken, JWT_SECRET);
    const user = await User.findById(decoded.id).lean();
    if (!user || user.isBlocked || user.isDeleted) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * GET /api/v2/home/summary
 *
 * Query params:
 *   include=banners,categories,trending,topRated,newArrivals,flashSales,address,cart
 *     Optional. Defaults to banners,categories,trending,topRated,newArrivals.
 *   limit_<section>=N
 *     Optional per-section cap, e.g. `limit_trending=8&limit_newArrivals=6`.
 *
 * Response shape: { success, meta, sections: { <key>: <data>|{error} } }
 * Partial failures return a per-section { error: message } — never a 500.
 */
exports.getHomeSummary = async (req, res) => {
  try {
    const user = await resolveOptionalUser(req);

    const include = req.query.include
      ? String(req.query.include)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const limits = {};
    for (const key of Object.keys(req.query)) {
      if (key.startsWith("limit_")) {
        const parsed = parseInt(req.query[key], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          limits[key.slice("limit_".length)] = parsed;
        }
      }
    }

    const data = await homeAggregateService.getHomeSummary({
      user,
      include,
      limits,
    });

    res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error({ err: error }, "v2 getHomeSummary failed");
    res.status(500).json({
      success: false,
      message: "Failed to load home",
    });
  }
};
