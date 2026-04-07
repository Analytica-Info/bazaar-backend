const notificationService = require("../../services/notificationService");
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../../config/jwtSecret');

const getAdminIdFromToken = (req) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.id;
    } catch (error) {
        return null;
    }
};

exports.createNotification = async (req, res) => {
    try {
        const { title, message, scheduledDateTime, sendToAll, targetUsers } = req.body;
        const adminId = getAdminIdFromToken(req);
        const sendInstantly = req.body.sendInstantly === true || req.body.sendInstantly === 'true';

        const notification = await notificationService.createNotification({
            title,
            message,
            scheduledDateTime,
            sendToAll,
            targetUsers,
            adminId,
            sendInstantly,
        });

        res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            notification
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        console.error('Create Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating notification',
            error: error.message
        });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await notificationService.getNotifications({ page, limit });

        res.status(200).json({
            success: true,
            notifications: result.notifications,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching notifications',
            error: error.message
        });
    }
};

exports.getNotificationDetails = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await notificationService.getNotificationDetails(notificationId);

        res.status(200).json({
            success: true,
            notification
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        console.error('Get Notification Details Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching notification details',
            error: error.message
        });
    }
};

exports.updateNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const { title, message, scheduledDateTime, sendToAll, targetUsers } = req.body;

        const notification = await notificationService.updateNotification(notificationId, {
            title,
            message,
            scheduledDateTime,
            sendToAll,
            targetUsers,
        });

        res.status(200).json({
            success: true,
            message: 'Notification updated successfully',
            notification
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        console.error('Update Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating notification',
            error: error.message
        });
    }
};

exports.searchUsers = async (req, res) => {
    try {
        const searchQuery = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const result = await notificationService.searchUsers({ search: searchQuery, page, limit });

        res.status(200).json({
            success: true,
            users: result.users,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Search Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while searching users',
            error: error.message
        });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;

        await notificationService.deleteNotification(notificationId);

        res.status(200).json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }
        console.error('Delete Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting notification',
            error: error.message
        });
    }
};

exports.getAllUsersForNotification = async (req, res) => {
    try {
        const users = await notificationService.getAllUsersForNotification();

        res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Get All Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching users',
            error: error.message
        });
    }
};
