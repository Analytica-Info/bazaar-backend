const contactService = require("../../services/contactService");
const path = require('path');

exports.contactUs = async (req, res) => {
    try {
        const { email, name, subject, message, phone } = req.body;

        const successMessage = await contactService.submitContactForm({ email, name, subject, message, phone });

        res.status(200).json({
            message: successMessage,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: "Server error" });
    }
};

exports.submitFeedback = async (req, res) => {
    try {
        const { name, feedback } = req.body;
        const userEmail = req.user?.email;

        const successMessage = await contactService.submitFeedback({ name, feedback, userEmail });

        res.status(200).json({
            message: successMessage,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error("Feedback submission error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.downloadFile = async (req, res) => {
    try {
        const relativePath = req.query.url;
        const uploadsDir = path.join(__dirname, '../../uploads');

        const fullPath = contactService.downloadFile(relativePath, uploadsDir);

        res.download(fullPath, (err) => {
            if (err) {
                console.error("Download error:", err);
                res.status(500).send("Failed to download file.");
            }
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).send(error.message);
        }
        console.error("Download error:", error);
        res.status(500).send("Failed to download file.");
    }
};

exports.createMobileAppLog = async (req, res) => {
    try {
        const { user_name, mobile_device, app_version, email, issue_message, activity_name } = req.body;

        const result = await contactService.createMobileAppLog({
            user_name,
            mobile_device,
            app_version,
            email,
            issue_message,
            activity_name,
        });

        res.status(200).json({
            success: true,
            message: "Log created successfully",
            log_id: result.logId
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Error creating mobile app log:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};
