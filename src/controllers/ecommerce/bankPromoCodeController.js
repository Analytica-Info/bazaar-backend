const bankPromoCodeService = require("../../services/bankPromoCodeService");

/**
 * GET /admin/bank-promo-codes
 * List all bank promo codes (newest first)
 */
exports.list = async (req, res) => {
    try {
        const promos = await bankPromoCodeService.list();
        return res.status(200).json({ success: true, promos });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode list error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch promo codes',
            error: err.message,
        });
    }
};

/**
 * POST /admin/bank-promo-codes
 * Create a new bank promo code
 */
exports.create = async (req, res) => {
    try {
        const promo = await bankPromoCodeService.create(req.body);
        return res.status(201).json({
            success: true,
            message: 'Promo code created successfully.',
            promo,
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode create error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to create promo code',
            error: err.message,
        });
    }
};

/**
 * GET /admin/bank-promo-codes/:id
 */
exports.getById = async (req, res) => {
    try {
        const promo = await bankPromoCodeService.getById(req.params.id);
        return res.status(200).json({ success: true, promo });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode getById error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch promo code',
            error: err.message,
        });
    }
};

/**
 * PUT /admin/bank-promo-codes/:id
 */
exports.update = async (req, res) => {
    try {
        const promo = await bankPromoCodeService.update(req.params.id, req.body);
        return res.status(200).json({
            success: true,
            message: 'Promo code updated successfully.',
            promo,
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode update error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to update promo code',
            error: err.message,
        });
    }
};

/**
 * PATCH /admin/bank-promo-codes/:id/toggle-active
 * Toggle active status
 */
exports.toggleActive = async (req, res) => {
    try {
        const result = await bankPromoCodeService.toggleActive(req.params.id);
        return res.status(200).json({
            success: true,
            message: result.message,
            promo: result.promo,
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode toggleActive error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle promo code',
            error: err.message,
        });
    }
};

/**
 * DELETE /admin/bank-promo-codes/:id
 */
exports.delete = async (req, res) => {
    try {
        await bankPromoCodeService.delete(req.params.id);
        return res.status(200).json({
            success: true,
            message: 'Promo code deleted successfully.',
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error('BankPromoCode delete error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete promo code',
            error: err.message,
        });
    }
};
