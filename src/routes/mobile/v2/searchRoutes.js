const express = require("express");
const searchController = require("../../../controllers/mobile/v2/searchController");

const router = express.Router();

router.get("/suggestions", searchController.getSuggestions);

module.exports = router;
