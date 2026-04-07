const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/mobile/cartController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/get-cart', authMiddleware, cartController.getCart);
router.post('/add-to-cart', authMiddleware, cartController.addToCart);
router.post('/remove-to-cart', authMiddleware, cartController.removeFromCart);
router.post('/increase', authMiddleware, cartController.increaseCartQty);
router.post('/decrease', authMiddleware, cartController.decreaseCartQty);

module.exports = router;