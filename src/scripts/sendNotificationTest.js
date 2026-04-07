/**
 * Test script: send one notification immediately to the user with email
 * m.zoraiz+2@analytica-data.com (only that user receives it).
 *
 * Run from server directory:
 *   cd bazaar-react/bazaar-react/server
 *   node sendNotificationTest.js
 *
 * Uses same DB and Firebase as the app. Current time (e.g. Pakistan 2:48 = Dubai 1:48)
 * is only for the message text; the notification is sent as soon as you run the file.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNotificationToUsers } = require('../helpers/sendPushNotification');

const TEST_USER_EMAIL = 'm.zoraiz+2@analytica-data.com';
const TITLE = 'Test notification';
const MESSAGE = 'Sent from test script (send immediately).';

async function run() {
    console.log('--- Send notification test ---');
    console.log('Target user:', TEST_USER_EMAIL);

    await connectDB();

    const user = await User.findOne({ email: TEST_USER_EMAIL })
        .select('_id email fcmToken')
        .lean()
        .exec();

    if (!user) {
        console.error('User not found with email:', TEST_USER_EMAIL);
        process.exit(1);
    }

    if (!user.fcmToken) {
        console.error('User has no FCM token. They must open the app so the device can register for push.');
        process.exit(1);
    }

    console.log('User found:', user._id, '| FCM token present: yes');

    const notification = new Notification({
        title: TITLE,
        message: MESSAGE,
        sendToAll: false,
        targetUsers: [user._id],
        clickedUsers: [],
        createdBy: null,
        createdAt: new Date()
    });

    await notification.save();
    console.log('Notification created in DB. id:', notification._id.toString());

    const result = await sendNotificationToUsers(notification._id);

    if (result == null) {
        console.log('[Test] FAIL — notification was not sent (see logs above: already sent, no FCM token, or Firebase not initialized).');
        process.exit(1);
    }
    if (result.successCount > 0 && result.failCount === 0) {
        console.log('[Test] SUCCESS — notification sent to', result.successCount, 'user(s). Check your device.');
    } else if (result.failCount > 0) {
        console.log('[Test] PARTIAL/FAIL —', result.successCount, 'sent,', result.failCount, 'failed.');
        process.exit(1);
    } else {
        console.log('[Test] FAIL — 0 users received the notification.');
        process.exit(1);
    }

    console.log('--- Done. ---');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error('[Test] FAIL —', err.message || err);
    process.exit(1);
});
