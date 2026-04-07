const { checkAndSendScheduledNotifications } = require('../helpers/sendPushNotification');
const fs = require('fs');

const LOG_FILE = "cron.log";

async function sendScheduledNotifications() {
    try {
        const date = new Date();
        const day = date.toLocaleString("en-US", {
            weekday: "long",
            timeZone: "Asia/Dubai",
        });
        const dateStr = date.toLocaleString("en-US", {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            timeZone: "Asia/Dubai",
        });
        const timeStr = date.toLocaleString("en-US", {
            hour: "2-digit",
            minute: "numeric",
            second: "numeric",
            hour12: true,
            timeZone: "Asia/Dubai",
        });
        const formattedDate = `${day}, ${dateStr}, ${timeStr}`;
        const logMessage = `Checking scheduled notifications at: ${formattedDate}\n`;

        fs.appendFileSync(LOG_FILE, logMessage);

        // Check and send scheduled notifications
        await checkAndSendScheduledNotifications();

        const endDate = new Date();
        const endDay = endDate.toLocaleString("en-US", {
            weekday: "long",
            timeZone: "Asia/Dubai",
        });
        const endDateStr = endDate.toLocaleString("en-US", {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            timeZone: "Asia/Dubai",
        });
        const endTimeStr = endDate.toLocaleString("en-US", {
            hour: "2-digit",
            minute: "numeric",
            second: "numeric",
            hour12: true,
            timeZone: "Asia/Dubai",
        });
        const endFormattedDate = `${endDay}, ${endDateStr}, ${endTimeStr}`;
        const successMessage = `Scheduled notifications check completed at: ${endFormattedDate}\n`;

        fs.appendFileSync(LOG_FILE, successMessage);

    } catch (error) {
        const errorMessage = `Error checking scheduled notifications: ${error.message}\n`;
        fs.appendFileSync(LOG_FILE, errorMessage);
        throw error;
    }
}

module.exports = sendScheduledNotifications;
