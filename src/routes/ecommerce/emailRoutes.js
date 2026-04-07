const express = require('express');
const { getEmailConfig, updateEmailConfig, syncFromEnv } = require('../../controllers/ecommerce/emailController');
const adminMiddleware = require('../../middleware/adminMiddleware');

const router = express.Router();

router.get('/email-config', adminMiddleware, getEmailConfig);
router.put('/email-config', adminMiddleware, updateEmailConfig);
router.post('/email-config/sync-env', adminMiddleware, syncFromEnv);

module.exports = router;

