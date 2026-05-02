const path = require("path");
const fs = require("fs");
const BannerImages = require('../repositories').bannerImages.rawModel();

async function createBanner(name, filePath) {
  if (!name) {
    throw { status: 400, message: "Banner name is required" };
  }

  const existing = await BannerImages.findOne({ name });
  if (existing) {
    throw { status: 400, message: "Banner with this name already exists" };
  }

  const imageUrl = `${process.env.FRONTEND_BASE_URL}/${filePath}`;
  const banner = await BannerImages.create({ name, image: imageUrl });
  return banner;
}

async function getAllBanners() {
  const banners = await BannerImages.find().sort({ createdAt: -1 });
  return banners;
}

async function updateBanner(id, name, filePath) {
  const banner = await BannerImages.findById(id);
  if (!banner) {
    throw { status: 404, message: "Banner not found" };
  }

  if (name) {
    banner.name = name;
  }

  if (filePath) {
    const oldRelativePath = banner.image.replace(
      `${process.env.FRONTEND_BASE_URL}/`,
      ""
    );
    const oldAbsolutePath = path.resolve(oldRelativePath);
    if (fs.existsSync(oldAbsolutePath)) {
      fs.unlinkSync(oldAbsolutePath);
    }
    banner.image = `${process.env.FRONTEND_BASE_URL}/${filePath}`;
  }

  await banner.save();
  return banner;
}

async function deleteBanner(id) {
  const banner = await BannerImages.findById(id);
  if (!banner) {
    throw { status: 404, message: "Banner not found" };
  }

  const relativePath = banner.image.replace(
    `${process.env.FRONTEND_BASE_URL}/`,
    ""
  );
  const absolutePath = path.resolve(relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await BannerImages.findByIdAndDelete(id);
  return {};
}

module.exports = {
  createBanner,
  getAllBanners,
  updateBanner,
  deleteBanner,
};
