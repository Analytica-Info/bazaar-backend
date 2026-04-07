const transporter = require('./emailConfig');

const sendEmail = async (to, subject, html, cc = []) => {
    try {
        await transporter.sendMail({
            from: `Bazaar ${process.env.EMAIL_USERNAME}`,
            to,
            subject,
            html,
            cc: cc.join(','),
        });
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

module.exports = {
    sendEmail
};
