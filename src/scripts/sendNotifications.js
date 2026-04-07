const admin = require('../config/firebase');
const Notification = require('../models/Notification');

const sendPushNotification = async (fcmToken, title, body, userId, orderId = null) => {
    if (!fcmToken) return;

    //andriod
    // fcmToken = 'c4ab-VW_S4WphDMRGvermw:APA91bH-B38aJkO7ZDDNBPYutF9Dyy6yf82kQUKYewWBJU1xrt3E0MMQag0SDI-zca_Y8c8dN4irqXnXuiBcuZg9hacC5y7XWgQ8Pcqk-cXZ75sDTDbY4kI';

    //ios
    // fcmToken = 'd-9yZNrdKkRZkVJb4rlrk0:APA91bERZtFmHe0KXjBKTT_kVjVrf0hA0eN4sUCj5M--1ZTCH2-e6S4L4ustTSC5NH9lF7zipgX7wze7NyYl5RABtqPMrmrpYVJHpUcOp0aOc7alHoOiNJU';

    const message = {
        token: fcmToken,
        notification: {
            title: title,
            body: body
        },
        data: {}
    };

    if (orderId) {
        message.data.orderId = String(orderId);
    }

    try {
        const response = await admin.messaging().send(message);
        console.log('Notification Sent Successfully : ', response);
        await Notification.create({
            userId,
            title,
            message: body,
            orderId
        });
    } catch (error) {
        console.log('Error sending notification:', error);
    }
};

module.exports = { sendPushNotification };
