const express = require('express');
const { saleUpdate, inventoryUpdate, productUpdate } = require('../../controllers/ecommerce/webhookController');
const adminMiddleware = require('../../middleware/adminMiddleware');

const router = express.Router();

// Body already parsed by global express.urlencoded() in server.js — no route-level parser needed
router.post('/product-update', productUpdate);
router.post('/inventory-update', inventoryUpdate);
router.post('/sale-update', saleUpdate);

module.exports =  router;