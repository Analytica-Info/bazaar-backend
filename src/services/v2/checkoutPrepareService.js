/**
 * Checkout prepare service (v2).
 *
 * Returns everything the redesigned Checkout screen needs on entry:
 *   - Cart (reuses cartAggregate)
 *   - User's saved addresses (embedded on the user doc)
 *   - Available payment methods (server-driven so policy changes —
 *     e.g. Tabby disabled for a market — don't require a mobile release)
 */
const cartAggregateService = require("./cartAggregateService");

/**
 * Payment methods. Policy-driven: the list the mobile app renders is
 * determined here, so toggling Apple Pay / Tabby is a backend change.
 */
function _availablePaymentMethods({ country = "AE" } = {}) {
  const methods = [
    {
      id: "cod",
      title: "Cash on Delivery",
      subtitle: "Pay when your order arrives",
      icon: "cash",
      enabled: true,
    },
    {
      id: "card",
      title: "Credit / Debit Card",
      subtitle: "Visa, Mastercard — securely via Stripe",
      icon: "card",
      enabled: true,
    },
    {
      id: "tabby",
      title: "Tabby — Pay in 4",
      subtitle: "4 interest-free instalments",
      icon: "tabby",
      enabled: country === "AE",
    },
    {
      id: "apple_pay",
      title: "Apple Pay",
      subtitle: "Double-click to pay on iPhone",
      icon: "apple_pay",
      enabled: true,
      platforms: ["ios"],
    },
  ];
  return methods.filter((m) => m.enabled);
}

async function prepare({ user }) {
  const [cartResult, addresses, methods] = await Promise.allSettled([
    cartAggregateService.getCartSummary({ user }),
    Promise.resolve(_addressesFor(user)),
    Promise.resolve(_availablePaymentMethods({ country: "AE" })),
  ]);

  return {
    cart: cartResult.status === "fulfilled"
      ? cartResult.value
      : { error: cartResult.reason?.message || "Failed to load cart" },
    addresses: addresses.status === "fulfilled" ? addresses.value : [],
    paymentMethods: methods.status === "fulfilled" ? methods.value : [],
  };
}

function _addressesFor(user) {
  const raw = user?.addresses || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    _id: a._id,
    name: a.name,
    mobile: a.mobile,
    country: a.country,
    city: a.city,
    area: a.area,
    floorNo: a.floorNo,
    apartmentNo: a.apartmentNo,
    landmark: a.landmark,
    buildingName: a.buildingName,
    isPrimary: Boolean(a.isPrimary),
  }));
}

module.exports = { prepare };
