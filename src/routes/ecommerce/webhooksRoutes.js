const express = require('express');
const { saleUpdate, inventoryUpdate, productUpdate } = require('../../controllers/ecommerce/webhookController');
const adminMiddleware = require('../../middleware/adminMiddleware');
const bodyParser = require('body-parser');

const router = express.Router();

router.post('/product-update', bodyParser.urlencoded({ extended: true }), productUpdate);
router.post('/inventory-update', bodyParser.urlencoded({ extended: true }), inventoryUpdate);
router.post('/sale-update', bodyParser.urlencoded({ extended: true }), saleUpdate);

module.exports =  router;