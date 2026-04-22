const express = require("express");
const homeController = require("../../../controllers/mobile/v2/homeController");

const router = express.Router();

// Public + optionally authenticated. Middleware omitted intentionally —
// the controller resolves the user softly and enriches when present.
router.get("/summary", homeController.getHomeSummary);

module.exports = router;
