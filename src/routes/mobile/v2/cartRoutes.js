const express = require("express");
const authMiddleware = require("../../../middleware/authMiddleware");
const cartController = require("../../../controllers/mobile/v2/cartController");

const router = express.Router();

router.get("/summary", authMiddleware, cartController.getSummary);

module.exports = router;
