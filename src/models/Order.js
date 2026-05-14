const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        order_id: { type: String, unique: true }, // Unique professional order ID
        order_no: { type: Number, unique: true }, // Sequential order number
        order_datetime: { type: String },
        name: { type: String, required: true },
        phone: { type: String, default: '-' },
        country: { type: String, default: 'AE' },
        currency: { type: String, default: 'AED' },
        state: { type: String, default: '-' },
        address: { type: String, required: true },
        city: { type: String, default: '-' },
        area: { type: String, default: '-' },
        buildingName: { type: String, default: '-' },
        floorNo: { type: String, default: '-' },
        apartmentNo: { type: String, default: '-' },
        landmark: { type: String, default: '-' },
        email: { type: String, required: true },
        status: { type: String, required: true },
        amount_subtotal: { type: String, required: true },
        amount_total: { type: String, required: true },
        discount_amount: { type: String, required: true },
        saved_total: { type: String },
        shipping: { type: Number, default: 0 },
        txn_id: { type: String, required: true },
        payment_method: { type: String, required: true },
        payment_status: { type: String, required: true },
        checkout_session_id: { type: String, required: false },
        orderfrom: { type: String, default: '-' },
        orderTracks: [
            {
                status: { type: String, required: true },
                dateTime: { type: String },
                image: { type: String },
            }
        ],
        proof_of_delivery: { type: [String], default: [] },
    },
    {
        timestamps: true,
        strict: false, // Allow fields from both ecommerce (userId) and mobile (user_id) backends
    }
);

// User order history — mobile writes user_id, web writes userId (both via strict:false)
orderSchema.index({ user_id: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
// Admin list filters
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

/**
 * Dual-field reconciliation hook.
 *
 * Historically, the mobile backend wrote `user_id` and the web backend wrote
 * `userId`. Reads now go through OrderRepository which `$or`s both fields,
 * but writes were inconsistent — leaving rows with only one field set, which
 * propagates the duality forever.
 *
 * This hook normalizes every write so that BOTH fields are always populated
 * with the same value. Callers can keep writing whichever field they like;
 * the hook ensures the other is mirrored. Safe to apply retroactively — if
 * both are already set and equal, this is a no-op.
 */
function mirrorOwnerFieldsOnDoc(doc) {
    if (!doc) return;
    // user_id is off-schema (strict: false) — read/write via .get/.set/.markModified
    const userId = doc.userId;
    const user_id = typeof doc.get === 'function' ? doc.get('user_id') : doc.user_id;
    if (userId && !user_id) {
        if (typeof doc.set === 'function') doc.set('user_id', userId, { strict: false });
        else doc.user_id = userId;
    } else if (user_id && !userId) {
        if (typeof doc.set === 'function') doc.set('userId', user_id);
        else doc.userId = user_id;
    }
}

function mirrorOwnerFieldsOnPlain(obj) {
    if (!obj) return;
    if (obj.userId && !obj.user_id) obj.user_id = obj.userId;
    else if (obj.user_id && !obj.userId) obj.userId = obj.user_id;
}

orderSchema.pre('save', function (next) {
    mirrorOwnerFieldsOnDoc(this);
    next();
});

orderSchema.pre('insertMany', function (next, docs) {
    if (Array.isArray(docs)) docs.forEach(mirrorOwnerFieldsOnPlain);
    next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
