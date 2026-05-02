/**
 * Platform detection middleware for v2 routes.
 *
 * Sets req.platform = 'web' | 'mobile' | 'unknown'
 *
 * Detection order:
 * 1. X-Client header: 'web' | 'mobile'
 * 2. Cookie presence (user_token) → 'web'
 * 3. Authorization header (Bearer) → 'mobile'
 * 4. Fallback → 'unknown'
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
        req.platform = 'unknown';
    }

    next();
};
