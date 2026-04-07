const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/ecommerce/cartController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/get-cart', authMiddleware('user'), cartController.getCart);
router.post('/add-to-cart', authMiddleware('user'), cartController.addToCart);
router.post('/remove-to-cart', authMiddleware('user'), cartController.removeFromCart);
router.post('/increase', authMiddleware('user'), cartController.increaseCartQty);
router.post('/decrease', authMiddleware('user'), cartController.decreaseCartQty);

module.exports = router;