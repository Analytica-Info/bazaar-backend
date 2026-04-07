const BankPromoCode = require("../models/BankPromoCode");
const BankPromoCodeUsage = require("../models/BankPromoCodeUsage");

async function enrichPromo(promo) {
  const doc = promo.toObject ? promo.toObject() : promo;
  const uniqueCustomers = await BankPromoCodeUsage.countDocuments({
    bankPromoCodeId: doc._id,
  });
  return {
    ...doc,
    uniqueCustomers,
    expiryDate: doc.expiryDate
      ? new Date(doc.expiryDate).toISOString().split("T")[0]
      : null,
  };
}

async function list() {
  const promos = await BankPromoCode.find().sort({ createdAt: -1 });
  return Promise.all(promos.map(enrichPromo));
}

async function create(data) {
  const { code, discountPercent, capAED, expiryDate, allowedBank } = data;

  if (!code || discountPercent == null || capAED == null || !expiryDate || !allowedBank) {
    throw {
      status: 400,
      message: "code, discountPercent, capAED, expiryDate, and allowedBank are required",
    };
  }

  const normalizedCode = code.toUpperCase().trim();

  const duplicate = await BankPromoCode.findOne({
    code: normalizedCode,
    active: true,
  });
  if (duplicate) {
    throw { status: 400, message: "An active promo code with this code already exists" };
  }

  const promo = await BankPromoCode.create({
    ...data,
    code: normalizedCode,
  });

  return enrichPromo(promo);
}

async function getById(id) {
  const promo = await BankPromoCode.findById(id);
  if (!promo) {
    throw { status: 404, message: "Promo code not found" };
  }
  return enrichPromo(promo);
}

async function update(id, data) {
  const promo = await BankPromoCode.findById(id);
  if (!promo) {
    throw { status: 404, message: "Promo code not found" };
  }

  if (data.code !== undefined) {
    const normalizedCode = data.code.toUpperCase().trim();
    if (normalizedCode !== promo.code) {
      const duplicate = await BankPromoCode.findOne({
        code: normalizedCode,
        active: true,
        _id: { $ne: id },
      });
      if (duplicate) {
        throw { status: 400, message: "An active promo code with this code already exists" };
      }
      promo.code = normalizedCode;
    }
  }

  if (data.discountPercent !== undefined) promo.discountPercent = data.discountPercent;
  if (data.capAED !== undefined) promo.capAED = data.capAED;
  if (data.expiryDate !== undefined) promo.expiryDate = data.expiryDate;
  if (data.allowedBank !== undefined) promo.allowedBank = data.allowedBank;
  if (data.singleUsePerCustomer !== undefined) promo.singleUsePerCustomer = data.singleUsePerCustomer;
  if (data.exclusive !== undefined) promo.exclusive = data.exclusive;
  if (data.binRanges !== undefined) promo.binRanges = data.binRanges;

  await promo.save();
  return enrichPromo(promo);
}

async function toggleActive(id) {
  const promo = await BankPromoCode.findById(id);
  if (!promo) {
    throw { status: 404, message: "Promo code not found" };
  }

  if (promo.active) {
    promo.active = false;
  } else {
    const duplicate = await BankPromoCode.findOne({
      code: promo.code,
      active: true,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw {
        status: 400,
        message: "Another active promo code with the same code already exists",
      };
    }
    promo.active = true;
  }

  await promo.save();
  return enrichPromo(promo);
}

async function remove(id) {
  const promo = await BankPromoCode.findByIdAndDelete(id);
  if (!promo) {
    throw { status: 404, message: "Promo code not found" };
  }

  await BankPromoCodeUsage.deleteMany({ bankPromoCodeId: id });
  return {};
}

module.exports = {
  list,
  create,
  getById,
  update,
  toggleActive,
  remove,
};
