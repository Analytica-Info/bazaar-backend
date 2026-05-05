/**
 * Platform detection middleware for v2 routes.
 *
 * Sets req.platform = 'web' | 'mobile'
 *
 * Detection order:
 * 1. X-Client header: 'web' | 'mobile' (explicit, highest priority)
 * 2. Cookie presence (user_token) → 'web'
 * 3. Authorization header (Bearer) → 'mobile'
 * 4. Fallback → 'web' (fresh-browser unauthenticated requests; e.g. login)
 *
 * The 'web' fallback is intentional: mobile binaries always send a Bearer
 * token (verified by client audits), so any request without auth indicators
 * is most likely a logged-out browser user about to authenticate. Defaulting
 * to 'web' lets fresh-browser users hit /v2/auth/login etc. without first
 * needing the web team to ship an X-Client header. See V1-BACKCOMPAT-FINAL-
 * AUDIT.md for the full reasoning.
 *
 * The dispatcher in src/routes/v2/index.js retains a defensive UNKNOWN_PLATFORM
 * branch in case anything else sets req.platform to a non-web/non-mobile
 * value explicitly.
 */
module.exports = function platform(req, _res, next) {
    const header = req.headers['x-client'];

    if (header === 'web' || header === 'mobile') {
        req.platform = header;
    } else if (req.cookies?.user_token) {
        req.platform = 'web';
    } else if (req.headers.authorization?.startsWith('Bearer ')) {
        req.platform = 'mobile';
    } else {
        // Unauthenticated fresh-browser request — default to web.
        req.platform = 'web';
    }

    next();
};
