const authService = require("../../services/authService");
const userService = require("../../services/userService");
const User = require('../../models/User');
const CouponMobile = require("../../models/Coupons");
const CouponsCount = require("../../models/CouponsCount");
const jwt = require('jsonwebtoken');
const JWT_SECRET = require("../../config/jwtSecret");
const { sendEmail } = require('../../mail/emailService');
const axios = require('axios');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;
const API_KEY = process.env.API_KEY;

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
        const deviceInfo = {
            'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
            'user-agent': req.headers['user-agent'] || null,
            'x-forwarded-for': req.headers['x-forwarded-for'] || null,
            'x-fcm-token': fcmToken || null,
        };

        const result = await authService.appleLogin({
            idToken,
            name,
            fcmToken,
            deviceInfo,
            platform: 'mobile',
        });

        return res.status(200).json({
            token: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            data: result.user,
            coupon: result.coupon,
            totalOrderCount: result.totalOrderCount,
            usedFirst15Coupon: result.usedFirst15Coupon,
        });

    } catch (error) {
        console.error('Apple login error:', error);
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || 'Apple login failed' });
    }
};

exports.googleLogin = async (req, res) => {
    try {
        const { tokenId, accessToken, fcmToken } = req.body;
        const userAgent = req.headers['user-agent'] || '';
        const deviceInfo = {
            'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
            'user-agent': userAgent,
            'x-forwarded-for': req.headers['x-forwarded-for'] || null,
            'x-fcm-token': fcmToken || null,
        };

        const result = await authService.googleLogin({
            tokenId,
            accessToken,
            fcmToken,
            deviceInfo,
            platform: 'mobile',
            userAgent,
        });

        return res.status(200).json({
            token: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            data: result.user,
            coupon: result.coupon,
            totalOrderCount: result.totalOrderCount,
            usedFirst15Coupon: result.usedFirst15Coupon,
        });
    } catch (error) {
        console.error('Unhandled Error in googleLogin:', error);
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        const result = await authService.register({
            name,
            email,
            phone,
            password,
            platform: 'mobile',
        });

        if (result.restored) {
            return res.status(200).json({ message: 'Account restored successfully' });
        }

        return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Register Error:', error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error', existingUser: error.existingUser });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, fcmToken } = req.body;
        const deviceInfo = {
            'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
            'user-agent': req.headers['user-agent'] || null,
            'x-forwarded-for': req.headers['x-forwarded-for'] || null,
            'x-fcm-token': fcmToken || null,
        };

        const result = await authService.loginWithCredentials({
            email,
            password,
            fcmToken,
            deviceInfo,
            platform: 'mobile',
        });

        return res.status(200).json({
            token: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            fcmToken: result.fcmToken,
            data: result.user,
            coupon: result.coupon,
            totalOrderCount: result.totalOrderCount,
            usedFirst15Coupon: result.usedFirst15Coupon,
        });
    } catch (error) {
        console.error('Login Error:', error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.getUserData = async (req, res) => {
    try {
        const result = await authService.getUserData(req.user._id, 'mobile');

        return res.status(200).json({
            data: result.data,
            coupon: result.coupon,
            totalOrderCount: result.totalOrderCount,
            usedFirst15Coupon: result.usedFirst15Coupon,
        });
    } catch (error) {
        console.error('Get User Data Error:', error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        await authService.forgotPassword(email);

        res.status(200).json({ message: 'Verification code sent to email' });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.verifyCode = async (req, res) => {
    try {
        const { email, code } = req.body;
        await authService.verifyCode(email, code);

        res.status(200).json({ message: 'Code verified successfully' });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, code, new_password } = req.body;
        await authService.resetPassword(email, code, new_password, 'mobile');

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
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
        const userId = decoded.id;

        await authService.updatePassword(userId, old_password, new_password);
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error("Error updating password:", error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || "Server error" });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const result = await authService.refreshToken(token);

        return res.status(200).json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    } catch (error) {
        console.error('Refresh Token Error:', error.message);
        return res.status(403).json({ message: error.message || 'Invalid or expired refresh token' });
    }
};

exports.checkAccessToken = async (req, res) => {
    const accessToken = req.header("Authorization")?.replace("Bearer ", "");
    const refreshToken = req.header("Authorization-Refresh")?.replace("Bearer ", "");

    if (!accessToken) {
        return res.status(401).json({ message: "Access token missing" });
    }

    try {
        const result = await authService.checkAccessToken(accessToken, refreshToken);

        return res.status(200).json(result);
    } catch (error) {
        const status = error.status || 401;
        return res.status(status).json({ message: error.message || "Invalid access token" });
    }
};

exports.userUpdate = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const user_id = req.user._id;
        const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, "/")}` : undefined;

        const result = await authService.updateProfile(user_id, { name, email, phone }, filePath);

        res.status(200).json({ message: 'User updated successfully', user: result.user });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
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
        const couponCount = await CouponMobile.countDocuments();
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

        const existingUser = await CouponMobile.findOne({ phone, user_id: { $ne: user_id } });
        if (existingUser) {
            return res.status(400).json({ message: "Phone already exists" });
        }

        const lastCoupon = await CouponMobile.findOne().sort({ id: -1 }).exec();
        const nextId = lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1;

        const couponCode = await generateCouponCode();

        const discount = 10;
        const validFrom = new Date();
        const validUntil = new Date(validFrom);
        validUntil.setMonth(validFrom.getMonth() + 1);

        const newCoupon = new CouponMobile({
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

const generateCouponCode = async () => {
    try {
        let nextNumber = 1;
        const coupons = await CouponMobile.find();

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
        const coupon = await CouponMobile.findOne({
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
        await authService.deleteAccount(userId, 'mobile');

        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete Account Error:', error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.verifyRecoveryCode = async (req, res) => {
    try {
        const { email, recoveryCode, newPassword } = req.body;
        await authService.verifyRecoveryCode(email, recoveryCode, newPassword, 'mobile');

        res.status(200).json({ message: 'Account recovered successfully. You can now log in.' });
    } catch (error) {
        console.error('Verify Recovery Code Error:', error);
        const status = error.status || 500;
        res.status(status).json({ message: error.message || 'Server error' });
    }
};

exports.resendRecoveryCode = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService.resendRecoveryCode(email);

        res.status(200).json({
            message: 'Recovery code has been resent successfully.',
            attemptsUsed: result.attemptsUsed,
            attemptsLeft: result.attemptsLeft,
        });
    } catch (error) {
        console.error('Resend Recovery Code Error:', error);
        const status = error.status || 500;
        res.status(status).json({
            message: error.message || 'Server error',
            attemptsLeft: error.attemptsLeft,
        });
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const userCreatedAt = req.user.createdAt;
        const result = await userService.getMobilePaymentHistory(userId, userCreatedAt);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message,
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
