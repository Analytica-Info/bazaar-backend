const User = require('../../models/User');
const Order = require('../../models/Order');
const OrderDetail = require('../../models/OrderDetail');
const Coupon = require("../../models/Coupons");
const CouponsCount = require("../../models/CouponsCount");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isValidPassword } = require('../../helpers/validator');
const { verifyEmailWithVeriEmail } = require('../../helpers/verifyEmail');
const { OAuth2Client } = require('google-auth-library');
const JWT_SECRET = require("../../config/jwtSecret");
const JWT_REFRESH_SECRET = require("../../config/refreshJwtSecret");
const { sendEmail } = require('../../mail/emailService');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const appleSignin = require('apple-signin-auth');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;
const API_KEY = process.env.API_KEY;
const axios = require('axios');

const getDeviceInfo = (req) => {
    const deviceId = req.header('x-device-id') || req.body?.deviceId || null;
    const userAgent = req.headers['user-agent'] || null;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || null;
    const fcmToken = req.body?.fcmToken || null;
    return { deviceId, userAgent, ip, fcmToken };
};

const upsertSession = (user, { deviceId, userAgent, ip, fcmToken }, refreshToken) => {
    const stableDeviceId = deviceId || `${userAgent || 'unknown'}:${(Math.random() + 1).toString(36).slice(2)}`;
    if (!Array.isArray(user.sessions)) user.sessions = [];
    let session = user.sessions.find(s => s.deviceId === stableDeviceId);
    if (session) {
        session.refreshToken = refreshToken;
        session.userAgent = userAgent;
        session.ip = ip;
        session.lastUsed = new Date();
        session.revokedAt = null;
        if (fcmToken) session.fcmToken = fcmToken;
    } else {
        user.sessions.push({
            deviceId: stableDeviceId,
            refreshToken,
            fcmToken: fcmToken || null,
            userAgent,
            ip,
            createdAt: new Date(),
            lastUsed: new Date(),
            revokedAt: null
        });
        const MAX_SESSIONS = 10;
        if (user.sessions.length > MAX_SESSIONS) {
            user.sessions.sort((a, b) => new Date(a.lastUsed) - new Date(b.lastUsed));
            user.sessions = user.sessions.slice(-MAX_SESSIONS);
        }
    }
    return stableDeviceId;
};

exports.appleCallback = async (req, res) => {
    try {
        const user_id = req.user._id;

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ customerId: user.customerId || null });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.appleLogin = async (req, res) => {
    try {
        const { idToken, name, fcmToken } = req.body; 
        
        if (!idToken) {
            return res.status(400).json({ message: 'Missing Apple identity token' });
        }

        const appleResponse = await appleSignin.verifyIdToken(idToken, {
            audience: process.env.APPLE_CLIENT_ID,
            ignoreExpiration: true
        });

        const { email, sub } = appleResponse;
        let user = await User.findOne({ appleId: sub });

        if (user && user.isDeleted && user.deletedBy === 'admin') {
            const message = "Your account has been deleted by an administrator. Please contact support for assistance.";
            
            return res.status(403).json({
                message: message,
            });
        }

        if (user && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked. Please contact support for assistance.",
            });
        }

        if (!user) {
            user = await User.create({
                email,
                name: name || "Apple User",
                authProvider: 'apple',
                appleId: sub,
                fcmToken,
                platform: 'Mobile app',
            });
        } else {
            user.fcmToken = fcmToken;
            user.isDeleted = false;
            user.deletedAt = null;
            user.recoveryCode = null;
            user.recoveryCodeExpires = null;
            await user.save();
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
            expiresIn: '7d',
        });

        const deviceInfo = getDeviceInfo(req);
        upsertSession(user, deviceInfo, refreshToken);
        await user.save();

        let state = false;
        const phone = user.phone;
        let dataCoupon = [];
        const couponData = await Coupon.findOne({ phone });
        if (couponData) {
            state = true;
            dataCoupon = couponData;
        }

        const totalOrderCount = await Order.countDocuments({ user_id: user._id });

        return res.status(200).json({
            token,
            refreshToken,
            data: {
                name: user.name,
                email: user.email,
                avatar: user.avatar || '',
                phone: user.phone,
                role: user.role,
                provider: user.authProvider,
            },
            coupon: {
                data: dataCoupon,
                status: state,
            },
            totalOrderCount,
            usedFirst15Coupon: user.usedFirst15Coupon || false,
        });

    } catch (error) {
        console.error('Apple login error:', error);
        return res.status(500).json({ message: 'Apple login failed' });
    }
};

exports.googleLogin = async (req, res) => {
    try {
        const { tokenId, accessToken, fcmToken } = req.body;
        const platform = req.headers['user-agent'];
        let GoogleId = process.env.GOOGLE_CLIENT_ID;
        if(platform == 'android') {
            GoogleId = process.env.ANDROID_GOOGLE_CLIENT_ID;
        } else if(platform == 'ios') {
            GoogleId = process.env.IOS_GOOGLE_CLIENT_ID; 
        } 
    
        let email, given_name, family_name, picture;

        if (accessToken) {
            try {
                const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });
                
                email = response.data.email;
                given_name = response.data.given_name;
                family_name = response.data.family_name;
                picture = response.data.picture;
            } catch (error) {
                console.error('Error fetching user info with accessToken:', error);
                return res.status(401).json({ message: 'Invalid or expired Google access token' });
            }
        }
        else if (tokenId) {
            if (typeof tokenId !== 'string' || tokenId.split('.').length !== 3) {
                return res.status(400).json({ message: 'Invalid tokenId format' });
            }
        
            let ticket;
            try {
                ticket = await client.verifyIdToken({
                    idToken: tokenId,
                    audience: GoogleId,
                });
            } catch (verifyError) {
                return res.status(401).json({ message: 'Invalid or expired Google token' });
            }
        
            const payload = ticket.getPayload();
            email = payload.email;
            given_name = payload.given_name;
            family_name = payload.family_name;
            picture = payload.picture;
        } else {
            return res.status(400).json({ message: 'Either tokenId or accessToken is required' });
        }
    
        let user = await User.findOne({ email });

        if (user && user.isDeleted && user.deletedBy === 'admin') {
            const message = "Your account has been deleted by an administrator. Please contact support for assistance.";
            
            return res.status(403).json({
                message: message,
            });
        }

        if (user && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked. Please contact support for assistance.",
            });
        }
    
        if (!user) {
            user = await User.create({
                email,
                name: given_name,
                avatar: picture,
                authProvider: 'google',
                fcmToken,
                platform: 'Mobile app',
            });
        } else {
            user.fcmToken = fcmToken;
            user.isDeleted = false;
            user.deletedAt = null;
            user.recoveryCode = null;
            user.recoveryCodeExpires = null;
            await user.save();
        }
    
        const token = jwt.sign({ id: user._id }, JWT_SECRET, {
            expiresIn: '1h',
        });

        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
            expiresIn: '7d',
        });

        const deviceInfo = getDeviceInfo(req);
        upsertSession(user, deviceInfo, refreshToken);
        await user.save();

        let state = false;
        const phone = user.phone;
        let dataCoupon = [];
        const couponData = await Coupon.findOne({ phone });
        if (couponData) {
            state = true;
            dataCoupon = couponData;
        }
    
        const totalOrderCount = await Order.countDocuments({ user_id: user._id });

        return res.status(200).json({
            token,
            refreshToken,
            data: {
                name: user.name,
                email: user.email,
                avatar: user.avatar || '',
                phone: user.phone,
                role: user.role,
                provider: user.authProvider,
            },
            coupon: {
                data: dataCoupon,
                status: state,
            },
            totalOrderCount,
            usedFirst15Coupon: user.usedFirst15Coupon || false,
        });
    } catch (error) {
        console.error('Unhandled Error in googleLogin:', error);
        return res.status(500).json({
            message: 'Server error',
        });
    }
};

exports.register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
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

        const existingPhoneUser = await User.findOne({ phone });
        if (existingPhoneUser) {
            return res.status(400).json({ message: 'Phone already exists with another user' });
        }

        const existingPhoneCoupon = await Coupon.findOne({ phone });
        if (existingPhoneCoupon) {
            return res.status(400).json({ message: 'Phone already exists in coupons' });
        }

        if (existingUser && existingUser.isDeleted) {
            const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString(); 
            existingUser.recoveryCode = recoveryCode;
            existingUser.recoveryCodeExpires = Date.now() + 15 * 60 * 1000;
            await existingUser.save();

            sendRecoveryEmail(existingUser.email, recoveryCode);

            return res.status(403).json({
                message: 'An account with this email was previously deleted. We have sent a recovery code to this email. Kindly verify it to recover your account.',
            });
        }

        if (existingUser && !existingUser.isDeleted) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        if (existingUser && existingUser.isDeleted) {
            existingUser.name = name;
            existingUser.phone = phone;
            existingUser.password = hashedPassword;
            existingUser.isDeleted = false;
            existingUser.deletedAt = null;
            existingUser.authProvider = 'local';
            existingUser.platform = 'Mobile app';

            await existingUser.save();

            return res.status(200).json({ message: 'Account restored successfully' });
        }

        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            authProvider: 'local',
            platform: 'Mobile app',
        });

        sendWelcomeEmail(email);

        return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, fcmToken } = req.body;

        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid email' });

        if (user.isDeleted) {
            const message =
                user.deletedBy === 'admin'
                    ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
                    : 'Your account has been deleted. Please register again.';

            return res.status(403).json({ message });
        }

        if (user.isBlocked) {
            return res.status(403).json({
                message: 'Your account has been blocked. Please contact support for assistance.',
            });
        }

        if (!user.password && (user.authProvider === 'google' || user.authProvider === 'apple')) {
            const providerName = user.authProvider === 'google' ? 'Google' : 'Apple';
            return res.status(400).json({ 
                message: `This account was created using ${providerName} sign-in. Please use ${providerName} to login.` 
            });
        }

        if (!user.password) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, {
            expiresIn: '1h',
        });

        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
            expiresIn: '7d',
        });

        const deviceInfo = getDeviceInfo(req);
        if(fcmToken){
            user.fcmToken = fcmToken;
        }
        upsertSession(user, deviceInfo, refreshToken);
        await user.save();

        let state = false;
        const phone = user.phone;
        let dataCoupon = [];
        const couponData = await Coupon.findOne({ phone });
        if (couponData) {
            state = true;
            dataCoupon = couponData;
        }

        const totalOrderCount = await Order.countDocuments({ user_id: user._id });

        return res.status(200).json({
            token,
            refreshToken,
            fcmToken: user.fcmToken,
            data: {
                name: user.name,
                email: user.email,
                avatar: user.avatar || '',
                role: user.role,
                phone: user.phone,
                provider: user.authProvider,
            },
            coupon: {
                data: dataCoupon,
                status: state,
            },
            totalOrderCount,
            usedFirst15Coupon: user.usedFirst15Coupon || false,
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getUserData = async (req, res) => {
    try {
        const user = req.user;

        if (user.isDeleted) {
            const message =
                user.deletedBy === 'admin'
                    ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
                    : 'Your account has been deleted. Please register again.';

            return res.status(403).json({ message });
        }

        if (user.isBlocked) {
            return res.status(403).json({
                message: 'Your account has been blocked. Please contact support for assistance.',
            });
        }

        let state = false;
        const phone = user.phone;
        let dataCoupon = [];
        const couponData = await Coupon.findOne({ phone });
        if (couponData) {
            state = true;
            dataCoupon = couponData;
        }

        const totalOrderCount = await Order.countDocuments({ user_id: user._id });

        return res.status(200).json({
            data: {
                name: user.name,
                email: user.email,
                avatar: user.avatar || '',
                role: user.role,
                phone: user.phone,
                provider: user.authProvider,
            },
            coupon: {
                data: dataCoupon,
                status: state,
            },
            totalOrderCount,
            usedFirst15Coupon: user.usedFirst15Coupon || false,
        });
    } catch (error) {
        console.error('Get User Data Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isDeleted) {
            return res.status(403).json({ message: 'Your account has been deleted. Please register again.' });
        }

        if ((user.provider && user.provider !== 'local') || 
            (user.authProvider && user.authProvider !== 'local')) {
            return res.status(400).json({ message: 'Password reset is not available for social login accounts.' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const token = jwt.sign({ code: verificationCode }, JWT_SECRET, { expiresIn: '10m' });

        sendforgotPasswordEmail(email, verificationCode);

        user.resetPasswordToken = token; 
        user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        res.status(200).json({ message: 'Verification code sent to email' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
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

exports.resetPassword = async (req, res) => {
    try {
        const { email, code, new_password } = req.body;
        if (!email || !code || !new_password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!isValidPassword(new_password)) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
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

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { old_password, new_password } = req.body;

        const token = req.header("Authorization")?.replace("Bearer ", "");
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
                message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
            });
        }

        // Ensure password is a string (handle case where it might be an object)
        const userPassword = typeof user.password === 'string' ? user.password : String(user.password || '');
        
        if (!userPassword) {
            return res.status(400).json({ message: "Invalid password format" });
        }

        const isMatch = await bcrypt.compare(old_password, userPassword);
        if (!isMatch) {
            return res.status(400).json({ message: "Old password is incorrect" });
        }

        const isSame = await bcrypt.compare(new_password, userPassword);
        if (isSame) {
            return res.status(400).json({ message: "New password must be different from the old password" });
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

exports.refreshToken = async (req, res) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

        const user = await User.findById(payload.id);
        if (!user || !Array.isArray(user.sessions)) {
            return res.status(403).json({ message: 'User not found or sessions missing' });
        }

        const sessionIndex = user.sessions.findIndex(s => s.refreshToken === token && !s.revokedAt);
        if (sessionIndex === -1) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }

        const newAccessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '2m',
        });

        const newRefreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
            expiresIn: '7d',
        });

        user.sessions[sessionIndex].refreshToken = newRefreshToken;
        user.sessions[sessionIndex].lastUsed = new Date();
        await user.save();

        return res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
        console.error('Refresh Token Error:', error.message);
        return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }
};

exports.checkAccessToken = async (req, res) => {
    const accessToken = req.header("Authorization")?.replace("Bearer ", "");
    const refreshToken = req.header("Authorization-Refresh")?.replace("Bearer ", "");

    console.log("🟢 Incoming Tokens:");
    console.log("Access Token:", accessToken || "❌ Missing");
    console.log("Refresh Token:", refreshToken || "❌ Missing");

    if (!accessToken) {
        console.log("❌ Access token missing");
        return res.status(401).json({ message: "Access token missing" });
    }

    try {
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        console.log("✅ Access token valid for user:", decoded.id);

        return res.status(200).json({
            valid: true,
            message: "Access token is valid",
            userId: decoded.id,
        });

    } catch (error) {
        console.log("⚠️ Access token error:", error.name, error.message);

        if (error.name === "TokenExpiredError") {
            console.log("⏰ Access token expired, checking refresh token...");

            if (!refreshToken) {
                console.log("❌ No refresh token provided");
                return res.status(401).json({ message: "Access token expired. Refresh token missing" });
            }

            try {
                const refreshDecoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
                console.log("✅ Refresh token decoded for user:", refreshDecoded.id);

                const user = await User.findById(refreshDecoded.id);
                if (!user || !Array.isArray(user.sessions)) {
                    console.log("❌ User not found or sessions missing for ID:", refreshDecoded.id);
                    return res.status(403).json({ message: "Invalid refresh token" });
                }

                const sessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshToken && !s.revokedAt);
                console.log("🧩 Session index found:", sessionIndex);

                if (sessionIndex === -1) {
                    console.log("❌ Refresh token mismatch. Expected one from DB:", user.sessions.map(s => s.refreshToken));
                    console.log("🚫 Got:", refreshToken);
                    return res.status(403).json({ message: "Invalid refresh token" });
                }

                const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
                const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

                console.log("🔄 Issuing new tokens...");
                console.log("New Access Token:", newAccessToken);
                console.log("New Refresh Token:", newRefreshToken);

                user.sessions[sessionIndex].refreshToken = newRefreshToken;
                user.sessions[sessionIndex].lastUsed = new Date();
                await user.save();

                return res.status(200).json({
                    valid: false,
                    message: "Access token expired. Issued new access token",
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                });

            } catch (refreshError) {
                console.log("❌ Refresh token verification failed:", refreshError.name, refreshError.message);
                console.log("🚫 Provided Refresh Token:", refreshToken);
                return res.status(403).json({ message: "Invalid or expired refresh token" });
            }
        }

        console.log("❌ Invalid access token:", accessToken);
        return res.status(401).json({ message: "Invalid access token" });
    }
};

exports.userUpdate = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const user_id = req.user._id;
        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        if (!phone) {
            return res.status(400).json({ message: 'Phone is required' });
        }

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (email !== user.email) {
            const existingEmailUser = await User.findOne({ email, _id: { $ne: user_id } });
            if (existingEmailUser) {
                return res.status(400).json({ message: 'Email already exists in another user' });
            }
        }

        if (phone !== user.phone) {
            const existingUser = await User.findOne({ phone, _id: { $ne: user_id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Phone already exists in another user' });
            }

            const phoneInCoupon = await Coupon.findOne({ phone, user_id: { $ne: user_id } });
            if (phoneInCoupon) {
                return res.status(400).json({ message: 'Phone already exists in another user' });
            }
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (req.file) {
            const filePath = req.file.path.replace(/\\/g, "/");
            user.avatar = `${FRONTEND_BASE_URL}/${filePath}`;
        }

        await user.save();

        res.status(200).json({ message: 'User updated successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.customerID = async (req, res) => {
    try {
        const { customerID } = req.body;
        const user_id = req.user._id;
        if (!customerID) {
            return res.status(400).json({ message: 'Customer ID is required' });
        }

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.customerId = customerID;

        await user.save();
        const cusId = user.customerId;

        res.status(200).json({ message: 'Customer ID created successfully', cusId });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getCustomerID = async (req, res) => {
    try {
        const user_id = req.user._id;

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ customerId: user.customerId || null });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.coupons = async (req, res) => {
    try {
        const couponCount = await Coupon.countDocuments();
        const newCouponCount = await CouponsCount.findOne();
        return res.status(200).json({
            success: true,
            count: couponCount,
            available_coupons: newCouponCount,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching coupon count.",
        });
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const user_id = req.user._id;
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name and phone are required.",
            });
        }

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (!user.phone) {
            return res.status(400).json({
                success: false,
                message: "First you must enter your phone number in your profile.",
            });
        }

        if (user.phone !== phone) {
            return res.status(400).json({
                success: false,
                message: "You provided the wrong phone number. Please provide the one saved in your profile.",
            });
        }

        const existingUser = await Coupon.findOne({ phone, user_id: { $ne: user_id } });
        if (existingUser) {
            return res.status(400).json({ message: "Phone already exists" });
        }

        const lastCoupon = await Coupon.findOne().sort({ id: -1 }).exec();
        const nextId = lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1;

        const couponCode = await generateCouponCode();

        const discount = 10;
        const validFrom = new Date();
        const validUntil = new Date(validFrom);
        validUntil.setMonth(validFrom.getMonth() + 1);

        const newCoupon = new Coupon({
            id: nextId,
            coupon: couponCode,
            name,
            phone,
            user_id,
            discount,
            validFrom,
            validUntil,
            isActive: true,
        });

        await newCoupon.save();

        const logoUrl = "https://www.bazaar-uae.com/logo.png";
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminSubject = "New Coupon Code Generated - Bazaar";
        const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                                        <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                                            <tr>
                                                <td>
                                                    <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                                        align="center" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="height:40px;">&nbsp;</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="text-align:center;">
                                                                <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
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
                                                                            <br>
                                                                            <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar Team,</b></h6>
                                                                            <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                                                We are pleased to inform you that we have generated a coupon code for a new customer and wish to provide you the details for your attention.
                                                                            </p>
                                                                            <br>
                                                                            <br>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone Number <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Coupon Code <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${couponCode}</p></p>
                                                                            <br>
                                                                            <br>
                                                                            <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Thank You,</b></h6>
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

        await sendEmail(adminEmail, adminSubject, adminHtml);

        return res.status(201).json({
            success: true,
            message: "Coupon created successfully.",
            coupon: newCoupon,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error creating coupon.",
        });
    }
};

async function createCoupon(name, phone) {
    try {
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name and phone are required.",
            });
        }

        const existingUser = await Coupon.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ message: "Phone already exists" });
        }

        const lastCoupon = await Coupon.findOne().sort({ id: -1 }).exec();
        const nextId = lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1;

        const couponCode = await generateCouponCode();

        const discount = 10;
        const validFrom = new Date();
        const validUntil = new Date(validFrom);
        validUntil.setMonth(validFrom.getMonth() + 1);

        const newCoupon = new Coupon({
            id: nextId,
            coupon: couponCode,
            name,
            phone,
            discount,
            validFrom,
            validUntil,
            isActive: true,
        });

        await newCoupon.save();

        const logoUrl = "https://www.bazaar-uae.com/logo.png";
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminSubject = "New Coupon Code Generated - Bazaar";
        const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                                        <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                                            <tr>
                                                <td>
                                                    <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                                        align="center" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="height:40px;">&nbsp;</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="text-align:center;">
                                                                <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
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
                                                                            <br>
                                                                            <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar Team,</b></h6>
                                                                            <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                                                We are pleased to inform you that we have generated a coupon code for a new customer and wish to provide you the details for your attention.
                                                                            </p>
                                                                            <br>
                                                                            <br>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone Number <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Coupon Code <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${couponCode}</p></p>
                                                                            <br>
                                                                            <br>
                                                                            <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Thank You,</b></h6>
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

        await sendEmail(adminEmail, adminSubject, adminHtml);

        // return res.status(201).json({
        //     success: true,
        //     message: "Coupon created successfully.",
        //     coupon: newCoupon,
        // });

        return newCoupon;
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error creating coupon.",
        });
    }
};

const generateCouponCode = async () => {
    try {
        let nextNumber = 1;
        const coupons = await Coupon.find();

        if (coupons && coupons.length > 0) {
            const lastCoupon = coupons[coupons.length - 1].coupon;

            const regex = /DH(\d+)YHZXB/;
            const matches = lastCoupon.match(regex);

            if (matches && matches[1]) {
                nextNumber = parseInt(matches[1], 10) + 1;
            }
        }

        const newCoupon = `DH${nextNumber}YHZXB`;
        return newCoupon;
    } catch (error) {
        console.error("Error generating the coupon code:", error);
        return "DH1YHZXB";
    }
};

exports.checkCouponCode = async (req, res) => {
    const { couponCode, phone } = req.body;

    if (!couponCode) {
        return res.status(400).json({ message: "Coupon code is required." });
    }

    if (couponCode === 'FIRST15') {
        let user = null;
        
        if (req.user && req.user._id) {
            user = await User.findById(req.user._id);
        } 
        else if (phone) {
            user = await User.findOne({ phone });
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found. Please provide phone or authenticate first.",
            });
        }

        if (user.usedFirst15Coupon) {
            return res.status(400).json({
                success: false,
                message: "FIRST15 coupon is already used.",
                usedFirst15Coupon: true,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Coupon code is valid. Please proceed with the payment.",
            usedFirst15Coupon: false,
        });
    }

    if (couponCode === 'UAE10') {
        const couponDetails = await fetchCouponDetails("1991824943058366464");

        if (!couponDetails) {
            return res.status(404).json({ message: "Coupon details not found." });
        }

        const { start_time, end_time, status } = couponDetails;

        const currentDubaiTime = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
        );

        const startTime = new Date(start_time);
        const endTime = new Date(end_time);

        if (status !== "active") {
            return res.status(400).json({
                success: false,
                message: "This promotion is not active.",
            });
        }

        if (currentDubaiTime < startTime) {
            return res.status(400).json({
                success: false,
                message: "Promotion has not started yet.",
            });
        }

        if (currentDubaiTime > endTime) {
            return res.status(400).json({
                success: false,
                message: "Promotion has expired.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Coupon code is valid. Please proceed with the payment.",
        });
    }

    try {
        const coupon = await Coupon.findOne({
            coupon: couponCode,
            status: "unused",
            phone: phone,
        });

        if (coupon) {
            return res.status(200).json({
                success: true,
                message: "Coupon code is valid. Please proceed with the payment.",
            });
        } else {
            return res.status(404).json({
                success: false,
                message: "Coupon code is not valid or has already been used or not associated with this mobile number.",
            });
        }
    } catch (error) {
        console.error("Error checking coupon code:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.isDeleted) return res.status(400).json({ message: 'Account already deleted' });

        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save();

        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete Account Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.verifyRecoveryCode = async (req, res) => {
    try {
        const { email, recoveryCode, newPassword } = req.body;

        if (!email || !recoveryCode || !newPassword) {
            return res.status(400).json({ message: 'Email, recovery code, and new password are required.' });
        }

        const user = await User.findOne({ email });

        if (!user || !user.isDeleted) {
            return res.status(400).json({ message: 'No deleted account found with this email.' });
        }

        if (user.recoveryCode !== recoveryCode) {
            return res.status(400).json({ message: 'Invalid recovery code.' });
        }

        if (Date.now() > user.recoveryCodeExpires) {
            return res.status(400).json({ message: 'Recovery code has expired. Please request a new one.' });
        }

        if (!isValidPassword(newPassword)) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.isDeleted = false;
        user.deletedAt = null;
        user.recoveryCode = null;
        user.recoveryCodeExpires = null;
        await user.save();

        res.status(200).json({ message: 'Account recovered successfully. You can now log in.' });
    } catch (error) {
        console.error('Verify Recovery Code Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const sendRecoveryEmail = async (email, code) => {

    const logoUrl = 'https://bazaar.linkeble.com/img/logo/logo.png';
    const subject = 'Account Recovery Code – Verify to Reactivate Your Account';
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

exports.resendRecoveryCode = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const user = await User.findOne({ email });

        if (!user || !user.isDeleted) {
            return res.status(400).json({ message: 'No deleted account found with this email.' });
        }

        const now = new Date();

        if (
            user.lastRecoveryRequest &&
            (now - user.lastRecoveryRequest) > 24 * 60 * 60 * 1000
        ) {
            user.recoveryAttempts = 0;
        }

        if (user.recoveryAttempts >= 5) {
            return res.status(429).json({
                message: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.',
                attemptsLeft: 0
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
            message: 'Recovery code has been resent successfully.',
            attemptsUsed: user.recoveryAttempts,
            attemptsLeft: 5 - user.recoveryAttempts
        });

    } catch (error) {
        console.error('Resend Recovery Code Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const sendWelcomeEmail = async (email) => {

    const logoUrl = 'https://bazaar.linkeble.com/img/logo/logo.png';
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

const sendforgotPasswordEmail = async (email, verificationCode) => {

    const logoUrl = 'https://bazaar.linkeble.com/img/logo/logo.png';
    const subject = 'Password Reset Verification Code';
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

    const logoUrl = 'https://bazaar.linkeble.com/img/logo/logo.png';
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

    const logoUrl = 'https://bazaar.linkeble.com/img/logo/logo.png';
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

exports.getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const allOrders = await Order.find({ user_id: userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('order_id order_no order_datetime amount_total status payment_status payment_method createdAt name email phone address state')
            .lean();

        const recentOrders = allOrders;

        const orderIds = recentOrders.map(order => order._id);
        const orderDetails = await OrderDetail.find({ order_id: { $in: orderIds } }).lean();

        const detailsMap = {};
        orderDetails.forEach(detail => {
            const key = detail.order_id.toString();
            if (!detailsMap[key]) detailsMap[key] = [];
            detailsMap[key].push(detail);
        });

        const successfulOrders = await Order.countDocuments({
            user_id: userId,
            payment_status: { 
                $nin: ['pending', 'failed', 'cancelled', 'refunded', 'expired'] 
            }
        });

        const registeredSince = req.user.createdAt;

        const mapPaymentMethod = (method) => {
            switch (method?.toLowerCase()) {
                case 'card':
                case 'stripe':
                    return 'card';
                case 'tabby':
                    return 'tabby';
                case 'cash':
                    return 'cash';
                default:
                    return 'card';
            }
        };

        const mapOrderStatus = (status) => {
            switch (status?.toLowerCase()) {
                case 'confirmed':
                    return 'newOne';
                case 'packed':
                    return 'packed';
                case 'on the way':
                    return 'shipped';
                case 'delivered':
                    return 'delivered';
                case 'cancelled':
                    return 'cancelled';
                default:
                    return 'newOne';
            }
        };

        const response = {
            payment: {
                order_history: recentOrders.map(order => {
                    const orderDetailsForOrder = detailsMap[order._id.toString()] || [];
                    
                    return {
                        purchasedAt: order.createdAt.toISOString(),
                        amount: order.amount_total,
                        paymentMethod: mapPaymentMethod(order.payment_method),
                        status: mapOrderStatus(order.status),
                        buyer: {
                            email: order.email,
                            phone: order.phone,
                            name: order.name
                        },
                        items: orderDetailsForOrder.map(item => ({
                            title: item.product_name,
                            quantity: item.quantity,
                            unitPrice: item.amount.toString(),
                            category: item.variant_name || 'General'
                        })),
                        shippingAddress: {
                            city: order.state || 'Unknown',
                            address: order.address,
                            zip: '00000'
                        }
                    };
                }),
                buyer_history: {
                    registered_since: registeredSince,
                    loyalty_level: successfulOrders
                }
            }
        };

        res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

const fetchCouponDetails = async (id) => {
    try {
        const response = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/promotions/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                    Accept: "application/json",
                },
            }
        );

        if (response?.data?.data) {
            return response.data.data;
        }

        console.error("Invalid promotion response format.");
        return null;

    } catch (error) {
        console.error(
            `Error fetching coupon details for ID: ${id} ->`,
            error.response?.data || error.message
        );
        return null;
    }
};