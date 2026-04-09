const EmailConfig = require("../models/EmailConfig");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getConfig() {
  let emailConfig = await EmailConfig.findOne({ isActive: true });

  if (!emailConfig) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const ccMailsRaw = process.env.CC_MAILS || "";
    const ccEmails = ccMailsRaw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    emailConfig = await EmailConfig.create({
      adminEmail: adminEmail || "admin@example.com",
      ccEmails,
      isActive: true,
    });
  }

  return emailConfig;
}

async function updateConfig({ adminEmail, ccEmails }) {
  if (!adminEmail) {
    throw { status: 400, message: "adminEmail is required" };
  }

  if (!EMAIL_REGEX.test(adminEmail)) {
    throw { status: 400, message: "Invalid admin email format" };
  }

  if (ccEmails && Array.isArray(ccEmails)) {
    for (const email of ccEmails) {
      if (!EMAIL_REGEX.test(email)) {
        throw { status: 400, message: `Invalid CC email format: ${email}` };
      }
    }
  }

  let emailConfig = await EmailConfig.findOne({ isActive: true });

  if (emailConfig) {
    emailConfig.adminEmail = adminEmail;
    if (ccEmails !== undefined) {
      emailConfig.ccEmails = ccEmails;
    }
    await emailConfig.save();
  } else {
    emailConfig = await EmailConfig.create({
      adminEmail,
      ccEmails: ccEmails || [],
      isActive: true,
    });
  }

  return emailConfig;
}

async function syncFromEnv() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const ccMailsRaw = process.env.CC_MAILS || "";
  const ccEmails = ccMailsRaw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  let emailConfig = await EmailConfig.findOne({ isActive: true });

  if (emailConfig) {
    emailConfig.adminEmail = adminEmail || emailConfig.adminEmail;
    emailConfig.ccEmails = ccEmails.length > 0 ? ccEmails : emailConfig.ccEmails;
    await emailConfig.save();
  } else {
    emailConfig = await EmailConfig.create({
      adminEmail: adminEmail || "admin@example.com",
      ccEmails,
      isActive: true,
    });
  }

  return emailConfig;
}

module.exports = {
  getConfig,
  updateConfig,
  syncFromEnv,
};
