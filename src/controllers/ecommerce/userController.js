const authService = require("../../services/authService");
const userService = require("../../services/userService");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../../config/jwtSecret");

const BACKEND_URL = process.env.BACKEND_URL;
const WEB_URL = process.env.URL;

// ---------------------------------------------------------------------------
// Cookie helper
// ---------------------------------------------------------------------------
const setCookie = (res, token, cookieMaxAge) => {
  const isProduction = process.env.NODE_ENV === "production";
  const domain = process.env.DOMAIN;

  res.cookie("user_token", token, {
    domain: isProduction ? domain : undefined,
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: cookieMaxAge,
  });
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const result = await authService.register({
      name,
      email,
      phone,
      password,
      platform: "web",
    });

    if (result.restored) {
      return res.status(200).json({ message: "Account restored successfully" });
    }

    return res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Register Error:", error);
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || "Server error",
      existingUser: error.existingUser,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, fcmToken, rememberMe } = req.body;

    const result = await authService.loginWithCredentials({
      email,
      password,
      fcmToken,
      rememberMe,
      platform: "web",
    });

    setCookie(res, result.tokens.accessToken, result.cookieMaxAge);

    return res.status(200).json({
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { tokenId, rememberMe } = req.body;
    const userAgent = req.headers["user-agent"] || "";

    const result = await authService.googleLogin({
      tokenId,
      rememberMe,
      platform: "web",
      userAgent,
    });

    setCookie(res, result.tokens.accessToken, result.cookieMaxAge);

    return res.status(200).json({
      message: "Login successful",
      refreshToken: result.tokens.refreshToken,
    });
  } catch (error) {
    console.error("Unhandled Error in googleLogin:", error);
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Server error during Google login",
    });
  }
};

exports.appleLogin = async (req, res) => {
  try {
    let {
      code,
      state,
      user,
      authorizationCode,
      idToken,
      email,
      firstName,
      lastName,
      rememberMe,
    } = req.body;

    const result = await authService.appleLogin({
      idToken,
      code,
      authorizationCode,
      userData: user,
      name: firstName || lastName ? `${firstName || ""} ${lastName || ""}`.trim() : undefined,
      rememberMe,
      platform: "web",
    });

    setCookie(res, result.tokens.accessToken, result.cookieMaxAge);

    // Redirect to frontend success URL (same as original)
    const successUrl =
      process.env.APPLE_SUCCESS_URL ||
      `${WEB_URL}/success` ||
      "http://localhost:5173/success";

    return res.redirect(`${successUrl}?apple_login=success`);
  } catch (error) {
    console.error("Unhandled Error in appleLogin:", error);

    // Redirect to frontend failure URL (same as original)
    const failureUrl =
      process.env.APPLE_FAILURE_URL ||
      `${WEB_URL}/failed` ||
      "http://localhost:5173/failed";
    return res.redirect(
      `${failureUrl}?apple_login=error&message=${encodeURIComponent(
        error.message || "Server error during Apple login"
      )}`
    );
  }
};

exports.appleCallback = async (req, res) => {
  const { code, state, user } = req.body;
  console.log("appleCallback", code, user);

  // This endpoint uses direct Apple code exchange and redirect
  // Kept inline since it has unique redirect logic
  const fs = require("fs");
  const path = require("path");
  const axios = require("axios");

  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;

  const keyPath =
    process.env.APPLE_KEY_PATH ||
    path.join(__dirname, "../config", `AuthKey_${keyId}.p8`);
  const privateKey = fs.readFileSync(keyPath).toString();

  const clientSecret = jwt.sign(
    {
      iss: teamId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 * 24,
      aud: "https://appleid.apple.com",
      sub: clientId,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: { kid: keyId },
    }
  );

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const response = await axios.post(
    "https://appleid.apple.com/auth/token",
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const tokenResponse = response.data;
  const identityToken = tokenResponse.id_token;
  const decoded = jwt.decode(identityToken);
  const appleUserId = decoded.sub;
  let appleEmail = user?.email;
  let name = `${user?.name?.firstName} ${user?.name?.lastName}`;

  const User = require("../../models/User");

  if (!appleEmail) {
    const existing = await User.findOne({ appleId: appleUserId });
    appleEmail = existing.email;
    name = `${existing.firstName} ${existing.lastName}`;
  } else {
    await User.create({
      appleId: appleUserId,
      email: appleEmail,
      name,
    });
  }

  return res.redirect(
    `${WEB_URL}/callback?identityToken=${identityToken}&email=${appleEmail}&firstName=${firstName}&lastName=${lastName}`
  );
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);

    res.status(200).json({ message: "Verification code sent to email" });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    await authService.verifyCode(email, code);

    res.status(200).json({ message: "Code verified successfully" });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;

    const token = req.cookies?.user_token;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token" });
      } else if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      } else {
        return res.status(500).json({ message: "Token verification failed" });
      }
    }

    await authService.updatePassword(decoded.id, old_password, new_password);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    await authService.resetPassword(email, code, new_password, "web");

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.userUpdate = async (req, res) => {
  try {
    const { name, email, phone, username } = req.body;
    const user_id = req.user._id;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const filePath = req.file
      ? `${BACKEND_URL}/${req.file.path.replace(/\\/g, "/")}`
      : undefined;

    const result = await authService.updateProfile(
      user_id,
      { name, email, phone, username },
      filePath
    );

    res.status(200).json({ message: "User updated successfully", user: result.user });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    await authService.deleteAccount(userId, "web");

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete Account Error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.deleteAccountPublic = async (req, res) => {
  try {
    const { email, password } = req.body;
    await authService.deleteAccountPublic(email, password);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete Account Error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.verifyRecoveryCode = async (req, res) => {
  try {
    const { email, recoveryCode, newPassword } = req.body;
    await authService.verifyRecoveryCode(email, recoveryCode, newPassword, "web");

    res
      .status(200)
      .json({ message: "Account recovered successfully. You can now log in." });
  } catch (error) {
    console.error("Verify Recovery Code Error:", error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Server error" });
  }
};

exports.resendRecoveryCode = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.resendRecoveryCode(email);

    res.status(200).json({
      message: "Recovery code has been resent successfully.",
      attemptsUsed: result.attemptsUsed,
      attemptsLeft: result.attemptsLeft,
    });
  } catch (error) {
    console.error("Resend Recovery Code Error:", error);
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || "Server error",
      attemptsLeft: error.attemptsLeft,
    });
  }
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

exports.getNotification = async (req, res) => {
  const user_id = req.user._id;
  const email = req.user.email;

  try {
    const Notification = require("../../models/Notification");
    const notifications = await Notification.find({
      $or: [{ userId: user_id }, { email: email }],
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      notificationsCount: notifications.length,
      notifications: notifications,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.markNotificationsAsRead = async (req, res) => {
  const userId = req.user._id;
  const email = req.user.email;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No notification IDs provided." });
  }

  try {
    const Notification = require("../../models/Notification");
    await Notification.updateMany(
      {
        _id: { $in: ids },
        $or: [{ userId: userId }, { email: email }],
      },
      { $set: { read: true } }
    );

    res
      .status(200)
      .json({ success: true, message: "Notifications marked as read." });
  } catch (err) {
    console.error("Error updating notifications:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// User data (orders, payments, dashboard, reviews)
// ---------------------------------------------------------------------------

exports.review = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await userService.getUserReviews(userId);

    if (result.products.length === 0) {
      return res.json({
        success: true,
        message: "No orders found for this user",
        products: [],
      });
    }

    res.json({
      success: true,
      products: result.products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.addReview = async (req, res) => {
  try {
    const {
      name,
      description,
      title,
      product_id,
      quality_rating,
      value_rating,
      price_rating,
    } = req.body;

    const user_id = req.user._id;

    let imagePath = "";
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, "/");
      imagePath = `${BACKEND_URL}/${filePath}`;
    }

    const result = await userService.addReview(
      user_id,
      {
        productId: product_id,
        name,
        description,
        title,
        qualityRating: quality_rating,
        valueRating: value_rating,
        priceRating: price_rating,
      },
      imagePath
    );

    res.json({
      message: result.message,
      reviews: result.reviews,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.orders = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await userService.getUserOrders(userId);

    return res.status(200).json({
      success: true,
      orders: result.orders,
      total_orders: result.total_orders,
      shipped_orders: result.shipped_orders,
      delivered_orders: result.delivered_orders,
      canceled_orders: result.canceled_orders,
    });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred while fetching orders.",
    });
  }
};

exports.order = async (req, res) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;
    const result = await userService.getOrder(userId, orderId);

    return res.status(200).json({
      success: true,
      orders: result.orders,
    });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred while fetching orders.",
    });
  }
};

exports.paymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await userService.getPaymentHistory(userId);

    return res.status(200).json({
      success: true,
      history: result.history,
    });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred while fetching payment history.",
    });
  }
};

exports.singlePaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;
    const result = await userService.getSinglePaymentHistory(userId, orderId);

    return res.status(200).json({
      success: true,
      history: result.history,
    });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred while fetching payment history.",
    });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await userService.getDashboard(userId);

    return res.status(200).json({
      success: true,
      recent_orders: result.recent_orders,
      total_spent: result.total_spent,
      total_orders: result.total_orders,
      active_orders: result.active_orders,
      wishlist_item: result.wishlist_item,
    });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred while fetching payment history.",
    });
  }
};

exports.currentMonthOrderCategories = async (req, res) => {
  try {
    const result = await userService.getCurrentMonthOrderCategories();

    return res.status(200).json({
      success: true,
      data: result.data,
      message: result.message,
    });
  } catch (error) {
    console.error("Error fetching current month order categories:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching current month order categories",
      error: error.message,
    });
  }
};
