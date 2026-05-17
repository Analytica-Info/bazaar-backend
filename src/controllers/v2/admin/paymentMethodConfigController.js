'use strict';

const asyncHandler = require('../../../middleware/asyncHandler');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const repos = require('../../../repositories');
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const { logBackendActivity } = require('../../../utilities/backendLogger');

const CACHE_KEY = 'payment-method-config:v1';

// Boolean fields the admin endpoint will let an operator toggle.
// `bannersEnabled` is non-payment but lives on this singleton too — see
// the model file for the rationale and the mobile read-site.
const TOGGLEABLE_FIELDS = ['stripeEnabled', 'tabbyEnabled', 'nomodEnabled', 'bannersEnabled'];

/**
 * GET /v2/admin/payment-method-config
 * Returns the singleton config doc, auto-creating it if absent.
 */
exports.getConfig = asyncHandler(async (req, res) => {
    const doc = await repos.paymentMethodConfig.getSingleton();
    return res.status(200).json(wrap(doc));
});

/**
 * PUT /v2/admin/payment-method-config
 * Partial update — only present boolean fields are applied.
 * Strict boolean validation: strings and numbers are rejected.
 */
exports.updateConfig = asyncHandler(async (req, res) => {
    const body = req.body || {};

    // Build the patch — only accept known fields
    const patch = {};
    const validationErrors = [];

    for (const field of TOGGLEABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            if (typeof body[field] !== 'boolean') {
                validationErrors.push(`${field} must be a strict boolean (true or false)`);
            } else {
                patch[field] = body[field];
            }
        }
    }

    if (validationErrors.length > 0) {
        return res.status(400).json(wrapError('VALIDATION_ERROR', 'Invalid field types', validationErrors));
    }

    if (Object.keys(patch).length === 0) {
        return res.status(400).json(wrapError('VALIDATION_ERROR', `Request body must contain at least one of: ${TOGGLEABLE_FIELDS.join(', ')}`));
    }

    const updatedDoc = await repos.paymentMethodConfig.updateSingleton(patch, {
        updatedAt: clock.now(),
        updatedBy: String(req.user._id),
    });

    // Invalidate cache so the change is visible immediately
    await cache.del(CACHE_KEY);

    await logBackendActivity({
        platform: 'Admin Dashboard Backend',
        activity_name: 'Payment Method Config Update',
        status: 'success',
        message: `Updated by ${req.user._id}: ${JSON.stringify(patch)}`,
        execution_path: 'paymentMethodConfigController.updateConfig',
    });

    return res.status(200).json(wrap(updatedDoc));
});
