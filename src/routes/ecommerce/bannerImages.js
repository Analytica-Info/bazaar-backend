const express = require("express");
const router = express.Router();
const bannerController = require("../../controllers/ecommerce/bannerImageController");
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|webp/;
const banners = createUpload(allowedFileTypes, "uploads/banners");

router.post("/banner", banners.single("file"), bannerController.createBanner);
router.get("/banners", bannerController.getAllBanners);
router.put("/banner/:id", banners.single("file"), bannerController.updateBanner);
router.delete("/banner/:id", bannerController.deleteBanner);

module.exports = router;