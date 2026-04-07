const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const Admin = require("../models/Admin");
const User = require("../models/User");
const Order = require('../models/Order');
const OrderDetail = require('../models/OrderDetail');
const Coupon = require('../models/Coupon');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const ProductView = require('../models/ProductView');
const Role = require('../models/Role');
const ActivityLog = require('../models/ActivityLog');
const BackendLog = require('../models/BackendLog');
const mongoose = require('mongoose');
const { sendEmail } = require("../mail/emailService");

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

// ==================== Admin Auth ====================

exports.adminRegister = async (data) => {
    const { firstName, lastName, email, phone, password } = data;
    if (!firstName) {
        throw { status: 400, message: "first Name is required" };
    }
    if (!lastName) {
        throw { status: 400, message: "Last Name is required" };
    }
    if (!email) {
        throw { status: 400, message: "Email is required" };
    }
    if (!phone) {
        throw { status: 400, message: "phone is required" };
    }
    if (!password) {
        throw { status: 400, message: "Password is required" };
    }
    const existingAdmin = await Admin.findOne({ email: email });

    if (existingAdmin) {
        throw { status: 400, message: "Admin already exists" };
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
    return admin;
};

exports.adminLogin = async (email, password) => {
    if (!email) {
        throw { status: 400, message: "Email is required" };
    }
    if (!password) {
        throw { status: 400, message: "Password is required" };
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
        throw { status: 400, message: "Invalid Email" };
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
        throw { status: 400, message: "Invalid credentials" };
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
    return {
        admin: {
            name: `${admin.firstName} ${admin.lastName}`,
            email: admin.email,
            role: adminWithRole.role,
        },
        token
    };
};

exports.forgotPassword = async (email) => {
    console.log(email)
    const admin = await Admin.findOne({ email });
    if (!admin) {
        throw { status: 404, message: 'Admin not found' };
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

    return {};
};

exports.verifyCode = async (email, code) => {
    const admin = await Admin.findOne({ email });

    if (!admin) {
        throw { status: 404, message: "Admin not found" };
    }

    if (!admin.resetPasswordToken || admin.resetPasswordExpires < Date.now()) {
        throw { status: 400, message: "Code expired or invalid" };
    }

    const decoded = jwt.verify(admin.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
        throw { status: 400, message: "Invalid code" };
    }

    return {};
};

exports.resetPassword = async (email, newPassword, code) => {
    const admin = await Admin.findOne({ email });

    if (!admin) {
        throw { status: 404, message: "Admin not found" };
    }

    if (!admin.resetPasswordToken || admin.resetPasswordExpires < Date.now()) {
        throw { status: 400, message: "Code expired or invalid" };
    }

    const decoded = jwt.verify(admin.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
        throw { status: 400, message: "Invalid code" };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    return {};
};

exports.updatePassword = async (adminId, oldPassword, newPassword) => {
    const admin = await Admin.findById(adminId);

    if (!admin) {
        throw { status: 404, message: "Admin not found" };
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
        throw { status: 400, message: "Old password is incorrect" };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    return {};
};

// ==================== Admin CRUD ====================

exports.getCurrentAdmin = async (adminId) => {
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
        throw { status: 404, message: 'Admin not found.' };
    }

    return admin;
};

exports.getAllAdmins = async ({ page, limit }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
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
        throw {
            status: 404,
            message: 'No admins found.',
            data: {
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalAdmins: 0,
                    adminsPerPage: limit,
                }
            }
        };
    }

    return {
        admins: admins,
        pagination: {
            currentPage: page,
            totalPages,
            totalAdmins: totalCount,
            adminsPerPage: limit,
        },
    };
};

exports.getAdminById = async (adminId) => {
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        throw { status: 400, message: 'Invalid admin ID format.' };
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
        throw { status: 404, message: 'Admin not found.' };
    }

    return admin;
};

exports.createSubAdmin = async (data) => {
    const { firstName, lastName, email, phone, password, roleId } = data;

    if (!firstName) {
        throw { status: 400, message: "First Name is required" };
    }
    if (!lastName) {
        throw { status: 400, message: "Last Name is required" };
    }
    if (!email) {
        throw { status: 400, message: "Email is required" };
    }
    if (!phone) {
        throw { status: 400, message: "Phone is required" };
    }
    if (!password) {
        throw { status: 400, message: "Password is required" };
    }
    if (!roleId) {
        throw { status: 400, message: "Role is required" };
    }

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
        throw { status: 400, message: "Invalid role ID" };
    }

    const role = await Role.findById(roleId);
    if (!role || !role.isActive) {
        throw { status: 400, message: "Invalid or inactive role" };
    }

    const existingAdmin = await Admin.findOne({ email: email });
    if (existingAdmin) {
        throw { status: 400, message: "Admin with this email already exists" };
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

    return populatedAdmin;
};

exports.updateSubAdmin = async (adminId, data) => {
    const { firstName, lastName, email, phone, roleId, isActive } = data;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        throw { status: 400, message: 'Invalid admin ID format.' };
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
        throw { status: 404, message: 'Admin not found.' };
    }

    if (roleId) {
        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            throw { status: 400, message: "Invalid role ID" };
        }
        const role = await Role.findById(roleId);
        if (!role || !role.isActive) {
            throw { status: 400, message: "Invalid or inactive role" };
        }
        admin.role = roleId;
    }

    if (email && email !== admin.email) {
        const existingAdmin = await Admin.findOne({ email, _id: { $ne: adminId } });
        if (existingAdmin) {
            throw { status: 400, message: 'Email already exists for another admin.' };
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

    return populatedAdmin;
};

exports.deleteSubAdmin = async (adminId) => {
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        throw { status: 400, message: 'Invalid admin ID format.' };
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
        throw { status: 404, message: 'Admin not found.' };
    }

    admin.isActive = false;
    admin.updatedAt = Date.now();
    await admin.save();

    return {};
};

// ==================== User Management ====================

exports.getAllUsers = async ({ page, limit, search, status, platform, authProvider, startDate, endDate }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = search || '';
    const statusFilter = status || '';
    const platformFilter = platform || '';
    const authProviderFilter = authProvider || '';
    const dateFrom = startDate || '';
    const dateTo = endDate || '';

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

    return {
        users: usersWithOrders,
        pagination: {
            currentPage: page,
            totalPages,
            totalUsers: totalCount,
            usersPerPage: limit,
        },
    };
};

exports.exportUsers = async (filters) => {
    const searchQuery = filters.search || "";
    const statusFilter = filters.status || '';
    const platformFilter = filters.platform || '';
    const authProviderFilter = filters.authProvider || '';
    const dateFrom = filters.startDate || '';
    const dateTo = filters.endDate || '';

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

    return users;
};

exports.getUserById = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId)
        .select('-password -resetPasswordToken -resetPasswordExpires -refreshToken -recoveryCode -recoveryCodeExpires')
        .exec();

    if (!user) {
        throw { status: 404, message: 'User not found.' };
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

    return {
        ...user.toObject(),
        cart: cart ? cart.items : [],
        wishlist: wishlist ? wishlist.items : [],
        orders: ordersWithDetails,
        totalOrders: ordersWithDetails.length
    };
};

exports.blockUser = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found.' };
    }

    if (user.isDeleted) {
        throw { status: 400, message: 'Cannot block a deleted user. Please restore the user first.' };
    }

    if (user.isBlocked) {
        throw { status: 400, message: 'User is already blocked.' };
    }

    user.isBlocked = true;
    user.blockedAt = new Date();
    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
        blockedAt: user.blockedAt
    };
};

exports.unblockUser = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found.' };
    }

    if (!user.isBlocked) {
        throw { status: 400, message: 'User is not blocked.' };
    }

    user.isBlocked = false;
    user.blockedAt = null;
    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked
    };
};

exports.deleteUser = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found.' };
    }

    if (user.isDeleted) {
        throw { status: 400, message: 'User is already deleted.' };
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = 'admin';
    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isDeleted: user.isDeleted,
        deletedAt: user.deletedAt
    };
};

exports.restoreUser = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found.' };
    }

    if (!user.isDeleted) {
        throw { status: 400, message: 'User is not deleted.' };
    }

    user.isDeleted = false;
    user.deletedAt = null;
    user.deletedBy = null;
    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isDeleted: user.isDeleted
    };
};

exports.updateUser = async (userId, data) => {
    const { name, email, phone } = data;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found.' };
    }

    if (user.isDeleted) {
        throw { status: 400, message: 'Cannot update a deleted user. Please restore the user first.' };
    }

    if (email && email !== user.email) {
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
            throw { status: 400, message: 'Email already exists for another user.' };
        }
        user.email = email;
    }

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isBlocked: user.isBlocked || false,
        isDeleted: user.isDeleted
    };
};

// ==================== Order Management ====================

exports.getOrders = async ({ page, limit, search, status, paymentStatus, paymentMethod, platform, startDate, endDate }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;
    const orderIdSearch = search || '';
    const dateFrom = startDate || '';
    const dateTo = endDate || '';
    const statusFilter = status || '';
    const paymentStatusFilter = paymentStatus || '';
    const paymentMethodFilter = paymentMethod || '';
    const platformFilter = platform || '';

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

    return {
        orders: updatedOrders,
        pagination: {
            currentPage: page,
            totalPages,
            totalOrders: totalCount,
            ordersPerPage: limit,
        },
    };
};

exports.getCoupons = async () => {
    console.log('API - Coupons');
    const coupons = await Coupon.find();
    if (coupons.length === 0) {
        throw { status: 404, message: 'No coupons found.' };
    }

    console.log('Return - API - Coupons');
    return coupons;
};

exports.updateOrderStatus = async (orderId, status, filePath) => {
    if (!status) {
        throw { status: 400, message: "Status is required" };
    }

    const statusSequence = [
        "Confirmed",
        "Packed",
        "Out For Delivery",
        "Delivered",
        "Refunded"
    ];

    if (!statusSequence.includes(status)) {
        throw {
            status: 400,
            message: `Invalid status. Allowed statuses are: ${statusSequence.join(", ")}`
        };
    }

    const order = await Order.findById(orderId);
    if (!order) {
        throw { status: 404, message: "Order not found" };
    }

    let imagePath = null;
    if (filePath) {
        imagePath = filePath.replace(/\\/g, "/");
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

    return updatedOrder;
};

// ==================== Analytics ====================

exports.getProductAnalytics = async ({ page, limit, search, startDate, endDate }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
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

    return {
        analytics: analyticsData,
        pagination: {
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalCount,
            limit: limit
        }
    };
};

exports.exportProductAnalytics = async (filters) => {
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

    return analyticsData;
};

exports.getProductViewDetails = async (productId) => {
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

    return {
        product: {
            _id: product?._id,
            name: product?.product?.name || 'Unknown Product',
            price: product?.discountedPrice || product?.originalPrice || 0
        },
        viewDetails: viewDetails,
        totalViews: productViews.reduce((sum, pv) => sum + pv.views, 0),
        uniqueUsers: productViews.length
    };
};

// ==================== Logs ====================

exports.getActivityLogs = async ({ page, limit, search, platform, status }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    if (platform) {
        query.platform = platform;
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

    return {
        logs,
        pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit
        }
    };
};

exports.getActivityLogById = async (logId) => {
    if (!mongoose.Types.ObjectId.isValid(logId)) {
        throw { status: 400, message: 'Invalid log ID' };
    }

    const log = await ActivityLog.findById(logId).lean();

    if (!log) {
        throw { status: 404, message: 'Log not found' };
    }

    return log;
};

exports.getBackendLogs = async ({ page, limit, date, platform, search }) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;
    const skip = (page - 1) * limit;

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

    return {
        logs: filteredLogs,
        pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit
        }
    };
};

exports.getBackendLogByDate = async (date, platform) => {
    if (!date || !platform) {
        throw { status: 400, message: 'Date and platform are required' };
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        throw { status: 400, message: 'Invalid date format. Expected YYYY-MM-DD' };
    }

    if (!['Mobile App Backend', 'Website Backend'].includes(platform)) {
        throw { status: 400, message: 'Invalid platform. Expected "Mobile App Backend" or "Website Backend"' };
    }

    const log = await BackendLog.findOne({
        date: date,
        platform: platform
    }).lean();

    if (!log) {
        throw { status: 404, message: 'Log not found for the specified date and platform' };
    }

    log.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return log;
};

exports.downloadActivityLogs = async (filters) => {
    const { platform, log_type, status, search } = filters;

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

    return logs;
};

exports.downloadBackendLogs = async (filters) => {
    const { date, platform } = filters;

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

    return logs;
};
