const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { logActivity } = require('../utilities/activityLogger');
const { logBackendActivity } = require('../utilities/backendLogger');

const logger = require("../utilities/logger");
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return;

    try {
        const path = require('path');
        const fs = require('fs');
        const serviceAccountPath = path.join(__dirname, '../config/bazaar-2aa3a-firebase-adminsdk-fbsvc-270d47e77a.json');

        if (!fs.existsSync(serviceAccountPath)) {
            logger.error({ err: serviceAccountPath }, 'Firebase service account file not found at:');
            return;
        }

        const serviceAccount = require(serviceAccountPath);

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        firebaseInitialized = true;
        logger.info('Firebase Admin initialized successfully for admin notifications');
    } catch (error) {
        logger.error({ err: error }, 'Firebase initialization error:');
    }
}

function isFirebaseInitialized() {
    if (!firebaseInitialized) {
        initializeFirebase();
    }
    return admin.apps.length > 0;
}

const sendPushNotificationToUser = async (fcmToken, title, body, userId, notificationId = null) => {
    if (!fcmToken) {
        logger.info(`No FCM token for user ${userId}`);
        return false;
    }

    if (!isFirebaseInitialized()) {
        logger.error('Firebase not initialized, cannot send notification');
        return false;
    }

    const message = {
        token: fcmToken,
        notification: {
            title: title,
            body: body
        },
        data: {}
    };

    if (notificationId) {
        message.data.notificationId = String(notificationId);
    }

    try {
        const response = await admin.messaging().send(message);
        console.log('[Firebase] NOTIFICATION SENT — success to token', fcmToken?.slice(-8) + '...', '| response:', response);
        return true;
    } catch (error) {
        console.error('[Firebase] NOTIFICATION SEND FAILED — token', fcmToken?.slice(-8) + '...', '| error:', error?.message || error);
        return false;
    }
};

exports.sendNotificationToUsers = async (notificationId) => {
    const noResult = () => null;
    try {
        const existing = await Notification.findById(notificationId);
        if (!existing) {
            logger.error({ err: notificationId }, 'Notification not found:');
            return noResult();
        }
        if (existing.sentAt) {
            console.log('Notification already sent:', notificationId);
            return noResult();
        }
        if (!isFirebaseInitialized()) {
            logger.error('Firebase not initialized, cannot send notification');
            return noResult();
        }

        const notification = await Notification.findOneAndUpdate(
            {
                _id: notificationId,
                sentAt: null,
                $or: [ { status: 'pending' }, { status: { $exists: false } }, { status: null } ]
            },
            { $set: { sentAt: new Date() } },
            { new: true }
        );

        if (!notification) {
            console.log('Notification already claimed/sent by another process:', notificationId);
            return noResult();
        }

        console.log('[Notification Send] Sending notification id:', notificationId.toString(), '| title:', notification.title);

        let targetUsers = [];

        if (notification.sendToAll) {
            targetUsers = await User.find({ fcmToken: { $exists: true, $ne: null } })
                .select('_id fcmToken')
                .exec();
        } else {
            targetUsers = await User.find({
                _id: { $in: notification.targetUsers },
                fcmToken: { $exists: true, $ne: null }
            })
                .select('_id fcmToken')
                .exec();
        }

        if (targetUsers.length === 0) {
            logger.info('No users with FCM tokens found');
            return noResult();
        }

        let successCount = 0;
        let failCount = 0;

        for (const user of targetUsers) {
            if (!user.fcmToken) {
                logger.info(`Skipping user ${user._id} - no FCM token`);
                failCount++;
                continue;
            }

            const success = await sendPushNotificationToUser(
                user.fcmToken,
                notification.title,
                notification.message,
                user._id,
                notification._id
            );

            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        if (successCount > 0 && failCount === 0) {
            logger.info(`[Notification Send] SUCCESS — sent to ${successCount} user(s). id: ${notificationId}`);
        } else if (failCount > 0) {
            logger.info(`[Notification Send] PARTIAL/FAIL — ${successCount} success, ${failCount} failed. id: ${notificationId}`);
        } else {
            logger.info(`[Notification Send] FAIL — 0 sent. id: ${notificationId}`);
        }

        // Bulk insert per-user notification records — was N inserts, now 1
        if (targetUsers.length > 0) {
            try {
                const now = new Date();
                const docs = targetUsers.map((u) => ({
                    userId: u._id,
                    title: notification.title,
                    message: notification.message,
                    read: false,
                    createdAt: now,
                }));
                await Notification.insertMany(docs, { ordered: false });
            } catch (error) {
                logger.error({ err: error }, 'Error bulk-creating user notification records:');
            }
        }

        const totalTargets = targetUsers.length;
        const finalStatus = (failCount > 0 || successCount === 0) ? 'failed' : 'sent';
        await Notification.findByIdAndUpdate(notificationId, { $set: { status: finalStatus } });

        if (successCount > 0) {
            logger.info(`\n========== NOTIFICATION SENT TO ${successCount} USER(S) — id: ${notificationId} ==========\n`);
        }
        if (finalStatus === 'failed') {
            logger.info(`[Notification Send] FAILED — ${successCount}/${totalTargets} received. ${failCount > 0 ? 'At least one delivery failed.' : 'No users received.'}`);
        }

        const sendMessage = finalStatus === 'sent'
            ? `Notification sent to all ${successCount} user(s) successfully.`
            : (successCount > 0
                ? `Notification sent to ${successCount}/${totalTargets} user(s); at least one failed (status: failed).`
                : `Notification send failed (no users received).`);
        const logStatus = finalStatus === 'sent' ? 'success' : 'failure';
        await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: finalStatus === 'sent' ? 'Notification Sent' : 'Notification Send Failed',
            status: logStatus,
            message: sendMessage,
            user: null,
            details: { notification_id: notificationId.toString(), user_count: successCount, title: notification.title }
        }).catch(() => {});
        await logBackendActivity({
            platform: 'Website Backend',
            activity_name: finalStatus === 'sent' ? 'Notification Sent (Cron)' : 'Notification Send Failed',
            status: logStatus,
            message: sendMessage,
            execution_path: 'sendPushNotification.sendNotificationToUsers'
        }).catch(() => {});

        return { successCount, failCount, total: targetUsers.length };
    } catch (error) {
        logger.error({ err: error }, 'Error in sendNotificationToUsers:');
        return noResult();
    }
};

const LOCK_ID = 'scheduled_notifications';
const LOCK_MINUTE_FORMAT = (d) => d.toISOString().slice(0, 16);

async function tryAcquireMinuteLock() {
    const now = new Date();
    const currentMinute = LOCK_MINUTE_FORMAT(now);
    const myPid = process.pid;
    const coll = Notification.db.collection('cronlocks');
    const filter = {
        _id: LOCK_ID,
        $or: [
            { lockedMinute: { $ne: currentMinute } },
            { processId: myPid }
        ]
    };
    const update = { $set: { lockedMinute: currentMinute, processId: myPid, lockedAt: now } };
    try {
        const result = await coll.updateOne(filter, update, { upsert: true });
        const gotLock = (result.matchedCount === 1 && result.modifiedCount === 1) || result.upsertedCount === 1;
        return gotLock;
    } catch (err) {
        if (err.code === 11000) return false;
        throw err;
    }
}

exports.checkAndSendScheduledNotifications = async () => {
    const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
        const gotLock = await tryAcquireMinuteLock();
        if (!gotLock) {
            logger.info('[Scheduled Notifications] runId=', runId, '| SKIP (another process holds the lock for this minute). Run only ONE server to see sends here.');
            return;
        }

        let totalSent = 0;
        const maxAttempts = 3;
        const delayMs = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0) {
                logger.info('[Scheduled Notifications] runId=', runId, '| retry attempt', attempt + 1, 'after', delayMs / 1000, 's');
                await new Promise(r => setTimeout(r, delayMs));
            }

            const now = new Date();
            console.log('[Scheduled Notifications] ENTER runId=', runId, 'attempt=', attempt + 1, '| now (UTC):', now.toISOString());

            const allPending = await Notification.find({
                $or: [ { status: 'pending' }, { status: { $exists: false } }, { status: null } ],
                sentAt: null,
                scheduledDateTime: { $ne: null }
            }).read('primary').lean().exec();

            logger.info('[Scheduled Notifications] runId=', runId, '| allPending count:', allPending.length, allPending.length ? '| ids: ' + allPending.map(n => n._id.toString()).join(', ') : '');

            const toSend = allPending.filter(n => {
                const scheduled = n.scheduledDateTime ? new Date(n.scheduledDateTime).getTime() : 0;
                return scheduled > 0 && scheduled <= now.getTime();
            });

            if (toSend.length === 0) {
                if (allPending.length > 0) {
                    const next = allPending.sort((a, b) => new Date(a.scheduledDateTime) - new Date(b.scheduledDateTime))[0];
                    console.log('[Scheduled Notifications] No due this attempt. Pending:', allPending.length, '| Next (UTC):', next?.scheduledDateTime ? new Date(next.scheduledDateTime).toISOString() : null);
                } else if (attempt === maxAttempts - 1) {
                    const recent = await Notification.findOne(
                        { scheduledDateTime: { $ne: null } },
                        { _id: 1, sentAt: 1, scheduledDateTime: 1 }
                    ).sort({ createdAt: -1 }).read('primary').lean().exec();
                    if (recent) {
                        console.log('[Scheduled Notifications] No due (last attempt). Debug: id=', recent._id, 'sentAt=', recent.sentAt);
                        if (recent.sentAt) {
                            logger.info('[Scheduled Notifications] ^ That notification was already SENT (likely by another Node process). Run only ONE server (stop PM2/duplicate terminals/IDE run).');
                        }
                    }
                }
            } else {
                logger.info('[Scheduled Notifications] runId=', runId, '| Found', toSend.length, 'to send');
                for (const notification of toSend) {
                    console.log('[Scheduled Notifications] runId=', runId, '| Calling sendNotificationToUsers id:', notification._id.toString());
                    await exports.sendNotificationToUsers(notification._id);
                    totalSent++;
                }
                logger.info('[Scheduled Notifications] runId=', runId, '| DONE (sent', totalSent, ')');
                break;
            }
        }

        if (totalSent === 0) {
            logger.info('[Scheduled Notifications] runId=', runId, '| DONE (sent 0 after', maxAttempts, 'attempts)');
        }

        const now = new Date();
        const marked = await Notification.updateMany(
            {
                $or: [ { status: 'pending' }, { status: { $exists: false } }, { status: null } ],
                scheduledDateTime: { $lt: now }
            },
            { $set: { status: 'failed' } }
        );
        if (marked.modifiedCount > 0) {
            logger.info('[Scheduled Notifications] Marked', marked.modifiedCount, 'past-due as failed.');
        }
    } catch (error) {
        logger.error({ err: error }, 'Error checking scheduled notifications:');
    }
};

module.exports = exports;
