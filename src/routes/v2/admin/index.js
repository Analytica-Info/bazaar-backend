'use strict';

/**
 * V2 Admin sub-router.
 *
 * All routes here are protected by adminMiddleware (Bearer token verified
 * against the Admin collection). The X-Client platform header is NOT required
 * for admin routes.
 *
 * Mount point: /v2/admin  (wired in src/routes/v2/index.js BEFORE the
 * platform middleware so admin requests bypass the X-Client requirement).
 */
const express = require('express');
const router = express.Router();

const adminMiddleware = require('../../../middleware/adminMiddleware');
const paymentMethodConfigController = require('../../../controllers/v2/admin/paymentMethodConfigController');

router.get('/admin/payment-method-config', adminMiddleware, paymentMethodConfigController.getConfig);
router.put('/admin/payment-method-config', adminMiddleware, paymentMethodConfigController.updateConfig);

module.exports = router;
