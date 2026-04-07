const express = require('express');
const router = express.Router();
const wishlistController = require('../../controllers/ecommerce/wishlistController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/get-wishlist', authMiddleware('user'), wishlistController.getWishlist);
router.post('/add-to-wishlist', authMiddleware('user'), wishlistController.addToWishlist);
router.post('/remove-to-wishlist', authMiddleware('user'), wishlistController.removeFromWishlist);

module.exports = router;