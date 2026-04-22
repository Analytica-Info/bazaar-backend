const express = require("express");
const authMiddleware = require("../../../middleware/authMiddleware");
const checkoutController = require("../../../controllers/mobile/v2/checkoutController");

const router = express.Router();

router.get("/prepare", authMiddleware, checkoutController.prepare);

module.exports = router;
