const BankPromoCode = require('../../models/BankPromoCode');
const BankPromoCodeUsage = require('../../models/BankPromoCodeUsage');

/**
 * GET /admin/bank-promo-codes
 * List all bank promo codes (newest first)
 */
exports.list = async (req, res) => {
  try {
    const promos = await BankPromoCode.find()
      .sort({ createdAt: -1 })
      .lean();

    const promosWithUsage = await Promise.all(
      promos.map(async (p) => {
        const uniqueCustomers = await BankPromoCodeUsage.countDocuments({
          bankPromoCodeId: p._id,
        });
        return {
          ...p,
          id: p._id.toString(),
          expiryDate: p.expiryDate ? p.expiryDate.toISOString().split('T')[0] : null,
          uniqueCustomers,
        };
      })
    );

    return res.status(200).json({
      success: true,
      promos: promosWithUsage,
    });
  } catch (err) {
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
    const {
      code,
      discountPercent,
      capAED,
      expiryDate,
      singleUsePerCustomer = true,
      exclusive = false,
      allowedBank,
      binRanges,
      active = true,
    } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Promo code is required.',
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    const discount = Number(discountPercent);
    const cap = Number(capAED);

    if (isNaN(discount) || discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: 'Discount must be between 0 and 100%.',
      });
    }
    if (isNaN(cap) || cap < 0) {
      return res.status(400).json({
        success: false,
        message: 'Cap (AED) must be a positive number.',
      });
    }
    if (!expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date is required.',
      });
    }
    if (!allowedBank || !allowedBank.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Allowed bank is required.',
      });
    }

    if (active) {
      const existing = await BankPromoCode.findOne({
        code: normalizedCode,
        active: true,
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message:
            'An active promo code with this name already exists. Use a different code or deactivate the existing one.',
        });
      }
    }

    const bins = Array.isArray(binRanges)
      ? binRanges.filter(Boolean).map(String)
      : [];

    const promo = new BankPromoCode({
      code: normalizedCode,
      discountPercent: discount,
      capAED: cap,
      expiryDate: new Date(expiryDate),
      singleUsePerCustomer: !!singleUsePerCustomer,
      exclusive: !!exclusive,
      allowedBank: allowedBank.trim(),
      binRanges: bins,
      active: !!active,
      usageCount: 0,
    });

    await promo.save();

    const doc = promo.toObject();
    return res.status(201).json({
      success: true,
      message: 'Promo code created successfully.',
      promo: {
        ...doc,
        id: doc._id.toString(),
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
        uniqueCustomers: 0,
      },
    });
  } catch (err) {
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
    const promo = await BankPromoCode.findById(req.params.id).lean();
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found.',
      });
    }
    const uniqueCustomers = await BankPromoCodeUsage.countDocuments({
      bankPromoCodeId: promo._id,
    });
    return res.status(200).json({
      success: true,
      promo: {
        ...promo,
        id: promo._id.toString(),
        expiryDate: promo.expiryDate ? promo.expiryDate.toISOString().split('T')[0] : null,
        uniqueCustomers,
      },
    });
  } catch (err) {
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
    const promo = await BankPromoCode.findById(req.params.id);
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found.',
      });
    }

    const {
      code,
      discountPercent,
      capAED,
      expiryDate,
      singleUsePerCustomer,
      exclusive,
      allowedBank,
      binRanges,
      active,
    } = req.body;

    if (code !== undefined && code.trim()) {
      const normalizedCode = code.trim().toUpperCase();
      if (active !== false) {
        const existing = await BankPromoCode.findOne({
          code: normalizedCode,
          active: true,
          _id: { $ne: req.params.id },
        });
        if (existing) {
          return res.status(400).json({
            success: false,
            message:
              'An active promo code with this name already exists. Use a different code or deactivate the existing one.',
          });
        }
      }
      promo.code = normalizedCode;
    }

    if (discountPercent !== undefined) {
      const d = Number(discountPercent);
      if (isNaN(d) || d < 0 || d > 100) {
        return res.status(400).json({ success: false, message: 'Discount must be between 0 and 100%.' });
      }
      promo.discountPercent = d;
    }
    if (capAED !== undefined) {
      const c = Number(capAED);
      if (isNaN(c) || c < 0) {
        return res.status(400).json({ success: false, message: 'Cap (AED) must be a positive number.' });
      }
      promo.capAED = c;
    }
    if (expiryDate !== undefined) promo.expiryDate = new Date(expiryDate);
    if (singleUsePerCustomer !== undefined) promo.singleUsePerCustomer = !!singleUsePerCustomer;
    if (exclusive !== undefined) promo.exclusive = !!exclusive;
    if (allowedBank !== undefined && allowedBank.trim()) promo.allowedBank = allowedBank.trim();
    if (binRanges !== undefined) {
      promo.binRanges = Array.isArray(binRanges)
        ? binRanges.filter(Boolean).map(String)
        : [];
    }
    if (active !== undefined) promo.active = !!active;

    await promo.save();

    const doc = promo.toObject();
    const uniqueCustomers = await BankPromoCodeUsage.countDocuments({
      bankPromoCodeId: doc._id,
    });
    return res.status(200).json({
      success: true,
      message: 'Promo code updated successfully.',
      promo: {
        ...doc,
        id: doc._id.toString(),
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
        uniqueCustomers,
      },
    });
  } catch (err) {
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
    const promo = await BankPromoCode.findById(req.params.id);
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found.',
      });
    }

    if (promo.active) {
      promo.active = false;
    } else {
      const existing = await BankPromoCode.findOne({
        code: promo.code,
        active: true,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Another active promo with this code already exists. Deactivate it first.',
        });
      }
      promo.active = true;
    }

    await promo.save();

    const doc = promo.toObject();
    const uniqueCustomers = await BankPromoCodeUsage.countDocuments({
      bankPromoCodeId: doc._id,
    });
    return res.status(200).json({
      success: true,
      message: promo.active ? 'Promo code activated.' : 'Promo code deactivated.',
      promo: {
        ...doc,
        id: doc._id.toString(),
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
        uniqueCustomers,
      },
    });
  } catch (err) {
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
    const promo = await BankPromoCode.findByIdAndDelete(req.params.id);
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found.',
      });
    }
    await BankPromoCodeUsage.deleteMany({ bankPromoCodeId: req.params.id });
    return res.status(200).json({
      success: true,
      message: 'Promo code deleted successfully.',
    });
  } catch (err) {
    console.error('BankPromoCode delete error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete promo code',
      error: err.message,
    });
  }
};
