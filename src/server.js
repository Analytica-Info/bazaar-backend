const express = require("express");
const connectDB = require("./config/db.js");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const mongoose = require("mongoose");
require("dotenv").config();

const logger = require("./utilities/logger");
const JWT_SECRET = require("./config/jwtSecret.js");
const authMiddleware = require("./middleware/authMiddleware");
const adminMiddleware = require("./middleware/adminMiddleware");
const Coupon = require("./models/Coupon.js");
const Cronjoblog = require("./models/Cronjoblog.js");
const updateProducts = require("./scripts/updateProducts.js");
const updateProductsNew = require("./scripts/updateProductsNew.js");
const sendScheduledNotifications = require("./scripts/sendScheduledNotifications.js");

// ==========================================
// STARTUP VALIDATION
// ==========================================

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.fatal(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Ecommerce server controllers (inline routes)
const { tabbyWebhook: ecommerceTabbyWebhook } = require("./controllers/ecommerce/publicController");

// ==========================================
// ECOMMERCE ROUTES (consumed by: Storefront, User Dashboard, Admin Dashboard)
// ==========================================
const requestMetrics = require("./middleware/requestMetricsMiddleware");
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
const mobileConfigRoutes = require("./routes/mobile/configRoutes.js");

// ==========================================
// V2 UNIFIED API ROUTES (BFF — gated by V2_ENABLED env flag)
// ==========================================
const v2Router = require("./routes/v2/index.js");

// ==========================================
// APP SETUP
// ==========================================
const app = express();

const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL;
const domain = process.env.DOMAIN;
const isProduction = process.env.NODE_ENV === "production";
const LOG_FILE = "cron.log";
let cronJobRunning = false;

// Trust proxy — required behind Hostinger's proxy/CDN for rate limiting and IP detection
app.set("trust proxy", 1);

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin for uploads/images
  })
);

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later." },
});
app.use("/user/login", authLimiter);
app.use("/user/register", authLimiter);
app.use("/admin/login", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/v2/auth/login", authLimiter);
app.use("/v2/auth/register", authLimiter);
app.use("/v2/auth/google-login", authLimiter);
app.use("/v2/auth/apple-login", authLimiter);
app.use("/v2/auth/refresh-token", authLimiter);

// Stricter rate limit for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many password reset attempts, please try again later." },
});
app.use("/user/forgot-password", passwordResetLimiter);
app.use("/admin/forgot-password", passwordResetLimiter);
app.use("/api/auth/forgot-password", passwordResetLimiter);
app.use("/v2/auth/forgot-password", passwordResetLimiter);
app.use("/v2/auth/reset-password", passwordResetLimiter);
app.use("/v2/auth/verify-code", passwordResetLimiter);
app.use("/v2/auth/resend-recovery-code", passwordResetLimiter);

// ==========================================
// CORE MIDDLEWARE
// ==========================================

// Tabby webhook needs raw body BEFORE any body parsers
app.post("/tabby/webhook", bodyParser.raw({ type: "*/*" }), (req, res, next) => {
  return ecommerceTabbyWebhook(req, res, next);
});

app.use(cookieParser());

// CORS — allowlist when ALLOWED_ORIGINS is set, fall back to open (legacy mobile API).
// V2 web cookies require an allowlist; mixed mode lets us roll out gradually.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (ALLOWED_ORIGINS.length > 0) {
  app.use(
    cors({
      credentials: true,
      origin: (origin, cb) => {
        // Allow requests with no Origin (mobile apps, curl, server-to-server)
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
      },
    })
  );
} else {
  if (isProduction) {
    logger.warn("ALLOWED_ORIGINS not set — CORS is open. This is unsafe for v2 web cookie sessions.");
  }
  app.use(cors({ credentials: true, origin: true }));
}

// Body parsing with size limits (Express 5 has built-in parsers)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());

// Static file serving for uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logging — duration + response size
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const duration = Date.now() - start;
    const sizeBytes = body ? Buffer.byteLength(JSON.stringify(body), "utf8") : 0;
    const sizeKb = (sizeBytes / 1024).toFixed(1);

    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      responseKb: `${sizeKb} KB`,
    };

    if (duration > 3000) {
      logger.warn(logData, "Slow request");
    } else if (sizeBytes > 512 * 1024) {
      // Log any response > 512 KB so large payloads are visible in logs
      logger.warn(logData, "Large response payload");
    } else {
      logger.debug(logData, "Request");
    }

    return originalJson(body);
  };

  next();
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? "healthy" : "unhealthy",
    uptime: Math.floor(process.uptime()),
    database: dbStatus[dbState] || "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// INLINE ROUTES FROM ECOMMERCE SERVER.JS
// ==========================================

app.post("/api/user/auth/logout", (req, res) => {
  res.clearCookie("user_token", {
    domain: domain || undefined,
    path: "/",
    secure: true,
    sameSite: "none",
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
    const { name, email, avatar, username, role, phone, authProvider: provider } = req.user;
    const couponDoc = await Coupon.findOne({ phone });
    const state = !!couponDoc;
    const dataCoupon = couponDoc || [];
    res.json({
      name, email, avatar, username, role, phone, provider,
      coupon: { data: dataCoupon, status: state },
    });
  } catch (error) {
    logger.error({ err: error }, "Profile Error");
    res.status(500).json({ message: "Server error" });
  }
});

// ==========================================
// CONNECT TO DB AND MOUNT ALL ROUTES
// ==========================================

const connectAndRun = async () => {
  await connectDB();

  // --- Ecommerce routes (original paths from port 5050) ---
  app.use("/admin", requestMetrics("admin-api"), ecommerceAdminRoutes);
  app.use("/admin/roles", requestMetrics("admin-api"), ecommerceRoleRoutes);
  app.use("/admin/permissions", requestMetrics("admin-api"), ecommercePermissionRoutes);
  app.use("/admin", requestMetrics("admin-api"), ecommerceEmailRoutes);
  app.use("/user", requestMetrics("user-api"), ecommerceUserRoutes);
  app.use("/user", requestMetrics("user-api"), ecommerceOrderRoutes);
  app.use("/webhook", requestMetrics("webhook"), ecommerceWebhooksRoutes);
  app.use("/", ecommercePublicRoutes);
  app.use("/", ecommerceWishlistRoutes);
  app.use("/cart", requestMetrics("user-api"), ecommerceCartRoutes);
  app.use("/", ecommerceBannerImages);
  app.use("/", ecommerceSeedRoutes);

  // --- Mobile API routes (original paths from port 5000) ---
  app.use("/api/auth", requestMetrics("user-api"), mobileAuthRoutes);
  app.use("/api/products", requestMetrics("user-api"), mobileProductRoutes);
  app.use("/api/wishlist", requestMetrics("user-api"), mobileWishlistRoutes);
  app.use("/api/cart", requestMetrics("user-api"), mobileCartRoutes);
  app.use("/api/order", requestMetrics("user-api"), mobileOrderRoutes);
  app.use("/api/notification", requestMetrics("user-api"), mobileNotificationRoutes);
  app.use("/api", requestMetrics("user-api"), mobileCouponsRoutes);
  app.use("/api", requestMetrics("user-api"), mobilePublicRoutes);
  app.use("/api", requestMetrics("user-api"), mobileBannerImages);
  app.use("/api/mobile", requestMetrics("user-api"), mobileConfigRoutes);

  // --- V2 Unified API (gated by V2_ENABLED env flag) ---
  if (process.env.V2_ENABLED === 'true') {
    app.use("/v2", requestMetrics("v2-api"), v2Router);
    logger.info("V2 API routes mounted at /v2");
  }

  // ==========================================
  // GLOBAL ERROR HANDLER (must be after all routes)
  // ==========================================
  app.use((err, req, res, _next) => {
    // CORS errors
    if (err.message === "Not allowed by CORS") {
      return res.status(403).json({ success: false, message: "CORS not allowed" });
    }

    logger.error({
      err: err,
      method: req.method,
      url: req.originalUrl,
      body: req.method === "GET" ? undefined : "[redacted]",
    }, "Unhandled error");

    res.status(err.status || 500).json({
      success: false,
      message: isProduction ? "Internal server error" : err.message,
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
  });
};

connectAndRun();

// ==========================================
// CRON JOBS
// ==========================================

// Product sync: daily at 3 AM Dubai time
cron.schedule(
  "0 3 * * *",
  async () => {
    if (cronJobRunning) return;
    cronJobRunning = true;
    const date = new Date();
    const day = date.toLocaleString("en-US", { weekday: "long", timeZone: "Asia/Dubai" });
    const dateStr = date.toLocaleString("en-US", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Dubai" });
    const timeStr = date.toLocaleString("en-US", { hour: "2-digit", minute: "numeric", second: "numeric", hour12: true, timeZone: "Asia/Dubai" });
    const formattedDate = `${day}, ${dateStr}, ${timeStr}`;
    const logMessage1 = `Cron job executing at: ${formattedDate}\n`;
    const logMessage2 = `Cron job executing at: ${formattedDate}`;

    fs.appendFileSync(LOG_FILE, logMessage1);
    logger.info("Product sync cron started");

    try {
      const { storedCount, updatedCount } = await updateProducts();
      const { parkedCount, inactiveCount } = await updateProductsNew();
      const updatedDate = new Date();
      const updatedDay = updatedDate.toLocaleString("en-US", { weekday: "long", timeZone: "Asia/Dubai" });
      const updatedDateStr = updatedDate.toLocaleString("en-US", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Dubai" });
      const updatedTimeStr = updatedDate.toLocaleString("en-US", { hour: "2-digit", minute: "numeric", second: "numeric", hour12: true, timeZone: "Asia/Dubai" });
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

      logger.info({ storedCount, updatedCount, parkedCount, inactiveCount }, "Product sync completed");

      try {
        const response = await axios.get(`${BACKEND_URL}/categories`);
        fs.appendFileSync(LOG_FILE, `${response.data.message} at ${updatedFormattedDate}\n`);
      } catch (apiError) {
        fs.appendFileSync(LOG_FILE, `Error calling API: ${apiError.message}\n`);
      }

      try {
        const brandsResponse = await axios.get(`${BACKEND_URL}/brands`);
        fs.appendFileSync(LOG_FILE, `${brandsResponse.data.message} at ${updatedFormattedDate}\n`);
      } catch (apiError) {
        fs.appendFileSync(LOG_FILE, `Error calling /brands API: ${apiError.message}\n`);
      }
    } catch (error) {
      logger.error({ err: error }, "Product sync cron failed");
      fs.appendFileSync(LOG_FILE, `Error updating products: ${error.message}\n`);
    } finally {
      cronJobRunning = false;
    }
  },
  { scheduled: true, timezone: "Asia/Dubai" }
);

// Scheduled notifications: every minute
cron.schedule(
  "* * * * *",
  async () => {
    try {
      await sendScheduledNotifications();
    } catch (error) {
      logger.error({ err: error }, "Scheduled notifications cron failed");
    }
  },
  { scheduled: true, timezone: "Asia/Dubai" }
);

// ==========================================
// START SERVER + GRACEFUL SHUTDOWN
// ==========================================

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Bazaar Unified API started");
});

function gracefulShutdown(signal) {
  logger.info({ signal }, "Shutdown signal received, closing gracefully...");
  server.close(() => {
    logger.info("HTTP server closed");
    mongoose.connection.close(false).then(() => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    });
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught Exception — shutting down");
  process.exit(1);
});

module.exports = app;
