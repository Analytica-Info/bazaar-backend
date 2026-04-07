const bannerService = require("../../services/bannerService");

exports.createBanner = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Banner name is required" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Banner image is required" });
        }

        const filePath = req.file.path.replace(/\\/g, "/");
        const banner = await bannerService.createBanner(name, filePath);

        res.status(201).json({
            message: "Banner created successfully",
            banner,
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.getAllBanners = async (req, res) => {
    try {
        const banners = await bannerService.getAllBanners();
        res.status(200).json({ banners });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const filePath = req.file?.path?.replace(/\\/g, "/") || null;

        const banner = await bannerService.updateBanner(id, name, filePath);

        res.status(200).json({ message: "Banner updated successfully", banner });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        await bannerService.deleteBanner(id);
        res.status(200).json({ message: "Banner deleted successfully" });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message });
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
