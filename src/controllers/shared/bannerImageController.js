const { BannerImages } = require("../../models/BannerImages");
const path = require("path");
const fs = require("fs");

exports.createBanner = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Banner name is required" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Banner image is required" });
        }

        let newFile = req.file.path.replace(/\\/g, "/");
        newFile = `${process.env.FRONTEND_BASE_URL}/${newFile}`;

        const existing = await BannerImages.findOne({ name });
        if (existing) {
            return res.status(400).json({ message: "Banner name already exists" });
        }

        const banner = await BannerImages.create({ name, image: newFile });

        res.status(201).json({
            message: "Banner created successfully",
            banner,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getAllBanners = async (req, res) => {
    try {
        const banners = await BannerImages.find().sort({ createdAt: -1 });
        res.status(200).json({ banners });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const banner = await BannerImages.findById(id);
        if (!banner) {
            return res.status(404).json({ message: "Banner not found" });
        }

        if (name) banner.name = name;

        if (req.file) {
            const oldPath = path.resolve(banner.image.replace(process.env.FRONTEND_BASE_URL + "/", ""));
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }

            let newFile = req.file.path.replace(/\\/g, "/");
            banner.image = `${process.env.FRONTEND_BASE_URL}/${newFile}`;
        }

        await banner.save();

        res.status(200).json({ message: "Banner updated successfully", banner });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await BannerImages.findById(id);
        if (!banner) {
            return res.status(404).json({ message: "Banner not found" });
        }

        const oldPath = path.resolve(banner.image.replace(process.env.FRONTEND_BASE_URL + "/", ""));
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }

        await BannerImages.findByIdAndDelete(id);

        res.status(200).json({ message: "Banner deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};