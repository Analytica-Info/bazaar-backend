'use strict';

// Marks the relevant coupon flag on the user document and saves exactly once.
// Exported for unit testing; called after every successful order creation.
module.exports = async function markCouponUsed(user, couponCode) {
    if (!user || !couponCode) return;
    let dirty = false;
    if (couponCode === 'FIRST15') {
        user.usedFirst15Coupon = true;
        dirty = true;
    }
    if (couponCode === 'UAE10' && !user.usedUAE10Coupon) {
        user.usedUAE10Coupon = true;
        dirty = true;
    }
    if (dirty) await user.save();
};
