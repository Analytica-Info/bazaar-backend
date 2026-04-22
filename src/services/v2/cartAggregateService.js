/**
 * Cart aggregate service (v2).
 *
 * Combines the user's cart, available coupons, and applicable bank
 * promos into one response so the Cart screen loads with a single
 * round-trip. Free-shipping config is surfaced so the mobile client
 * doesn't have to hardcode a threshold.
 */
const cartService = require("../cartService");
const couponService = require("../couponService");

// Free-shipping threshold (AED). Hardcoded here today — when/if a
// config endpoint lands, read it from there. Kept on backend so a
// policy change doesn't require a mobile app release.
const FREE_SHIPPING_THRESHOLD_AED = 200;
const DEFAULT_SHIPPING_AED = 30;

async function getCartSummary({ user }) {
  const cart = await cartService.getCart(user._id).catch(() => null);
  const items = _normaliseItems(cart);

  const subtotal = items.reduce(
    (sum, it) => sum + (it.price || 0) * (it.quantity || 1),
    0,
  );
  const qualifiesForFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD_AED;
  const shipping = qualifiesForFreeShipping ? 0 : DEFAULT_SHIPPING_AED;

  const coupons = await couponService
    .getCoupons()
    .catch(() => [])
    .then((r) => (Array.isArray(r) ? r : r?.coupons || []));

  return {
    items,
    summary: {
      itemCount: items.reduce((s, i) => s + (i.quantity || 0), 0),
      distinctItemCount: items.length,
      subtotal,
      shipping,
      total: subtotal + shipping,
      savings: items.reduce(
        (sum, it) =>
          sum +
          Math.max(0, ((it.originalPrice || it.price) - it.price)) *
            (it.quantity || 1),
        0,
      ),
    },
    freeShipping: {
      threshold: FREE_SHIPPING_THRESHOLD_AED,
      remaining: Math.max(0, FREE_SHIPPING_THRESHOLD_AED - subtotal),
      qualifies: qualifiesForFreeShipping,
    },
    availableCoupons: (coupons || [])
      .filter((c) => c && c.code)
      .map((c) => ({
        code: c.code,
        benefit: c.benefit || c.description || '',
        minOrder: c.minOrder || c.min || 0,
        expiresAt: c.expiresAt || c.validUntil || null,
      })),
    // Bank promos are configured but not all backends ship them —
    // return an empty list if the service isn't available so the UI
    // just hides the section.
    bankPromos: await _safeBankPromos(),
  };
}

async function _safeBankPromos() {
  try {
    const svc = require("../bankPromoCodeService");
    if (typeof svc.listActive !== "function") return [];
    const promos = await svc.listActive();
    return (promos || []).map((p) => ({
      id: p._id || p.id,
      bank: p.bank,
      code: p.code,
      benefit: p.benefit || p.description || '',
      colorHex: p.colorHex || null,
    }));
  } catch {
    return [];
  }
}

function _normaliseItems(cart) {
  if (!cart) return [];
  // cartService.getCart returns different shapes in different codepaths.
  const raw = cart.items || cart.cartItems || cart.cart || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const product = it.product || it.productData || it;
      const id = product?._id || product?.id || it._id;
      if (!id) return null;
      const price = _num(
        product.discountedPrice ||
          product.price ||
          product.variantsData?.[0]?.price ||
          product.product?.price_standard?.tax_inclusive,
      );
      const originalPrice = _num(
        product.originalPrice ||
          product.product?.price_standard?.tax_inclusive,
      );
      return {
        _id: String(id),
        name:
          product.name ||
          product.product?.name ||
          it.name ||
          'Unknown item',
        brand: product.brand || product.product?.brand || null,
        image:
          _firstImage(product.images) ||
          _firstImage(product.product?.images) ||
          null,
        price,
        originalPrice: originalPrice > price ? originalPrice : null,
        quantity: _num(it.quantity) || 1,
        totalQty: _num(product.totalQty) || null,
        condition: product.condition || product.product?.condition || null,
        variantId:
          it.variantId || product.variantsData?.[0]?.id || null,
      };
    })
    .filter(Boolean);
}

function _num(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const parsed = parseFloat(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function _firstImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (typeof first === "string") return first;
  if (first?.sizes) {
    return first.sizes.original || first.sizes.large || first.sizes.medium;
  }
  return first?.url || first?.src || null;
}

module.exports = { getCartSummary };
