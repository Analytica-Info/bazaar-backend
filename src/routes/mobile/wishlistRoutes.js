const express = require('express');
const router = express.Router();
const wishlistController = require('../../controllers/mobile/wishlistController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/get-wishlist', authMiddleware, wishlistController.getWishlist);
router.post('/add-to-wishlist', authMiddleware, wishlistController.addToWishlist);
router.post('/remove-to-wishlist', authMiddleware, wishlistController.removeFromWishlist);

module.exports = router;