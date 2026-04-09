# Backend Unification Audit — Findings

## Critical Issues (must fix before production)

### 1. RUNTIME BUG — bankPromoCodeController.delete
Controller calls `bankPromoCodeService.delete()` but service exports `remove`, not `delete`.
**Impact:** `/admin/bank-promo-codes/:id` DELETE endpoint will crash.
**Fix:** Change controller to call `.remove()` instead of `.delete()`.

### 2. Middleware: 402 vs 401 for expired tokens
Original mobile middleware returned `401` for all JWT errors. Unified returns `402` for expired tokens.
**Impact:** Mobile app checks for `401` to trigger re-auth — won't catch `402`.
**Fix:** Revert to `401` for expired tokens, OR update mobile app to also handle `402`.

### 3. `search` and `searchProduct` merged in mobile productController
Both now call `productService.searchProducts(req.body)`. Original `search` had completely different logic (category/variant/price filtering). Original `searchProduct` did text search by name.
**Impact:** The `search` endpoint may be broken — category filtering, variant filtering, price range, and sorting may not work.
**Fix:** Verify productService handles both use cases, or split back into separate service functions.

### 4. bankPromoCodeController.toggleActive response mismatch
Controller expects `result.message` and `result.promo` but service returns just the promo object.
**Impact:** Response will have `promo: undefined, message: undefined`.
**Fix:** Update service to return `{ message, promo }` or update controller.

### 5. bankPromoCodeService validation regression
Original had granular validation (discountPercent 0-100, capAED >= 0). Service dropped these.
**Impact:** Invalid values can be saved to DB.
**Fix:** Add validation back to service.

### 6. bankPromoCodeService missing `id` field
Original `list` added `id: p._id.toString()` to each promo. Service doesn't.
**Impact:** If frontend uses `promo.id`, it gets `undefined`.
**Fix:** Add `id` field to service response.

## Medium Issues

### 7. orderRoutes: authMiddleware added to order-status
Original `POST /order-status/:orderId` had no auth. Unified added `authMiddleware`.
**Impact:** If delivery services call this endpoint without auth tokens, it will fail.
**Fix:** Intentional security fix — verify no external callers depend on this.

### 8. validateInventoryBeforeCheckout platform label
Hardcoded as `'Website Backend'` in mobile orderController. Should be `'Mobile App Backend'`.
**Fix:** Pass platform from controller.

### 9. Middleware isBlocked check
Original mobile middleware did NOT check `isBlocked`. Unified does (returns 403).
**Impact:** Previously blocked users who were still making requests will now be rejected.
**Fix:** Intentional security improvement — keep it.

### 10. emailConfigService normalization dropped
Original `.toLowerCase().trim()` on emails before save. Service doesn't.
**Fix:** Add normalization back.

## Low Issues

### 11. wishlistController addToWishlist duplicate status
Original returned `200` for duplicate. Unified may return `400`.
**Fix:** Verify and match original behavior.

### 12. Error message text changes
Several error messages changed slightly (different wording, same meaning).
**Impact:** If frontend matches exact error strings, it may break.

### 13. register returns extra field
Unified returns `error.existingUser` in error response that original didn't.
**Impact:** Extra field, non-breaking.
