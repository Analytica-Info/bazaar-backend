const express = require("express");
const connectDB = require("./config/db.js");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const NodeCache = require("node-cache");
require("dotenv").config();

const JWT_SECRET = require("./config/jwtSecret.js");
const authMiddleware = require("./middleware/authMiddleware");
const Coupon = require("./models/Coupon.js");
const Cronjoblog = require("./models/Cronjoblog.js");
const updateProducts = require("./scripts/updateProducts.js");
const updateProductsNew = require("./scripts/updateProductsNew.js");
const sendScheduledNotifications = require("./scripts/sendScheduledNotifications.js");

// Ecommerce server controllers (inline routes)
const { tabbyWebhook: ecommerceTabbyWebhook } = require("./controllers/ecommerce/publicController");

// Mobile API controller (tabby webhook)
const { tabbyWebhook: mobileTabbyWebhook } = require("./controllers/mobile/orderController");

// ==========================================
// ECOMMERCE ROUTES (consumed by: Storefront, User Dashboard, Admin Dashboard)
// ==========================================
const ecommerceAdminRoutes = require("./routes/ecommerce/adminRoutes.js");
const ecommerceUserRoutes = require("./routes/ecommerce/userRoutes.js");
const ecommercePublicRoutes = require("./routes/ecommerce/publicRoutes.js");
const ecommerceCartRoutes = require("./routes/ecommerce/cartRoutes.js");
const ecommerceOrderRoutes = require("./routes/ecommerce/orderRoutes.js");
const ecommerceWishlistRoutes = require("./routes/ecommerce/wishlistRoutes.js");
const ecommerceWebhooksRoutes = require("./routes/ecommerce/webhooksRoutes.js");
const ecommerceBannerImages = require("./routes/ecommerce/bannerImages.js");
const ecommerceRoleRoutes = require("./routes/ecommerce/roleRoutes.js");
const ecommercePermissionRoutes = require("./routes/ecommerce/permissionRoutes.js");
const ecommerceEmailRoutes = require("./routes/ecommerce/emailRoutes.js");
const ecommerceSeedRoutes = require("./routes/ecommerce/seedRoutes.js");

// ==========================================
// MOBILE API ROUTES (consumed by: Flutter Mobile App)
// ==========================================
const mobileAuthRoutes = require("./routes/mobile/authRoutes.js");
const mobileProductRoutes = require("./routes/mobile/productRoutes.js");
const mobileWishlistRoutes = require("./routes/mobile/wishlistRoutes.js");
const mobileCartRoutes = require("./routes/mobile/cartRoutes.js");
const mobileOrderRoutes = require("./routes/mobile/orderRoutes.js");
const mobileCouponsRoutes = require("./routes/mobile/couponsRoutes.js");
const mobileNotificationRoutes = require("./routes/mobile/notificationRoutes.js");
const mobilePublicRoutes = require("./routes/mobile/publicRoutes.js");
const mobileBannerImages = require("./routes/mobile/bannerImages.js");

// ==========================================
// APP SETUP
// ==========================================
const app = express();
const cache = new NodeCache({ stdTTL: 1800 });

const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL;
const API_KEY = process.env.API_KEY;
const PRODUCTS_URL = process.env.PRODUCTS_URL;
const domain = process.env.DOMAIN;
const LOG_FILE = "cron.log";
let cronJobRunning = false;

// ==========================================
// MIDDLEWARE STACK
// ==========================================

// Tabby webhook needs raw body BEFORE any body parsers
// This handles the ecommerce server's tabby webhook (was at POST /tabby/webhook with auth)
app.post("/tabby/webhook", bodyParser.raw({ type: "*/*" }), (req, res, next) => {
  // Try ecommerce handler first (it was the original), fallback to mobile handler
  // Both backends registered this path — use ecommerce version which includes auth check
  return ecommerceTabbyWebhook(req, res, next);
});

app.use(cookieParser());

// CORS: Support both restricted (web clients) and open (mobile clients)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Allow Apple Sign-In origin
      if (origin.includes("appleid.apple.com")) {
        return callback(null, true);
      }

      // Allow origins from environment variable
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static file serving for uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ==========================================
// INLINE ROUTES FROM ECOMMERCE SERVER.JS
// These were defined directly in the ecommerce server.js, not in route files
// ==========================================

app.post("/api/user/auth/logout", (req, res) => {
  res.clearCookie("user_token", {
    domain: domain,
    path: "/",
  });
  res.status(200).json({ message: "User logged out successfully" });
});

app.get("/api/user/auth/check", (req, res) => {
  const token = req.cookies.user_token;
  if (!token) {
    return res.json({ authenticated: false });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, user: decoded });
  });
});

app.get("/api/user/profile", authMiddleware("user"), async (req, res) => {
  try {
    const {
      name,
      email,
      avatar,
      username,
      role,
      phone,
      authProvider: provider,
    } = req.user;

    const couponDoc = await Coupon.findOne({ phone });
    const state = !!couponDoc;
    const dataCoupon = couponDoc || [];

    res.json({
      name,
      email,
      avatar,
      username,
      role,
      phone,
      provider,
      coupon: {
        data: dataCoupon,
        status: state,
      },
    });
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ==========================================
// CONNECT TO DB AND MOUNT ALL ROUTES
// ==========================================

const connectAndRun = async () => {
  await connectDB();

  // --- Ecommerce routes (original paths from port 5050) ---
  app.use("/admin", ecommerceAdminRoutes);
  app.use("/admin/roles", ecommerceRoleRoutes);
  app.use("/admin/permissions", ecommercePermissionRoutes);
  app.use("/admin", ecommerceEmailRoutes);
  app.use("/user", ecommerceUserRoutes);
  app.use("/user", ecommerceOrderRoutes);
  app.use("/webhook", ecommerceWebhooksRoutes);
  app.use("/", ecommercePublicRoutes);
  app.use("/", ecommerceWishlistRoutes);
  app.use("/cart", ecommerceCartRoutes);
  app.use("/", ecommerceBannerImages);
  app.use("/", ecommerceSeedRoutes);

  // --- Mobile API routes (original paths from port 5000) ---
  app.use("/api/auth", mobileAuthRoutes);
  app.use("/api/products", mobileProductRoutes);
  app.use("/api/wishlist", mobileWishlistRoutes);
  app.use("/api/cart", mobileCartRoutes);
  app.use("/api/order", mobileOrderRoutes);
  app.use("/api/notification", mobileNotificationRoutes);
  app.use("/api", mobileCouponsRoutes);
  app.use("/api", mobilePublicRoutes);
  app.use("/api", mobileBannerImages);
};

connectAndRun();

// ==========================================
// CRON JOBS (from Ecommerce server)
// ==========================================

// Product sync: daily at 3 AM Dubai time
cron.schedule(
  "0 3 * * *",
  async () => {
    if (cronJobRunning) return;
    cronJobRunning = true;
    const date = new Date();
    const day = date.toLocaleString("en-US", {
      weekday: "long",
      timeZone: "Asia/Dubai",
    });
    const dateStr = date.toLocaleString("en-US", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "Asia/Dubai",
    });
    const timeStr = date.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "numeric",
      second: "numeric",
      hour12: true,
      timeZone: "Asia/Dubai",
    });
    const formattedDate = `${day}, ${dateStr}, ${timeStr}`;
    const logMessage1 = `Cron job executing at: ${formattedDate}\n`;
    const logMessage2 = `Cron job executing at: ${formattedDate}`;

    fs.appendFileSync(LOG_FILE, logMessage1);

    try {
      const { storedCount, updatedCount } = await updateProducts();
      const { parkedCount, inactiveCount } = await updateProductsNew();
      const updatedDate = new Date();
      const updatedDay = updatedDate.toLocaleString("en-US", {
        weekday: "long",
        timeZone: "Asia/Dubai",
      });
      const updatedDateStr = updatedDate.toLocaleString("en-US", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone: "Asia/Dubai",
      });
      const updatedTimeStr = updatedDate.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "numeric",
        second: "numeric",
        hour12: true,
        timeZone: "Asia/Dubai",
      });
      const updatedFormattedDate = `${updatedDay}, ${updatedDateStr}, ${updatedTimeStr}`;

      const productsUpdatedMessage1 = `Products updated successfully at: ${updatedFormattedDate}\n`;
      const productsUpdatedMessage2 = `Products updated successfully at: ${updatedFormattedDate}`;
      fs.appendFileSync(LOG_FILE, productsUpdatedMessage1);

      const cronLog = new Cronjoblog({
        cron_job_start: logMessage2,
        new_products: storedCount,
        total_products: updatedCount,
        parked_products: parkedCount,
        inactive_products: inactiveCount,
        cron_job_end: productsUpdatedMessage2,
      });
      await cronLog.save();

      try {
        const response = await axios.get(`${BACKEND_URL}/categories`);
        const categoriesUpdatedMessage = `${response.data.message} at ${updatedFormattedDate}\n`;
        fs.appendFileSync(LOG_FILE, categoriesUpdatedMessage);
      } catch (apiError) {
        const errorMessage = `Error calling API: ${apiError.message}\n`;
        fs.appendFileSync(LOG_FILE, errorMessage);
      }

      try {
        const brandsResponse = await axios.get(`${BACKEND_URL}/brands`);
        const brandsUpdatedMessage = `${brandsResponse.data.message} at ${updatedFormattedDate}\n`;
        fs.appendFileSync(LOG_FILE, brandsUpdatedMessage);
      } catch (apiError) {
        const errorMessage = `Error calling /brands API: ${apiError.message}\n`;
        fs.appendFileSync(LOG_FILE, errorMessage);
      }
    } catch (error) {
      const errorMessage = `Error updating products: ${error.message}\n`;
      fs.appendFileSync(LOG_FILE, errorMessage);
    } finally {
      cronJobRunning = false;
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Dubai",
  }
);

// Scheduled notifications: every minute
cron.schedule(
  "* * * * *",
  async () => {
    try {
      await sendScheduledNotifications();
    } catch (error) {
      console.error("Error in scheduled notifications cron job:", error);
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Dubai",
  }
);

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`Bazaar Unified API running on port ${PORT}`);
});

module.exports = app;
