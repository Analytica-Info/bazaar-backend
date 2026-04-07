const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../../config/jwtSecret");
const Admin = require("../../models/Admin");
const User = require("../../models/User");
const Order = require('../../models/Order');
const OrderDetail = require('../../models/OrderDetail');
const Coupon = require('../../models/Coupon');
const Cart = require('../../models/Cart');
const Wishlist = require('../../models/Wishlist');
const Product = require('../../models/Product');
const ProductView = require('../../models/ProductView');
const Role = require('../../models/Role');
const ActivityLog = require('../../models/ActivityLog');
const BackendLog = require('../../models/BackendLog');
const mongoose = require('mongoose');
const { sendEmail } = require("../../mail/emailService");

function getUaeDateTime() {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year").value);
  const month = parseInt(parts.find(p => p.type === "month").value) - 1;
  const day = parseInt(parts.find(p => p.type === "day").value);
  const hour = parseInt(parts.find(p => p.type === "hour").value);
  const minute = parseInt(parts.find(p => p.type === "minute").value);
  const second = parseInt(parts.find(p => p.type === "second").value);
  const milliseconds = now.getMilliseconds();
  
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}+04:00`;
}

exports.orders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const orderIdSearch = req.query.orderId || '';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';
        const statusFilter = req.query.status || '';
        const paymentStatusFilter = req.query.paymentStatus || '';
        const paymentMethodFilter = req.query.paymentMethod || '';
        const platformFilter = req.query.platform || '';

        let query = {};

        if (orderIdSearch) {
            query.order_id = { $regex: orderIdSearch, $options: 'i' };
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                query.createdAt.$gte = from;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query.createdAt.$lte = to;
            }
        }

        if (statusFilter && statusFilter !== 'all') {
            query.status = { $regex: new RegExp(`^${statusFilter}$`, 'i') };
        }

        if (paymentStatusFilter && paymentStatusFilter !== 'all') {
            query.payment_status = { $regex: new RegExp(`^${paymentStatusFilter}$`, 'i') };
        }

        if (paymentMethodFilter && paymentMethodFilter !== 'all') {
            const pm = paymentMethodFilter.toLowerCase();
            if (pm === 'stripe') {
                query.payment_method = { $regex: /^(card|stripe)$/i };
            } else {
                query.payment_method = { $regex: new RegExp(`^${paymentMethodFilter}$`, 'i') };
            }
        }

        if (platformFilter && platformFilter !== 'all') {
            const pf = platformFilter.toLowerCase();
            if (pf === 'website') {
                query.orderfrom = { $regex: /^website$/i };
            } else if (pf === 'mobileapp' || pf === 'mobile app') {
                query.orderfrom = { $regex: /^(mobile\s*app|mobileapp)$/i };
            } else {
                query.orderfrom = { $regex: new RegExp(`^${platformFilter}$`, 'i') };
            }
        }

        const orders = await Order.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).exec();
        const totalCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);
        const updatedOrders = await Promise.all(orders.map(async (order) => {
            const orderDetails = await OrderDetail.find({
                order_id: new mongoose.Types.ObjectId(order._id)
            }).exec();

            const productIds = orderDetails
                .map(detail => detail.product_id)
                .filter(id => id)
                .map(id => new mongoose.Types.ObjectId(id));

            const products = await Product.find({
                _id: { $in: productIds }
            }).exec();

            const productSkuMap = {};
            products.forEach(product => {
                const productId = product._id.toString();
                const sku = product.product?.sku_number || null;
                productSkuMap[productId] = sku;
            });

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
                order_details: orderDetailsWithSku || [] 
            };
        }));

        if (updatedOrders.length === 0) {
            return res.status(200).json({
                success: true,
                orders: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalOrders: totalCount,
                    ordersPerPage: limit,
                }
            });
        }

        return res.status(200).json({
            success: true,
            orders: updatedOrders,
            pagination: {
                currentPage: page,
                totalPages,
                totalOrders: totalCount,
                ordersPerPage: limit,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching orders.',
        });
    }
};

exports.coupons = async (req, res) => {
    try {
        console.log('API - Coupons');
        const coupons = await Coupon.find();
        if (coupons.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No coupons found.',
            });
        }

        console.log('Return - API - Coupons');
        return res.status(200).json({
            success: true,
            coupons: coupons,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching coupons.',
        });
    }
};

exports.adminRegister = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password } = req.body;
        if (!firstName) {
            return res.status(400).json({ message: "first Name is required" });
        }
        if (!lastName) {
            return res.status(400).json({ message: "Last Name is required" });
        }
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!phone) {
            return res.status(400).json({ message: "phone is required" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }
        const existingAdmin = await Admin.findOne({ email: email });
    
        if (existingAdmin) {
            return res.status(400).json({ message: "Admin already exists" });
        }
    
        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = new Admin({
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            password: hashedPassword,
            role: 'admin',
        });
  
        await admin.save();
        res.status(201).json({ message: "Admin registered successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
};
  
exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }
    
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(400).json({ message: "Invalid Email" });
        }
    
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
    
        const adminWithRole = await Admin.findById(admin._id)
            .populate({
                path: 'role',
                populate: {
                    path: 'permissions',
                    model: 'Permission',
                    select: 'name slug module action'
                }
            })
            .select('-password -resetPasswordToken -resetPasswordExpires');

        const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({
            token,
            data: {
                name: `${admin.firstName} ${admin.lastName}`,
                email: admin.email,
                role: adminWithRole.role,
            },
        });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
};
  
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        console.log(email)
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const token = jwt.sign({ code: verificationCode }, JWT_SECRET, { expiresIn: '10m' });
        const logoUrl = 'https://www.bazaar-uae.com/logo.png';

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

        admin.resetPasswordToken = token; 
        admin.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
        await admin.save();

        res.status(200).json({ message: 'Verification code sent to email' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.verifyCode = async (req, res) => {
    try {
        const { email, code } = req.body;
        const admin = await Admin.findOne({ email });
    
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }
    
        if (!admin.resetPasswordToken || admin.resetPasswordExpires < Date.now()) {
            return res.status(400).json({ message: "Code expired or invalid" });
        }
    
        const decoded = jwt.verify(admin.resetPasswordToken, JWT_SECRET);
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
        const { email, code, newPassword } = req.body;
        const admin = await Admin.findOne({ email });
    
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }
    
        if (!admin.resetPasswordToken || admin.resetPasswordExpires < Date.now()) {
            return res.status(400).json({ message: "Code expired or invalid" });
        }
    
        const decoded = jwt.verify(admin.resetPasswordToken, JWT_SECRET);
        if (decoded.code !== code) {
            return res.status(400).json({ message: "Invalid code" });
        }
    
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        admin.password = hashedPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;
        await admin.save();
    
        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
  
exports.updatePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
    
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
    
        const admin = await Admin.findById(decoded.id);

        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }
    
        const isMatch = await bcrypt.compare(oldPassword, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Old password is incorrect" });
        }
    
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        admin.password = hashedPassword;
        await admin.save();
    
        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: "Status is required" });
        }

        const statusSequence = [
            "Confirmed",
            "Packed",
            "Out For Delivery",
            "Delivered",
            "Refunded"
        ];

        if (!statusSequence.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed statuses are: ${statusSequence.join(", ")}`
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        let imagePath = null;
        if (req.file) {
            imagePath = req.file.path.replace(/\\/g, "/");
            imagePath = `${process.env.BACKEND_URL}/${imagePath}`;
        }

        const newStatusIndex = statusSequence.indexOf(status);
        const filteredTracks = order.orderTracks.filter(track => {
            const trackStatusIndex = statusSequence.indexOf(track.status);
            return trackStatusIndex < newStatusIndex;
        });

        filteredTracks.push({
            status,
            dateTime: getUaeDateTime(),
            image: imagePath
        });

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                status: status,
                orderTracks: filteredTracks
            },
            {
                new: true,
                runValidators: false
            }
        );

        res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order: updatedOrder
        });

    } catch (error) {
        console.error("Update Order Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';
        const statusFilter = req.query.status || '';
        const platformFilter = req.query.platform || '';
        const authProviderFilter = req.query.authProvider || '';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';

        let query = {};

        if (searchQuery) {
            query.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } },
                { phone: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'active') {
                query.isDeleted = false;
                query.isBlocked = false;
            } else if (statusFilter === 'blocked') {
                query.isDeleted = false;
                query.isBlocked = true;
            } else if (statusFilter === 'deleted') {
                query.isDeleted = true;
            }
        }

        if (platformFilter && platformFilter !== 'all') {
            const pf = platformFilter.toLowerCase();
            if (pf === 'web') {
                query.platform = { $regex: /^(web|website)$/i };
            } else {
                query.platform = { $regex: new RegExp(`^${platformFilter}$`, 'i') };
            }
        }

        if (authProviderFilter && authProviderFilter !== 'all') {
            query.authProvider = { $regex: new RegExp(`^${authProviderFilter}$`, 'i') };
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                query.createdAt.$gte = from;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query.createdAt.$lte = to;
            }
        }

        const users = await User.find(query)
            .select('-password -resetPasswordToken -resetPasswordExpires -refreshToken -recoveryCode -recoveryCodeExpires')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .exec();

        const totalCount = await User.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);

        const usersWithOrders = await Promise.all(
            users.map(async (user) => {
                const userId = new mongoose.Types.ObjectId(user._id);
                
                const orders = await Order.find({ userId: userId })
                    .sort({ createdAt: -1 })
                    .exec();

                const ordersWithDetails = await Promise.all(
                    orders.map(async (order) => {
                        const orderDetails = await OrderDetail.find({
                            order_id: new mongoose.Types.ObjectId(order._id)
                        }).exec();

                        const productIds = orderDetails
                            .map(detail => detail.product_id)
                            .filter(id => id)
                            .map(id => new mongoose.Types.ObjectId(id));

                        const products = await Product.find({
                            _id: { $in: productIds }
                        }).exec();

                        const productSkuMap = {};
                        products.forEach(product => {
                            const productId = product._id.toString();
                            const sku = product.product?.sku_number || null;
                            productSkuMap[productId] = sku;
                        });

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
                            order_details: orderDetailsWithSku || []
                        };
                    })
                );

                const userObj = user.toObject();
                const platformFromOrder = ordersWithDetails?.[0]?.orderfrom;
                const displayPlatform = userObj.platform || platformFromOrder || null;
                return {
                    ...userObj,
                    platform: displayPlatform,
                    orders: ordersWithDetails,
                    totalOrders: ordersWithDetails.length
                };
            })
        );

        if (usersWithOrders.length === 0) {
            return res.status(200).json({
                success: true,
                users: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalUsers: totalCount,
                    usersPerPage: limit,
                }
            });
        }

        return res.status(200).json({
            success: true,
            users: usersWithOrders,
            pagination: {
                currentPage: page,
                totalPages,
                totalUsers: totalCount,
                usersPerPage: limit,
            },
        });
    } catch (error) {
        console.error("Get All Users Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching users.',
            error: error.message
        });
    }
};

exports.exportUsers = async (req, res) => {
    try {
        const searchQuery = req.query.search || "";
        const statusFilter = req.query.status || '';
        const platformFilter = req.query.platform || '';
        const authProviderFilter = req.query.authProvider || '';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';

        let query = {};

        if (searchQuery) {
            query.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } },
                { phone: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'active') {
                query.isDeleted = false;
                query.isBlocked = false;
            } else if (statusFilter === 'blocked') {
                query.isDeleted = false;
                query.isBlocked = true;
            } else if (statusFilter === 'deleted') {
                query.isDeleted = true;
            }
        }

        if (platformFilter && platformFilter !== 'all') {
            const pf = platformFilter.toLowerCase();
            if (pf === 'web') {
                query.platform = { $regex: /^(web|website)$/i };
            } else {
                query.platform = { $regex: new RegExp(`^${platformFilter}$`, 'i') };
            }
        }

        if (authProviderFilter && authProviderFilter !== 'all') {
            query.authProvider = { $regex: new RegExp(`^${authProviderFilter}$`, 'i') };
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                query.createdAt.$gte = from;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query.createdAt.$lte = to;
            }
        }

        const users = await User.find(query)
            .select('name phone email role authProvider platform isDeleted isBlocked createdAt')
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        return res.status(200).json({
            success: true,
            users: users
        });

    } catch (error) {
        console.error("Export Users Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while exporting users.',
            error: error.message
        });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId)
            .select('-password -resetPasswordToken -resetPasswordExpires -refreshToken -recoveryCode -recoveryCodeExpires')
            .exec();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        const userIdObj = new mongoose.Types.ObjectId(user._id);

        const orders = await Order.find({
            $or: [
                { user_id: userIdObj },
                { userId: userIdObj }
            ]
        })
            .sort({ createdAt: -1 })
            .exec();

        const ordersWithDetails = await Promise.all(
            orders.map(async (order) => {
                const orderDetails = await OrderDetail.find({
                    order_id: new mongoose.Types.ObjectId(order._id)
                }).exec();

                const productIds = orderDetails
                    .map(detail => detail.product_id)
                    .filter(id => id)
                    .map(id => new mongoose.Types.ObjectId(id));

                const products = await Product.find({
                    _id: { $in: productIds }
                }).exec();

                const productSkuMap = {};
                products.forEach(product => {
                    const productId = product._id.toString();
                    const sku = product.product?.sku_number || null;
                    productSkuMap[productId] = sku;
                });

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
                    order_details: orderDetailsWithSku || []
                };
            })
        );

        const cart = await Cart.findOne({ user: userId })
            .populate('items.product')
            .lean();

        const wishlist = await Wishlist.findOne({ user: userId })
            .populate('items')
            .lean();

        return res.status(200).json({
            success: true,
            user: {
                ...user.toObject(),
                cart: cart ? cart.items : [],
                wishlist: wishlist ? wishlist.items : [],
                orders: ordersWithDetails,
                totalOrders: ordersWithDetails.length
            }
        });

    } catch (error) {
        console.error("Get User By ID Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching user.',
            error: error.message
        });
    }
};

exports.blockUser = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (user.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Cannot block a deleted user. Please restore the user first.'
            });
        }

        if (user.isBlocked) {
            return res.status(400).json({
                success: false,
                message: 'User is already blocked.'
            });
        }

        user.isBlocked = true;
        user.blockedAt = new Date();
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'User blocked successfully.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isBlocked: user.isBlocked,
                blockedAt: user.blockedAt
            }
        });

    } catch (error) {
        console.error("Block User Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while blocking user.',
            error: error.message
        });
    }
};

exports.unblockUser = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (!user.isBlocked) {
            return res.status(400).json({
                success: false,
                message: 'User is not blocked.'
            });
        }

        user.isBlocked = false;
        user.blockedAt = null;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'User unblocked successfully.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isBlocked: user.isBlocked
            }
        });

    } catch (error) {
        console.error("Unblock User Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while unblocking user.',
            error: error.message
        });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (user.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'User is already deleted.'
            });
        }

        user.isDeleted = true;
        user.deletedAt = new Date();
        user.deletedBy = 'admin';
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'User deleted successfully.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isDeleted: user.isDeleted,
                deletedAt: user.deletedAt
            }
        });

    } catch (error) {
        console.error("Delete User Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting user.',
            error: error.message
        });
    }
};

exports.restoreUser = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (!user.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'User is not deleted.'
            });
        }

        user.isDeleted = false;
        user.deletedAt = null;
        user.deletedBy = null;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'User restored successfully.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isDeleted: user.isDeleted
            }
        });

    } catch (error) {
        console.error("Restore User Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while restoring user.',
            error: error.message
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, phone } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (user.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update a deleted user. Please restore the user first.'
            });
        }

        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists for another user.'
                });
            }
            user.email = email;
        }

        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'User updated successfully.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                isBlocked: user.isBlocked || false,
                isDeleted: user.isDeleted
            }
        });

    } catch (error) {
        console.error("Update User Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating user.',
            error: error.message
        });
    }
};

exports.getAllAdmins = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const admins = await Admin.find()
            .populate('role', 'name description')
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .exec();

        const totalCount = await Admin.countDocuments();
        const totalPages = Math.ceil(totalCount / limit);

        if (admins.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No admins found.',
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalAdmins: 0,
                    adminsPerPage: limit,
                }
            });
        }

        return res.status(200).json({
            success: true,
            admins: admins,
            pagination: {
                currentPage: page,
                totalPages,
                totalAdmins: totalCount,
                adminsPerPage: limit,
            },
        });
    } catch (error) {
        console.error("Get All Admins Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching admins.',
            error: error.message
        });
    }
};

exports.getCurrentAdmin = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user._id)
            .populate({
                path: 'role',
                populate: {
                    path: 'permissions',
                    model: 'Permission',
                    select: 'name slug module action'
                }
            })
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .exec();

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found.'
            });
        }

        return res.status(200).json({
            success: true,
            admin: admin
        });
    } catch (error) {
        console.error("Get Current Admin Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching admin.',
            error: error.message
        });
    }
};

exports.getAdminById = async (req, res) => {
    try {
        const { adminId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID format.'
            });
        }

        const admin = await Admin.findById(adminId)
            .populate({
                path: 'role',
                populate: {
                    path: 'permissions',
                    model: 'Permission',
                    select: 'name slug module action'
                }
            })
            .select('-password -resetPasswordToken -resetPasswordExpires')
            .exec();

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found.'
            });
        }

        return res.status(200).json({
            success: true,
            admin: admin
        });
    } catch (error) {
        console.error("Get Admin By ID Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching admin.',
            error: error.message
        });
    }
};

exports.createSubAdmin = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, roleId } = req.body;

        if (!firstName) {
            return res.status(400).json({ message: "First Name is required" });
        }
        if (!lastName) {
            return res.status(400).json({ message: "Last Name is required" });
        }
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!phone) {
            return res.status(400).json({ message: "Phone is required" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }
        if (!roleId) {
            return res.status(400).json({ message: "Role is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            return res.status(400).json({ message: "Invalid role ID" });
        }

        const role = await Role.findById(roleId);
        if (!role || !role.isActive) {
            return res.status(400).json({ message: "Invalid or inactive role" });
        }

        const existingAdmin = await Admin.findOne({ email: email });
        if (existingAdmin) {
            return res.status(400).json({ message: "Admin with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = new Admin({
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            password: hashedPassword,
            role: roleId,
        });

        await admin.save();

        const populatedAdmin = await Admin.findById(admin._id)
            .populate('role', 'name description')
            .select('-password -resetPasswordToken -resetPasswordExpires');

        res.status(201).json({
            success: true,
            message: "Admin created successfully",
            admin: populatedAdmin
        });
    } catch (error) {
        console.error("Create Sub-Admin Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateSubAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { firstName, lastName, email, phone, roleId, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID format.'
            });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found.'
            });
        }

        if (roleId) {
            if (!mongoose.Types.ObjectId.isValid(roleId)) {
                return res.status(400).json({ message: "Invalid role ID" });
            }
            const role = await Role.findById(roleId);
            if (!role || !role.isActive) {
                return res.status(400).json({ message: "Invalid or inactive role" });
            }
            admin.role = roleId;
        }

        if (email && email !== admin.email) {
            const existingAdmin = await Admin.findOne({ email, _id: { $ne: adminId } });
            if (existingAdmin) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists for another admin.'
                });
            }
            admin.email = email;
        }

        if (firstName !== undefined) admin.firstName = firstName;
        if (lastName !== undefined) admin.lastName = lastName;
        if (phone !== undefined) admin.phone = phone;
        if (isActive !== undefined) admin.isActive = isActive;

        admin.updatedAt = Date.now();
        await admin.save();

        const populatedAdmin = await Admin.findById(admin._id)
            .populate('role', 'name description')
            .select('-password -resetPasswordToken -resetPasswordExpires');

        return res.status(200).json({
            success: true,
            message: 'Admin updated successfully.',
            admin: populatedAdmin
        });
    } catch (error) {
        console.error("Update Sub-Admin Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating admin.',
            error: error.message
        });
    }
};

exports.deleteSubAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID format.'
            });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found.'
            });
        }

        admin.isActive = false;
        admin.updatedAt = Date.now();
        await admin.save();

        return res.status(200).json({
            success: true,
            message: 'Admin deleted successfully.'
        });
    } catch (error) {
        console.error("Delete Sub-Admin Error:", error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting admin.',
            error: error.message
        });
    }
};

// Get product analytics with views
exports.getProductAnalytics = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Aggregate product views grouped by product_id, sorted by total views
        const productViews = await ProductView.aggregate([
            {
                $group: {
                    _id: "$product_id",
                    totalViews: { $sum: "$views" },
                    uniqueUsers: { $addToSet: "$user_id" }
                }
            },
            {
                $project: {
                    product_id: "$_id",
                    totalViews: 1,
                    uniqueUsers: { $size: "$uniqueUsers" },
                    _id: 0
                }
            },
            { $sort: { totalViews: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalProducts = await ProductView.distinct("product_id");
        const totalCount = totalProducts.length;
        const totalPages = Math.ceil(totalCount / limit);

        // Get product details for each product
        const productIds = productViews.map(pv => new mongoose.Types.ObjectId(pv.product_id));
        const products = await Product.find({ _id: { $in: productIds } });

        const productsMap = {};
        products.forEach(product => {
            productsMap[product._id.toString()] = product;
        });

        const analyticsData = productViews.map(pv => {
            const product = productsMap[pv.product_id.toString()];
            // Get product image - check if images array exists and has items
            let productImage = null;
            if (product?.product?.images && Array.isArray(product.product.images) && product.product.images.length > 0) {
                const firstImage = product.product.images[0];
                // Check if image has sizes.original (object structure) or is a direct URL (string)
                if (typeof firstImage === 'string') {
                    productImage = firstImage;
                } else if (firstImage?.sizes?.original) {
                    productImage = firstImage.sizes.original;
                } else if (firstImage?.original) {
                    productImage = firstImage.original;
                }
            }
            return {
                product_id: pv.product_id,
                product_name: product?.product?.name || 'Unknown Product',
                product_price: product?.discountedPrice || product?.originalPrice || 0,
                product_image: productImage,
                total_views: pv.totalViews,
                unique_users: pv.uniqueUsers
            };
        });

        res.status(200).json({
            success: true,
            analytics: analyticsData,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalProducts: totalCount,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Error fetching product analytics:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching product analytics.',
            error: error.message
        });
    }
};

exports.exportProductAnalytics = async (req, res) => {
    try {
        const productViews = await ProductView.aggregate([
            {
                $group: {
                    _id: "$product_id",
                    totalViews: { $sum: "$views" },
                    uniqueUsers: { $addToSet: "$user_id" }
                }
            },
            {
                $project: {
                    product_id: "$_id",
                    totalViews: 1,
                    uniqueUsers: { $size: "$uniqueUsers" },
                    _id: 0
                }
            },
            { $sort: { totalViews: -1 } }
        ]);

        const productIds = productViews.map(pv => new mongoose.Types.ObjectId(pv.product_id));
        const products = await Product.find({ _id: { $in: productIds } });

        const productsMap = {};
        products.forEach(product => {
            productsMap[product._id.toString()] = product;
        });

        const analyticsData = productViews.map(pv => {
            const product = productsMap[pv.product_id.toString()];
            return {
                product_name: product?.product?.name || 'Unknown Product',
                product_price: product?.discountedPrice || product?.originalPrice || 0,
                total_views: pv.totalViews,
                unique_users: pv.uniqueUsers
            };
        });

        res.status(200).json({
            success: true,
            analytics: analyticsData
        });
    } catch (error) {
        console.error('Error exporting product analytics:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while exporting product analytics.',
            error: error.message
        });
    }
};

exports.getProductViewDetails = async (req, res) => {
    try {
        const { productId } = req.params;

        const productViews = await ProductView.find({ 
            product_id: new mongoose.Types.ObjectId(productId) 
        })
        .populate('user_id', 'name email')
        .sort({ lastViewedAt: -1 });

        const product = await Product.findById(productId);

        const viewDetails = productViews.map(pv => ({
            user_id: pv.user_id?._id || null,
            user_name: pv.user_id?.name || 'Guest',
            user_email: pv.user_id?.email || null,
            views: pv.views,
            last_viewed: pv.lastViewedAt
        }));

        res.status(200).json({
            success: true,
            product: {
                _id: product?._id,
                name: product?.product?.name || 'Unknown Product',
                price: product?.discountedPrice || product?.originalPrice || 0
            },
            viewDetails: viewDetails,
            totalViews: productViews.reduce((sum, pv) => sum + pv.views, 0),
            uniqueUsers: productViews.length
        });
    } catch (error) {
        console.error('Error fetching product view details:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching product view details.',
            error: error.message
        });
    }
};

exports.getActivityLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const platform = req.query.platform;
        const log_type = req.query.log_type;
        const status = req.query.status;
        const search = req.query.search;
        
        const query = {};
        
        if (platform) {
            query.platform = platform;
        }
        
        if (log_type) {
            query.log_type = log_type;
        }
        
        if (status) {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { message: { $regex: search, $options: 'i' } },
                { user_name: { $regex: search, $options: 'i' } },
                { user_email: { $regex: search, $options: 'i' } },
                { order_id: { $regex: search, $options: 'i' } },
                { issue_message: { $regex: search, $options: 'i' } }
            ];
        }
        
        const logs = await ActivityLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        const totalCount = await ActivityLog.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);
        
        res.status(200).json({
            success: true,
            logs,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity logs',
            error: error.message
        });
    }
};

exports.getActivityLogById = async (req, res) => {
    try {
        const { logId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid log ID'
            });
        }
        
        const log = await ActivityLog.findById(logId).lean();
        
        if (!log) {
            return res.status(404).json({
                success: false,
                message: 'Log not found'
            });
        }
        
        res.status(200).json({
            success: true,
            log
        });
    } catch (error) {
        console.error('Error fetching activity log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity log',
            error: error.message
        });
    }
};

exports.getBackendLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const platform = req.query.platform;
        const date = req.query.date;
        const search = req.query.search;
        
        const query = {};
        
        if (platform) {
            query.platform = platform;
        }
        
        if (date) {
            query.date = date;
        }
        
        const logs = await BackendLog.find(query)
            .sort({ date: -1, platform: 1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        let filteredLogs = logs;
        if (search) {
            filteredLogs = logs.map(log => {
                const filteredActivities = log.activities.filter(activity => 
                    activity.activity_name.toLowerCase().includes(search.toLowerCase()) ||
                    activity.message.toLowerCase().includes(search.toLowerCase()) ||
                    (activity.order_id && activity.order_id.toLowerCase().includes(search.toLowerCase())) ||
                    (activity.product_name && activity.product_name.toLowerCase().includes(search.toLowerCase()))
                );
                return {
                    ...log,
                    activities: filteredActivities,
                    total_activities: filteredActivities.length,
                    success_count: filteredActivities.filter(a => a.status === 'success').length,
                    failure_count: filteredActivities.filter(a => a.status === 'failure').length
                };
            }).filter(log => log.activities.length > 0);
        }
        
        const totalCount = await BackendLog.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);
        
        res.status(200).json({
            success: true,
            logs: filteredLogs,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching backend logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch backend logs',
            error: error.message
        });
    }
};

exports.getBackendLogByDate = async (req, res) => {
    try {
        const { date, platform } = req.params;
        
        if (!date || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Date and platform are required'
            });
        }
        
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Expected YYYY-MM-DD'
            });
        }
        
        if (!['Mobile App Backend', 'Website Backend'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid platform. Expected "Mobile App Backend" or "Website Backend"'
            });
        }
        
        const log = await BackendLog.findOne({
            date: date,
            platform: platform
        }).lean();
        
        if (!log) {
            return res.status(404).json({
                success: false,
                message: 'Log not found for the specified date and platform'
            });
        }
        
        log.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.status(200).json({
            success: true,
            log
        });
    } catch (error) {
        console.error('Error fetching backend log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch backend log',
            error: error.message
        });
    }
};

exports.downloadBackendLogs = async (req, res) => {
    try {
        const { date, platform } = req.query;
        
        const query = {};
        if (date) query.date = date;
        if (platform) query.platform = platform;
        
        const logs = await BackendLog.find(query)
            .sort({ date: -1, platform: 1 })
            .lean();
        
        let textContent = 'BACKEND LOGS EXPORT\n';
        textContent += '='.repeat(50) + '\n\n';
        
        logs.forEach(log => {
            textContent += `Date: ${log.date}\n`;
            textContent += `Platform: ${log.platform}\n`;
            textContent += `Total Activities: ${log.total_activities}\n`;
            textContent += `Success: ${log.success_count} | Failure: ${log.failure_count}\n`;
            textContent += '-'.repeat(50) + '\n';
            
            log.activities.forEach((activity, index) => {
                textContent += `\n[${index + 1}] ${activity.activity_name}\n`;
                textContent += `Status: ${activity.status.toUpperCase()}\n`;
                textContent += `Message: ${activity.message}\n`;
                if (activity.order_id) textContent += `Order ID: ${activity.order_id}\n`;
                if (activity.product_name) textContent += `Product: ${activity.product_name}\n`;
                if (activity.execution_path) textContent += `Execution: ${activity.execution_path}\n`;
                if (activity.error_details) textContent += `Error: ${activity.error_details}\n`;
                textContent += `Time: ${new Date(activity.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}\n`;
                textContent += '\n';
            });
            
            textContent += '\n' + '='.repeat(50) + '\n\n';
        });
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=backend_logs_${new Date().toISOString().split('T')[0]}.txt`);
        res.send(textContent);
    } catch (error) {
        console.error('Error downloading backend logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download backend logs',
            error: error.message
        });
    }
};

exports.downloadActivityLogs = async (req, res) => {
    try {
        const { platform, log_type, status, search } = req.query;
        
        const query = {};
        if (platform) query.platform = platform;
        if (log_type) query.log_type = log_type;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { message: { $regex: search, $options: 'i' } },
                { user_name: { $regex: search, $options: 'i' } },
                { user_email: { $regex: search, $options: 'i' } },
                { order_id: { $regex: search, $options: 'i' } },
                { issue_message: { $regex: search, $options: 'i' } }
            ];
        }
        
        const logs = await ActivityLog.find(query)
            .sort({ timestamp: -1 })
            .limit(10000)
            .lean();
        
        let textContent = 'ACTIVITY LOGS EXPORT (Mobile App Frontend)\n';
        textContent += '='.repeat(50) + '\n\n';
        
        logs.forEach((log, index) => {
            textContent += `[${index + 1}] Log Entry\n`;
            textContent += `Platform: ${log.platform}\n`;
            textContent += `Type: ${log.log_type}\n`;
            textContent += `Action: ${log.action}\n`;
            textContent += `Status: ${log.status.toUpperCase()}\n`;
            textContent += `Message: ${log.message}\n`;
            if (log.user_name) textContent += `User: ${log.user_name}\n`;
            if (log.user_email) textContent += `Email: ${log.user_email}\n`;
            if (log.mobile_device) textContent += `Device: ${log.mobile_device}\n`;
            if (log.app_version) textContent += `App Version: ${log.app_version}\n`;
            if (log.issue_message) textContent += `Issue: ${log.issue_message}\n`;
            if (log.order_id) textContent += `Order ID: ${log.order_id}\n`;
            if (log.error_details) textContent += `Error: ${log.error_details}\n`;
            textContent += `Time: ${new Date(log.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}\n`;
            textContent += '\n' + '-'.repeat(50) + '\n\n';
        });
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=activity_logs_${new Date().toISOString().split('T')[0]}.txt`);
        res.send(textContent);
    } catch (error) {
        console.error('Error downloading activity logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download activity logs',
            error: error.message
        });
    }
};