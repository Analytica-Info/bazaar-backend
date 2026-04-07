const bcrypt = require("bcryptjs");
const { OAuth2Client } = require('google-auth-library');
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const JWT_SECRET = require("../../config/jwtSecret");
const User = require("../../models/User");
const Coupon = require("../../models/Coupon");
const Review = require("../../models/Review");
const Notification = require("../../models/Notification");
const Wishlist = require("../../models/Wishlist");
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require("../../models/Order");
const OrderDetail = require("../../models/OrderDetail");
const { verifyEmailWithVeriEmail } = require("../../helpers/verifyEmail");
const JWT_REFRESH_SECRET = require("../../config/refreshJwtSecret");
const { isValidPassword } = require("../../helpers/validator");
const { sendEmail } = require("../../mail/emailService");
const mongoose = require("mongoose");
const BACKEND_URL = process.env.BACKEND_URL;
const WEB_URL = process.env.URL;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const axios = require("axios");

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character",
      });
    }

    // const emailCheck = await verifyEmailWithVeriEmail(email);

    // if (!emailCheck || emailCheck.status !== "success" || !emailCheck.deliverable) {
    //     return res.status(400).json({ message: "Invalid or unverifiable email address" });
    // }

    // if (emailCheck.disposable) {
    //     return res.status(400).json({ message: "Disposable/temporary emails are not allowed" });
    // }

    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.isDeleted) {
      const recoveryCode = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      existingUser.recoveryCode = recoveryCode;
      existingUser.recoveryCodeExpires = Date.now() + 15 * 60 * 1000;
      await existingUser.save();

      sendRecoveryEmail(existingUser.email, recoveryCode);

      return res.status(403).json({
        existingUser : true,
        message:
          "An account with this email was previously deleted. We have sent a recovery code to this email. Kindly verify it to recover your account.",
      });
    }

    if (existingUser && !existingUser.isDeleted) {
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    if (existingUser && existingUser.isDeleted) {
      existingUser.name = name;
      existingUser.phone = phone;
      existingUser.password = hashedPassword;
      existingUser.isDeleted = false;
      existingUser.deletedAt = null;
      existingUser.authProvider = "local";
      existingUser.platform = "Website";

      await existingUser.save();

      return res.status(200).json({ message: "Account restored successfully" });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      authProvider: "local",
      platform: "Website",
    });

    sendWelcomeEmail(email);

    return res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, fcmToken, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (user.isDeleted) {
      const message = user.deletedBy === 'admin' 
        ? "Your account has been deleted by an administrator. Please contact support for assistance."
        : "Your account has been deleted. Please register again.";
      
      return res.status(403).json({
        message: message,
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support for assistance.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Set expiry times based on rememberMe
    const jwtExpiry = rememberMe ? "30d" : "7d";
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: jwtExpiry,
    });

    // Update FCM token if provided
    if (fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const domain = process.env.DOMAIN;

    res.cookie("user_token", token, {
      domain: isProduction ? domain : undefined,
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: cookieMaxAge,
    });

    return res.status(200).json({
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// exports.googleLogin = async (req, res) => {
//   try {
//     const { tokenId } = req.body;
//     const userAgent = req.headers["user-agent"] || "";
    
//     // Determine which Google Client ID to use
//     let GoogleId = process.env.GOOGLE_CLIENT_ID; // Default for web
    
//     if (userAgent.toLowerCase().includes("android")) {
//       GoogleId = process.env.ANDROID_GOOGLE_CLIENT_ID;
//     } else if (userAgent.toLowerCase().includes("iphone") || userAgent.toLowerCase().includes("ipad")) {
//       GoogleId = process.env.IOS_GOOGLE_CLIENT_ID;
//     }

//     // Validate tokenId format
//     if (
//       !tokenId ||
//       typeof tokenId !== "string" ||
//       tokenId.split(".").length !== 3
//     ) {
//       return res.status(400).json({ message: "Invalid tokenId format" });
//     }

//     // Verify Google token
//     let ticket;
//     try {
//       ticket = await client.verifyIdToken({
//         idToken: tokenId,
//         audience: GoogleId,
//       });
//     } catch (verifyError) {
//       console.error("Token verification failed:", verifyError);
//       return res
//         .status(401)
//         .json({ message: "Invalid or expired Google token" });
//     }

//     const payload = ticket.getPayload();
//     const { email, given_name, family_name, picture } = payload;

//     // Validate email exists
//     if (!email) {
//       return res.status(400).json({ message: "Email not provided by Google" });
//     }

//     let user = await User.findOne({ email });

//     // Check if user exists but is deleted
//     if (user && user.isDeleted) {
//       return res.status(403).json({
//         message: "Your account has been deleted. Please register again.",
//       });
//     }

//     if (!user) {
//       // Create new user
//       user = await User.create({
//         email,
//         name: given_name || "User",
//         avatar: picture,
//         authProvider: "google",
//       });
//     } else {
//       // Update existing user - reset delete status if they're logging back in
//       user.isDeleted = false;
//       user.deletedAt = null;
//       user.recoveryCode = null;
//       user.recoveryCodeExpires = null;
//       user.avatar = picture;  
//       await user.save();
//     }

//     // Generate tokens
//     const token = jwt.sign({ id: user._id }, JWT_SECRET, {
//       expiresIn: "1h",
//     });

//     const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
//       expiresIn: "7d",
//     });

//     // Save refresh token
//     user.refreshToken = refreshToken;
//     await user.save();

//     // Check for coupons
//     let state = false;
//     const phone = user.phone;
//     let dataCoupon = [];
    
//     if (phone) {
//       const couponData = await Coupon.findOne({ phone });
//       if (couponData) {
//         state = true;
//         dataCoupon = couponData;
//       }
//     }

//     // Set cookie with same configuration as normal login
//     const isProduction = process.env.NODE_ENV === 'production';
//     const domain = process.env.DOMAIN;

//     res.cookie("user_token", token, {
//       domain: isProduction ? domain : undefined,
//       path: "/",
//       httpOnly: true,
//       secure: isProduction,
//       sameSite: "lax",
//       maxAge: 3600000, // 1 hour
//     });

//   return res.status(200).json({
//   message: "Login successful",
//   refreshToken: refreshToken,
// });
//   } catch (error) {
//     console.error("Unhandled Error in googleLogin:", error);
//     return res.status(500).json({
//       message: "Server error during Google login",
//     });
//   }
// };

exports.googleLogin = async (req, res) => {
  try {
    const { tokenId, rememberMe } = req.body;
    const userAgent = req.headers["user-agent"] || "";
    
    // Determine which Google Client ID to use
    let GoogleId = process.env.GOOGLE_CLIENT_ID;
    
    if (userAgent.toLowerCase().includes("android")) {
      GoogleId = process.env.ANDROID_GOOGLE_CLIENT_ID;
    } else if (userAgent.toLowerCase().includes("iphone") || userAgent.toLowerCase().includes("ipad")) {
      GoogleId = process.env.IOS_GOOGLE_CLIENT_ID;
    }

    // Validate tokenId format
    if (
      !tokenId ||
      typeof tokenId !== "string" ||
      tokenId.split(".").length !== 3
    ) {
      return res.status(400).json({ message: "Invalid tokenId format" });
    }

    // Verify Google token
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: tokenId,
        audience: GoogleId,
      });
    } catch (verifyError) {
      console.error("Token verification failed:", verifyError);
      return res
        .status(401)
        .json({ message: "Invalid or expired Google token" });
    }

    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture } = payload;

    // Validate email exists
    if (!email) {
      return res.status(400).json({ message: "Email not provided by Google" });
    }

    let user = await User.findOne({ email });

    // Check if user exists but is deleted
    if (user && user.isDeleted) {
      const message = user.deletedBy === 'admin' 
        ? "Your account has been deleted by an administrator. Please contact support for assistance."
        : "Your account has been deleted. Please register again.";
      
      return res.status(403).json({
        message: message,
      });
    }

    if (user && user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support for assistance.",
      });
    }

    // Set expiry times based on rememberMe (same as regular login)
    const jwtExpiry = rememberMe ? "30d" : "7d";
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    // Generate tokens first
    let token, refreshToken;

    if (!user) {
      // Create new user WITHOUT triggering address validation
      user = new User({
        email,
        name: given_name || "User",
        avatar: picture,
        authProvider: "google",
        address: [], // Explicitly set empty array
        platform: "Website",
      });

      // Generate tokens with same expiry as regular login
      token = jwt.sign({ id: user._id }, JWT_SECRET, {
        expiresIn: jwtExpiry,
      });

      refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
        expiresIn: "7d",
      });

      // Set refresh token
      user.refreshToken = refreshToken;

      // Save ONCE with validateBeforeSave: false to skip address validation
      await user.save({ validateBeforeSave: false });
    } else {
      // Update existing user
      user.isDeleted = false;
      user.deletedAt = null;
      user.recoveryCode = null;
      user.recoveryCodeExpires = null;
      user.avatar = picture;

      // Generate tokens with same expiry as regular login
      token = jwt.sign({ id: user._id }, JWT_SECRET, {
        expiresIn: jwtExpiry,
      });

      refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
        expiresIn: "7d",
      });

      // Set refresh token
      user.refreshToken = refreshToken;
      
      // Save ONCE without validation
      await user.save({ validateBeforeSave: false });
    }

    // Check for coupons
    let state = false;
    const phone = user.phone;
    let dataCoupon = [];
    
    if (phone) {
      const couponData = await Coupon.findOne({ phone });
      if (couponData) {
        state = true;
        dataCoupon = couponData;
      }
    }

    // Set cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const domain = process.env.DOMAIN;

    res.cookie("user_token", token, {
      domain: isProduction ? domain : undefined,
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: cookieMaxAge,
    });

    return res.status(200).json({
      message: "Login successful",
      refreshToken: refreshToken,
    });
    
  } catch (error) {
    console.error("Unhandled Error in googleLogin:", error);
    return res.status(500).json({
      message: "Server error during Google login",
    });
  }
};

exports.appleLogin = async (req, res) => {
  try {
    /**
     * Supports two scenarios:
     * 1) Direct POST from Apple JS (web flow) with form_post:
     *    - code (authorization code)
     *    - state
     *    - user (JSON string) ONLY on first sign-in
     *
     * 2) Custom clients (mobile / dashboard) posting JSON body:
     *    - authorizationCode
     *    - idToken
     *    - email / firstName / lastName (optional)
     */

    let { code, state, user, authorizationCode, idToken, email, firstName, lastName, rememberMe } = req.body;

    // Normalize fields
    const authCode = authorizationCode || code || null;

    // If we already have a valid idToken from client, prefer using that
    let identityToken = idToken || null;

    if (!identityToken) {
      // No idToken passed from client – exchange authorization code with Apple
      if (!authCode || typeof authCode !== "string") {
        return res
          .status(400)
          .json({ message: "Authorization code is required for Apple login" });
      }

      try {
        const tokenResponse = await exchangeCodeWithApple(authCode);
        identityToken = tokenResponse.id_token;
      } catch (exchangeError) {
        console.error("Error exchanging code with Apple:", exchangeError);
        return res
          .status(401)
          .json({ message: "Failed to exchange authorization code with Apple" });
      }
    }

    // Validate identity token
    if (!identityToken || typeof identityToken !== "string") {
      return res.status(400).json({ message: "Invalid identity token" });
    }

    // Decode the Apple identity token (JWT)
    let decoded;
    try {
      decoded = jwt.decode(identityToken, { complete: true });
      if (!decoded || !decoded.payload) {
        return res.status(400).json({ message: "Invalid identity token payload" });
      }
    } catch (decodeError) {
      console.error("Token decode failed:", decodeError);
      return res
        .status(401)
        .json({ message: "Invalid or malformed Apple identity token" });
    }

    const payload = decoded.payload;

    // Verify issuer
    if (payload.iss !== "https://appleid.apple.com") {
      return res.status(401).json({ message: "Invalid token issuer" });
    }

    // Verify audience (client ID)
    const appleClientId = process.env.APPLE_CLIENT_ID;
    if (appleClientId && payload.aud !== appleClientId) {
      return res.status(401).json({ message: "Invalid token audience" });
    }

    // Extract Apple user identifier
    const appleUserId = payload.sub;

    // Email may be present in the id_token (first sign-in)
    if (!email) {
      email = payload.email || null;
    }

    // If user object is provided (web flow, first sign-in), extract name / email
    if (user) {
      try {
        const userInfo = typeof user === "string" ? JSON.parse(user) : user;

        if (!email && userInfo.email) {
          email = userInfo.email;
        }

        if (!firstName && userInfo.name?.firstName) {
          firstName = userInfo.name.firstName;
        }
        if (!lastName && userInfo.name?.lastName) {
          lastName = userInfo.name.lastName;
        }
      } catch (e) {
        // ignore parse errors, we'll just rely on payload values
        console.error("Failed to parse Apple user object:", e);
      }
    }

    // Find existing user: prefer email, fall back to appleId
    let existingUser = null;
    if (email) {
      existingUser = await User.findOne({ email });
    }
    if (!existingUser && appleUserId) {
      existingUser = await User.findOne({ appleId: appleUserId });
    }

    // Check if user exists but is deleted
    if (existingUser && existingUser.isDeleted) {
      const message = existingUser.deletedBy === 'admin' 
        ? "Your account has been deleted by an administrator. Please contact support for assistance."
        : "Your account has been deleted. Please register again.";
      
      return res.status(403).json({
        message: message,
      });
    }

    if (existingUser && existingUser.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support for assistance.",
      });
    }

    const jwtExpiry = rememberMe ? "30d" : "7d";
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    // Generate tokens
    let token, refreshToken;

    if (!existingUser) {
      // Create new user
      const userName =
        (firstName && lastName
          ? `${firstName} ${lastName}`.trim()
          : firstName || lastName) || "User";

      existingUser = new User({
        email: email || null,
        name: userName,
        appleId: appleUserId,
        authProvider: "apple",
        address: [],
        platform: "Website",
      });

      token = jwt.sign({ id: existingUser._id }, JWT_SECRET, {
        expiresIn: jwtExpiry,
      });

      refreshToken = jwt.sign({ id: existingUser._id }, JWT_REFRESH_SECRET, {
        expiresIn: "7d",
      });

      existingUser.refreshToken = refreshToken;
      await existingUser.save({ validateBeforeSave: false });
    } else {
      // Update existing user
      existingUser.isDeleted = false;
      existingUser.deletedAt = null;
      existingUser.recoveryCode = null;
      existingUser.recoveryCodeExpires = null;

      if (!existingUser.appleId && appleUserId) {
        existingUser.appleId = appleUserId;
      }

      if (email && !existingUser.email) {
        existingUser.email = email;
      }

      if (firstName || lastName) {
        const userName =
          (firstName && lastName
            ? `${firstName} ${lastName}`.trim()
            : firstName || lastName) || existingUser.name || "User";
        existingUser.name = userName;
      }

      token = jwt.sign({ id: existingUser._id }, JWT_SECRET, {
        expiresIn: jwtExpiry,
      });

      refreshToken = jwt.sign({ id: existingUser._id }, JWT_REFRESH_SECRET, {
        expiresIn: "7d",
      });

      existingUser.refreshToken = refreshToken;
      await existingUser.save({ validateBeforeSave: false });
    }

    // Optional: coupon lookup (kept for compatibility with other flows)
    let couponState = false;
    const phone = existingUser.phone;
    let dataCoupon = [];

    if (phone) {
      const couponData = await Coupon.findOne({ phone });
      if (couponData) {
        couponState = true;
        dataCoupon = couponData;
      }
    }

    // Set cookie (same style as normal login / google login)
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

    const responseData = {
      message: "Login successful",
      refreshToken,
      coupon: {
        status: couponState,
        data: dataCoupon,
      },
    };

    // Redirect to frontend success URL (similar to Stripe)
    // Use environment variable APPLE_SUCCESS_URL or default to WEB_URL/success
    const successUrl = process.env.APPLE_SUCCESS_URL || `${WEB_URL}/success` || "http://localhost:5173/success";
    
    // Redirect with success status (similar to Stripe success_url)
    return res.redirect(`${successUrl}?apple_login=success`);
  } catch (error) {
    console.error("Unhandled Error in appleLogin:", error);
    
    // Redirect to frontend failure URL (similar to Stripe cancel_url)
    const failureUrl = process.env.APPLE_FAILURE_URL || `${WEB_URL}/failed` || "http://localhost:5173/failed";
    return res.redirect(`${failureUrl}?apple_login=error&message=${encodeURIComponent(error.message || "Server error during Apple login")}`);
  }
};

exports.appleCallback = async (req, res) => {
  const { code, state, user } = req.body;
  console.log('appleCallback', code, user);
  const tokenResponse = await exchangeCodeWithApple(code);
  const identityToken = tokenResponse.id_token;
  const decoded = jwt.decode(identityToken);
  const appleUserId = decoded.sub;
  let email = user?.email;
  let name = `${user?.name?.firstName} ${user?.name?.lastName}`;

  if (!email) {
    const existing = await User.findOne({ appleId: appleUserId });
    email = existing.email;
    name = `${existing.firstName} ${existing.lastName}`;

  } else {

    await User.create({
      appleId: appleUserId,
      email,
      name,
    });

  }

  return res.redirect(

    `${WEB_URL}/callback?identityToken=${identityToken}&email=${email}&firstName=${firstName}&lastName=${lastName}`

  );

};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isDeleted) {
      return res
        .status(403)
        .json({
          message: "Your account has been deleted. Please register again.",
        });
    }

    if (
      (user.provider && user.provider !== "local") ||
      (user.authProvider && user.authProvider !== "local")
    ) {
      return res
        .status(400)
        .json({
          message: "Password reset is not available for social login accounts.",
        });
    }

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const token = jwt.sign({ code: verificationCode }, JWT_SECRET, {
      expiresIn: "10m",
    });

    sendforgotPasswordEmail(email, verificationCode);

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    res.status(200).json({ message: "Verification code sent to email" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: "Code expired or invalid" });
    }

    const decoded = jwt.verify(user.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
      return res.status(400).json({ message: "Invalid code" });
    }

    res.status(200).json({ message: "Code verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

    let user = await User.findById(decoded.id);
    const email = user.email;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isValidPassword(new_password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character",
      });
    }

    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    const isSame = await bcrypt.compare(new_password, user.password);
    if (isSame) {
      return res
        .status(400)
        .json({
          message: "New password must be different from the old password",
        });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password = hashedPassword;

    await user.save();

    sendPasswordUpdateEmail(email);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isValidPassword(new_password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character",
      });
    }

    if (!user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: "Code expired or invalid" });
    }

    const decoded = jwt.verify(user.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
      return res.status(400).json({ message: "Invalid code" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    sendresetPasswordEmail(email);

    await Notification.create({
      email,
      title: "Password Reset",
      message: "Your Password Reset Successfully",
    });

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.userUpdate = async (req, res) => {
  try {
    const { name, email, phone, username } = req.body;
    const user_id = req.user._id;
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }
    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingUser = await User.findOne({ phone, _id: { $ne: user_id } });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Phone already exists in another user" });
    }

    const phoneInCoupon = await Coupon.findOne({ phone });
    if (phoneInCoupon) {
      return res
        .status(400)
        .json({ message: "Phone already exists in another user" });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (username) user.username = username;
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, "/");
      user.avatar = `${BACKEND_URL}/${filePath}`;
    }

    await user.save();

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isDeleted)
      return res.status(400).json({ message: "Account already deleted" });

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = 'user';
    await user.save();

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete Account Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteAccountPublic = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Invalid email or password" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "Account already deleted" });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support for assistance.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "This account was created with social login. Please contact support to delete your account.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = 'user';
    await user.save();

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete Account Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyRecoveryCode = async (req, res) => {
  try {
    const { email, recoveryCode, newPassword } = req.body;

    if (!email || !recoveryCode || !newPassword) {
      return res
        .status(400)
        .json({
          message: "Email, recovery code, and new password are required.",
        });
    }

    const user = await User.findOne({ email });

    if (!user || !user.isDeleted) {
      return res
        .status(400)
        .json({ message: "No deleted account found with this email." });
    }

    if (user.recoveryCode !== recoveryCode) {
      return res.status(400).json({ message: "Invalid recovery code." });
    }

    if (Date.now() > user.recoveryCodeExpires) {
      return res
        .status(400)
        .json({
          message: "Recovery code has expired. Please request a new one.",
        });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.isDeleted = false;
    user.deletedAt = null;
    user.deletedBy = null;
    user.recoveryCode = null;
    user.recoveryCodeExpires = null;
    await user.save();

    res
      .status(200)
      .json({ message: "Account recovered successfully. You can now log in." });
  } catch (error) {
    console.error("Verify Recovery Code Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.resendRecoveryCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email });

    if (!user || !user.isDeleted) {
      return res
        .status(400)
        .json({ message: "No deleted account found with this email." });
    }

    const now = new Date();

    if (
      user.lastRecoveryRequest &&
      now - user.lastRecoveryRequest > 24 * 60 * 60 * 1000
    ) {
      user.recoveryAttempts = 0;
    }

    if (user.recoveryAttempts >= 5) {
      return res.status(429).json({
        message:
          "You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.",
        attemptsLeft: 0,
      });
    }

    const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.recoveryCode = recoveryCode;
    user.recoveryCodeExpires = Date.now() + 15 * 60 * 1000;
    user.recoveryAttempts += 1;
    user.lastRecoveryRequest = now;

    await user.save();

    sendRecoveryEmail(user.email, recoveryCode);

    res.status(200).json({
      message: "Recovery code has been resent successfully.",
      attemptsUsed: user.recoveryAttempts,
      attemptsLeft: 5 - user.recoveryAttempts,
    });
  } catch (error) {
    console.error("Resend Recovery Code Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getNotification = async (req, res) => {
  const user_id = req.user._id;
  const email = req.user.email;

  try {
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

exports.review = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orders = await Order.find({
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    });

    
    if (orders.length === 0) {
      return res.json({
        success: true,
        message: "No orders found for this user",
        products: []
      });
    }

    const orderIds = orders.map(order => order._id);
    const orderDetails = await OrderDetail.find({
      order_id: { $in: orderIds }
    });

    const productIds = orderDetails.map(detail => detail.product_id);

    const productObjectIds = productIds.map(id => new mongoose.Types.ObjectId(id));

    const products = await Product.find({
      _id: { $in: productObjectIds }
    });

    const userReviews = await Review.find({
      user_id: userId,
      product_id: { $in: productObjectIds }
    });

    const userReviewsByProduct = {};
    userReviews.forEach(review => {
      userReviewsByProduct[review.product_id.toString()] = review;
    });

    const orderDetailsByProduct = {};
    orderDetails.forEach(detail => {
      if (!orderDetailsByProduct[detail.product_id]) {
        orderDetailsByProduct[detail.product_id] = [];
      }
      orderDetailsByProduct[detail.product_id].push(detail);
    });

    const productsWithReviews = products.map(product => {
      const productId = product._id.toString();
      const userReview = userReviewsByProduct[productId] || null;
      const productOrderDetails = orderDetailsByProduct[productId] || [];
      
      // Get the first order for this product (assuming one order per product)
      const firstOrderDetail = productOrderDetails[0];
      const order = firstOrderDetail ? orders.find(order => order._id.toString() === firstOrderDetail.order_id.toString()) : null;
      const orderDetails = order ? {
        _id: order._id,
        order_id: order.order_id,
        order_no: order.order_no,
        order_datetime: order.order_datetime,
        name: order.name,
        phone: order.phone,
        state: order.state,
        address: order.address,
        email: order.email,
        status: order.status,
        amount_subtotal: order.amount_subtotal,
        amount_total: order.amount_total,
        discount_amount: order.discount_amount,
        shipping: order.shipping,
        txn_id: order.txn_id,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        checkout_session_id: order.checkout_session_id,
        orderTracks: order.orderTracks,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      } : null;

      return {
        ...product.toObject(),
        user_review: userReview,
        order_details: orderDetails
      };
    });

    res.json({
      success: true,
      products: productsWithReviews
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.orders = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orders = await Order.find({
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    });
    const updatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          order_id: new mongoose.Types.ObjectId(order._id),
        }).exec();

        // Get all product_ids from order details
        const productIds = orderDetails
          .map(detail => detail.product_id)
          .filter(id => id) // Filter out null/undefined
          .map(id => new mongoose.Types.ObjectId(id));

        // Fetch products in bulk
        const products = await Product.find({
          _id: { $in: productIds }
        }).exec();

        // Create a map of product_id -> sku
        const productSkuMap = {};
        products.forEach(product => {
          const productId = product._id.toString();
          // Extract SKU from product.product.sku_number
          const sku = product.product?.sku_number || null;
          productSkuMap[productId] = sku;
        });

        // Add SKU to each order detail
        const orderDetailsWithSku = orderDetails.map(detail => {
          const productId = detail.product_id?.toString();
          const sku = productSkuMap[productId] || null;
          return {
            ...detail.toObject(),
            sku: sku
          };
        });

        return {
          ...order.toObject(),
          order_details: orderDetailsWithSku || [],
        };
      })
    );

    const total_orders = updatedOrders.length;
    const shipped_orders = updatedOrders.filter(
      (order) => order.status.toLowerCase() === "shipped"
    ).length;
    const delivered_orders = updatedOrders.filter(
      (order) => order.status.toLowerCase() === "delivered"
    ).length;
    const canceled_orders = updatedOrders.filter(
      (order) => order.status.toLowerCase() === "canceled"
    ).length;

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found.",
      });
    }

    return res.status(200).json({
    success: true,
      orders: updatedOrders,
      total_orders,
      shipped_orders,
      delivered_orders,
      canceled_orders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching orders.",
    });
  }
};

exports.order = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orderId = req.params.id;
    const orders = await Order.find({
      _id: orderId,
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    });
    const updatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          order_id: new mongoose.Types.ObjectId(order._id),
        }).exec();

        return {
          ...order.toObject(),
          order_details: orderDetails || [],
        };
      })
    );

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found.",
      });
    }

    return res.status(200).json({
      success: true,
      orders: updatedOrders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching orders.",
    });
  }
};

exports.paymentHistory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orders = await Order.find({
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    });
    const updatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          order_id: new mongoose.Types.ObjectId(order._id),
        }).exec();

        // Get all product_ids from order details
        const productIds = orderDetails
          .map(detail => detail.product_id)
          .filter(id => id) // Filter out null/undefined
          .map(id => new mongoose.Types.ObjectId(id));

        // Fetch products in bulk
        const products = await Product.find({
          _id: { $in: productIds }
        }).exec();

        // Create a map of product_id -> sku
        const productSkuMap = {};
        products.forEach(product => {
          const productId = product._id.toString();
          // Extract SKU from product.product.sku_number
          const sku = product.product?.sku_number || null;
          productSkuMap[productId] = sku;
        });

        // Add SKU to each order detail
        const orderDetailsWithSku = orderDetails.map(detail => {
          const productId = detail.product_id?.toString();
          const sku = productSkuMap[productId] || null;
          return {
            ...detail.toObject(),
            sku: sku
          };
        });

        return {
          ...order.toObject(),
          order_details: orderDetailsWithSku || [],
        };
      })
    );

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment history found.",
      });
    }

    return res.status(200).json({
      success: true,
      history: updatedOrders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching payment history.",
    });
  }
};

exports.singlePaymentHistory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orderId = req.params.id;
    const orders = await Order.find({
      _id: orderId,
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    });
    const updatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          order_id: new mongoose.Types.ObjectId(order._id),
        }).exec();

        return {
          ...order.toObject(),
          order_details: orderDetails || [],
        };
      })
    );

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment history found.",
      });
    }

    return res.status(200).json({
      success: true,
      history: updatedOrders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching payment history.",
    });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const orders = await Order.find({
      $or: [
        { userId: userId },
        { user_id: userId }
      ]
    }).sort({ createdAt: -1 });

    const updatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderDetails = await OrderDetail.find({
          order_id: new mongoose.Types.ObjectId(order._id),
        }).exec();

        // Get all product_ids from order details
        const productIds = orderDetails
          .map(detail => detail.product_id)
          .filter(id => id) // Filter out null/undefined
          .map(id => new mongoose.Types.ObjectId(id));

        // Fetch products in bulk
        const products = await Product.find({
          _id: { $in: productIds }
        }).exec();

        // Create a map of product_id -> sku
        const productSkuMap = {};
        products.forEach(product => {
          const productId = product._id.toString();
          // Extract SKU from product.product.sku_number
          const sku = product.product?.sku_number || null;
          productSkuMap[productId] = sku;
        });

        // Add SKU to each order detail
        const orderDetailsWithSku = orderDetails.map(detail => {
          const productId = detail.product_id?.toString();
          const sku = productSkuMap[productId] || null;
          return {
            ...detail.toObject(),
            sku: sku
          };
        });

        return {
          ...order.toObject(),
          order_details: orderDetailsWithSku || [],
        };
      })
    );

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment history found.",
      });
    }

    const total_orders = updatedOrders.length;
    const total_spent = updatedOrders.reduce(
      (sum, order) => sum + parseFloat(order.amount_total || 0),
      0
    );
    const formatted_total_spent = Number(total_spent.toFixed(2));
    const active_orders = updatedOrders.filter(
      (order) => order.status.toLowerCase() !== "delivered"
    ).length;

    const wishlist = await Wishlist.findOne({ user: userId });
    const wishlist_item = wishlist ? wishlist.items.length : 0;

    return res.status(200).json({
      success: true,
      recent_orders: updatedOrders,
      total_spent: formatted_total_spent,
      total_orders,
      active_orders,
      wishlist_item,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching payment history.",
    });
  }
};

const sendRecoveryEmail = async (email, code) => {
  const logoUrl = "https://www.bazaar-uae.com/logo.png";
  const subject = "Account Recovery Code – Verify to Reactivate Your Account";
  const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 15px; margin-bottom:5px;">
                                                        <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                                            Your Recovery code is <strong>${code}</strong>
                                                        </strong>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>   
                </body>`;

  sendEmail(email, subject, html);
};

const sendWelcomeEmail = async (email) => {
  const logoUrl = "https://www.bazaar-uae.com/logo.png";
  const subject = `Welcome to Bazaar`;
  const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>Thank you for signing up with <strong>Bazaar</strong></p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>   
                </body>`;

  await sendEmail(email, subject, html);
};

exports.currentMonthOrderCategories = async (req, res) => {
    try {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        const orders = await Order.find({
            createdAt: {
                $gte: currentMonthStart,
                $lte: currentMonthEnd
            }
        }).exec();

        // console.log('orders', orders.length);
        
        if (orders.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'No orders found for current month'
            });
        }
        
        const orderIds = orders.map(order => order._id);
        
        const orderDetails = await OrderDetail.find({
            order_id: { $in: orderIds }
        }).exec();
        
        const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];

        const products = await Product.find({
          _id: { $in: productIds }
        });
        
        const productCategoryMap = {};
        products.forEach(product => {
            if (product.product && product.product.id && product.product.product_type_id) {
                productCategoryMap[product._id] = product.product.product_type_id;
            }
        });
        
        // const categories = await Category.findOne().exec();
        const categories = await Category.find();
        const categoryMap = {};
        
        if (categories && categories[0] && categories[0].search_categoriesList) {
            categories[0].search_categoriesList.forEach(category => {
                categoryMap[category.id] = category.name;
            });
        }
        
        const categoryCount = {};
        
        orderDetails.forEach(detail => {
            const categoryId = productCategoryMap[detail.product_id];
            if (categoryId && categoryMap[categoryId]) {
                const categoryName = categoryMap[categoryId];
                if (categoryCount[categoryName]) {
                    categoryCount[categoryName] += detail.quantity;
                } else {
                    categoryCount[categoryName] = detail.quantity;
                }
            }
        });
        
        const data = Object.entries(categoryCount)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        
        return res.status(200).json({
            success: true,
            data: data,
            message: 'Current month order categories retrieved successfully'
        });
        
    } catch (error) {
        console.error('Error fetching current month order categories:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching current month order categories',
            error: error.message
        });
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

        let file = '';
        if (req.file) {
          const filePath = req.file.path.replace(/\\/g, "/");
          file = `${BACKEND_URL}/${filePath}`;
        }

        const existingReview = await Review.findOne({ user_id, product_id });

        if (existingReview) {
            existingReview.nickname = name;
            existingReview.summary = description;
            existingReview.texttext = title;
            existingReview.quality_rating = quality_rating;
            existingReview.value_rating = value_rating;
            existingReview.price_rating = price_rating;
            if (file) existingReview.image = file;

            await existingReview.save();
        } else {
            await Review.create({
                user_id,
                nickname: name,
                summary: description,
                texttext: title,
                image: file,
                product_id,
                quality_rating,
                value_rating,
                price_rating,
            });
        }

        const reviews = await Review.find();
        const mappedReviews = reviews.map(r => ({
            ...r._doc,
            name: r.nickname,
            description: r.summary,
            title: r.texttext,
        }));

        res.json({
            message: existingReview
                ? "Review updated successfully"
                : "Review created successfully",
            reviews: mappedReviews,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const sendforgotPasswordEmail = async (email, verificationCode) => {
  const logoUrl = "https://www.bazaar-uae.com/logo.png";
  const subject = "Password Reset Verification Code";
  const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                        <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                            style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                            <tr>
                                <td>
                                    <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                        align="center" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="height:40px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:center;">
                                                <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                    <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                                </a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:20px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:0 15px; margin-bottom:5px;">
                                                            <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                                                Your verification code is <strong>${verificationCode}</strong>
                                                            </strong>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:20px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:center;">
                                                <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:80px;">&nbsp;</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>   
                    </body>`;

  await sendEmail(email, subject, html);
};

const sendresetPasswordEmail = async (email) => {
  const logoUrl = "https://www.bazaar-uae.com/logo.png";
  const subject = `Your Password Has Been Reset Successfully`;
  const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>We wanted to let you know that your password was successfully reset.</p>
                                                        <p>If you did not perform this action, please contact our support team immediately.</p>
                                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>   
                </body>`;

  await sendEmail(email, subject, html);
};

const sendPasswordUpdateEmail = async (email) => {
  const logoUrl = "https://www.bazaar-uae.com/logo.png";
  const subject = `Your password was successfully updated`;
  const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>We wanted to let you know that your password was successfully updated.</p>
                                                        <p>If this wasn't you, please secure your account by resetting your password or contacting our support team.</p>
                                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>   
                </body>`;

  await sendEmail(email, subject, html);
};

async function exchangeCodeWithApple(code) {

  const clientId = process.env.APPLE_CLIENT_ID;              // Service ID
  const teamId = process.env.APPLE_TEAM_ID;                  // From Apple Dev
  const keyId = process.env.APPLE_KEY_ID;                    // From .p8 key (e.g., S7YBH689G3)

  const keyPath = process.env.APPLE_KEY_PATH || 
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

  return response.data; // contains id_token, access_token, refresh_token

}