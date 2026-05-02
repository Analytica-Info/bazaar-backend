const adminService = require("../../services/adminService");
const User = require('../../repositories').users.rawModel();
const logger = require("../../utilities/logger");
exports.orders = async (req, res) => {
    try {
        const result = await adminService.getOrders({
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.orderId,
            startDate: req.query.dateFrom,
            endDate: req.query.dateTo,
            status: req.query.status,
            paymentStatus: req.query.paymentStatus,
            paymentMethod: req.query.paymentMethod,
            platform: req.query.platform,
        });

        if (result.orders.length === 0) {
            return res.status(200).json({
                success: true,
                orders: [],
                pagination: {
                    currentPage: parseInt(req.query.page) || 1,
                    totalPages: 0,
                    totalOrders: result.pagination.totalOrders,
                    ordersPerPage: parseInt(req.query.limit) || 10,
                }
            });
        }

        return res.status(200).json({
            success: true,
            orders: result.orders,
            pagination: result.pagination,
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
        const coupons = await adminService.getCoupons();
        return res.status(200).json({
            success: true,
            coupons: coupons,
        });
    } catch (error) {
        if (error.status === 404) {
            return res.status(404).json({
                success: false,
                message: error.message,
            });
        }
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching coupons.',
        });
    }
};

exports.adminRegister = async (req, res) => {
    try {
        await adminService.adminRegister(req.body);
        res.status(201).json({ message: "Admin registered successfully" });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const { admin, token } = await adminService.adminLogin(email, password);
        res.json({
            token,
            data: admin,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        await adminService.forgotPassword(email);
        res.status(200).json({ message: 'Verification code sent to email' });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

exports.verifyCode = async (req, res) => {
    try {
        const { email, code } = req.body;
        await adminService.verifyCode(email, code);
        res.status(200).json({ message: "Code verified successfully" });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        await adminService.resetPassword(email, newPassword, code);
        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        await adminService.updatePassword(req.user._id, oldPassword, newPassword);
        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        let filePath = null;
        if (req.file) {
            filePath = req.file.path;
        }
        const updatedOrder = await adminService.updateOrderStatus(orderId, status, filePath);
        res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order: updatedOrder
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error({ err: error }, "Update Order Status Error:");
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const result = await adminService.getAllUsers({
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search,
            status: req.query.status,
            platform: req.query.platform,
            authProvider: req.query.authProvider,
            startDate: req.query.dateFrom,
            endDate: req.query.dateTo,
        });

        if (result.users.length === 0) {
            return res.status(200).json({
                success: true,
                users: [],
                pagination: {
                    currentPage: parseInt(req.query.page) || 1,
                    totalPages: 0,
                    totalUsers: result.pagination.totalUsers,
                    usersPerPage: parseInt(req.query.limit) || 10,
                }
            });
        }

        return res.status(200).json({
            success: true,
            users: result.users,
            pagination: result.pagination,
        });
    } catch (error) {
        logger.error({ err: error }, "Get All Users Error:");
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching users.',
            error: error.message
        });
    }
};

exports.exportUsers = async (req, res) => {
    try {
        const users = await adminService.exportUsers({
            search: req.query.search,
            status: req.query.status,
            platform: req.query.platform,
            authProvider: req.query.authProvider,
            startDate: req.query.dateFrom,
            endDate: req.query.dateTo,
        });

        return res.status(200).json({
            success: true,
            users: users
        });
    } catch (error) {
        logger.error({ err: error }, "Export Users Error:");
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
        const user = await adminService.getUserById(userId);

        return res.status(200).json({
            success: true,
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Get User By ID Error:");
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
        const user = await adminService.blockUser(userId);

        return res.status(200).json({
            success: true,
            message: 'User blocked successfully.',
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Block User Error:");
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
        const user = await adminService.unblockUser(userId);

        return res.status(200).json({
            success: true,
            message: 'User unblocked successfully.',
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Unblock User Error:");
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
        const user = await adminService.deleteUser(userId);

        return res.status(200).json({
            success: true,
            message: 'User deleted successfully.',
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Delete User Error:");
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
        const user = await adminService.restoreUser(userId);

        return res.status(200).json({
            success: true,
            message: 'User restored successfully.',
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Restore User Error:");
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
        const user = await adminService.updateUser(userId, req.body);

        return res.status(200).json({
            success: true,
            message: 'User updated successfully.',
            user: user
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Update User Error:");
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating user.',
            error: error.message
        });
    }
};

exports.getAllAdmins = async (req, res) => {
    try {
        const result = await adminService.getAllAdmins({
            page: req.query.page,
            limit: req.query.limit,
        });

        return res.status(200).json({
            success: true,
            admins: result.admins,
            pagination: result.pagination,
        });
    } catch (error) {
        if (error.status === 404) {
            return res.status(404).json({
                success: false,
                message: error.message,
                pagination: error.data?.pagination,
            });
        }
        logger.error({ err: error }, "Get All Admins Error:");
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching admins.',
            error: error.message
        });
    }
};

exports.getCurrentAdmin = async (req, res) => {
    try {
        const admin = await adminService.getCurrentAdmin(req.user._id);

        return res.status(200).json({
            success: true,
            admin: admin
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Get Current Admin Error:");
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
        const admin = await adminService.getAdminById(adminId);

        return res.status(200).json({
            success: true,
            admin: admin
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Get Admin By ID Error:");
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching admin.',
            error: error.message
        });
    }
};

exports.createSubAdmin = async (req, res) => {
    try {
        const admin = await adminService.createSubAdmin(req.body);

        res.status(201).json({
            success: true,
            message: "Admin created successfully",
            admin: admin
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        logger.error({ err: error }, "Create Sub-Admin Error:");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.updateSubAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const admin = await adminService.updateSubAdmin(adminId, req.body);

        return res.status(200).json({
            success: true,
            message: 'Admin updated successfully.',
            admin: admin
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Update Sub-Admin Error:");
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
        await adminService.deleteSubAdmin(adminId);

        return res.status(200).json({
            success: true,
            message: 'Admin deleted successfully.'
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, "Delete Sub-Admin Error:");
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting admin.',
            error: error.message
        });
    }
};

exports.getProductAnalytics = async (req, res) => {
    try {
        const result = await adminService.getProductAnalytics({
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
        });

        res.status(200).json({
            success: true,
            analytics: result.analytics,
            pagination: result.pagination
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching product analytics:');
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching product analytics.',
            error: error.message
        });
    }
};

exports.exportProductAnalytics = async (req, res) => {
    try {
        const analyticsData = await adminService.exportProductAnalytics({
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
        });

        res.status(200).json({
            success: true,
            analytics: analyticsData
        });
    } catch (error) {
        logger.error({ err: error }, 'Error exporting product analytics:');
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
        const result = await adminService.getProductViewDetails(productId);

        res.status(200).json({
            success: true,
            product: result.product,
            viewDetails: result.viewDetails,
            totalViews: result.totalViews,
            uniqueUsers: result.uniqueUsers
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching product view details:');
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching product view details.',
            error: error.message
        });
    }
};

exports.getActivityLogs = async (req, res) => {
    try {
        const result = await adminService.getActivityLogs({
            page: req.query.page,
            limit: req.query.limit,
            platform: req.query.platform,
            status: req.query.status,
            search: req.query.search,
        });

        res.status(200).json({
            success: true,
            logs: result.logs,
            pagination: result.pagination
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching activity logs:');
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
        const log = await adminService.getActivityLogById(logId);

        res.status(200).json({
            success: true,
            log
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, 'Error fetching activity log:');
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity log',
            error: error.message
        });
    }
};

exports.getBackendLogs = async (req, res) => {
    try {
        const result = await adminService.getBackendLogs({
            page: req.query.page,
            limit: req.query.limit,
            platform: req.query.platform,
            date: req.query.date,
            search: req.query.search,
        });

        res.status(200).json({
            success: true,
            logs: result.logs,
            pagination: result.pagination
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching backend logs:');
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
        const log = await adminService.getBackendLogByDate(date, platform);

        res.status(200).json({
            success: true,
            log
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        logger.error({ err: error }, 'Error fetching backend log:');
        res.status(500).json({
            success: false,
            message: 'Failed to fetch backend log',
            error: error.message
        });
    }
};

exports.downloadBackendLogs = async (req, res) => {
    try {
        const logs = await adminService.downloadBackendLogs({
            date: req.query.date,
            platform: req.query.platform,
        });

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
        logger.error({ err: error }, 'Error downloading backend logs:');
        res.status(500).json({
            success: false,
            message: 'Failed to download backend logs',
            error: error.message
        });
    }
};

exports.downloadActivityLogs = async (req, res) => {
    try {
        const logs = await adminService.downloadActivityLogs({
            platform: req.query.platform,
            log_type: req.query.log_type,
            status: req.query.status,
            search: req.query.search,
        });

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
        logger.error({ err: error }, 'Error downloading activity logs:');
        res.status(500).json({
            success: false,
            message: 'Failed to download activity logs',
            error: error.message
        });
    }
};

exports.getLiveUsers = async (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 15;
        const since = new Date(Date.now() - minutes * 60 * 1000);

        const users = await User.find(
            { lastSeen: { $gte: since }, isDeleted: false },
            { name: 1, email: 1, avatar: 1, platform: 1, lastSeen: 1 }
        ).sort({ lastSeen: -1 }).limit(200).lean();

        return res.status(200).json({
            success: true,
            minutes,
            count: users.length,
            users,
        });
    } catch (error) {
        logger.error({ err: error }, 'Get Live Users Error:');
        return res.status(500).json({ success: false, message: 'Failed to fetch live users', error: error.message });
    }
};
