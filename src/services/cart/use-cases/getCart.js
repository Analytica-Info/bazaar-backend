'use strict';

const Cart = require('../../../repositories').carts.rawModel();
const { buildCategoryMap } = require('../domain/categoryMap');
const { getGiftProductInfo, GIFT_THRESHOLD_DEFAULT_AED } = require('../domain/giftProduct');

const CART_PRODUCT_SELECT = '_id product.id product.name product.images product.description product.product_type_id variantsData totalQty';

/**
 * Get user's cart with enriched items.
 * @param {string} userId
 * @param {{ includeGiftLogic?: boolean }} options
 */
async function getCart(userId, options = {}) {
  const { includeGiftLogic = false } = options;

  const cart = await Cart.findOne({ user: userId }).read('primary').populate('items.product', CART_PRODUCT_SELECT);

  if (!cart) {
    if (includeGiftLogic) {
      const gift = await getGiftProductInfo();
      return {
        cartCount: 0,
        cart: [],
        cartSubtotal: 0,
        giftEligible: false,
        giftAdded: false,
        giftProductInStock: gift ? gift.inStock : false,
        promoMessage: gift
          ? `Add more items to your cart to reach AED ${gift.threshold} and become eligible for a free gift.`
          : null,
      };
    }
    return { cartCount: 0, cart: [] };
  }

  const categoryMap = await buildCategoryMap();

  const enrichedItems = cart.items.map((item) => {
    const product = item.product?.product;
    const category_id = product?.product_type_id || null;
    const category_name = category_id ? (categoryMap.get(category_id) || null) : null;

    const unitPrice = Number(item.variantPrice || 0);
    const itemSubtotal = unitPrice * (item.quantity || 0);
    const productIdStr = item.product?._id?.toString() || '';

    return {
      ...item.toObject(),
      category_id,
      category_name,
      unitPrice,
      itemSubtotal,
      productIdStr,
    };
  });

  if (!includeGiftLogic) {
    return {
      cartCount: enrichedItems.length,
      cart: enrichedItems.map(({ unitPrice, itemSubtotal, productIdStr, ...rest }) => rest),
    };
  }

  const cartSubtotal = enrichedItems.reduce((sum, item) => sum + (item.itemSubtotal || 0), 0);
  const gift = await getGiftProductInfo();
  const giftProductInStock = gift ? gift.inStock : false;
  const giftThresholdAED = gift ? gift.threshold : GIFT_THRESHOLD_DEFAULT_AED;
  const GIFT_PRODUCT_ID_STR = gift ? gift.id : '';

  const giftItemsInCart = enrichedItems.filter((i) => i.productIdStr === GIFT_PRODUCT_ID_STR);

  let giftMarkedCount = 0;
  const cartWithGiftFlag = enrichedItems.map((item) => {
    const isGiftProduct = item.productIdStr === GIFT_PRODUCT_ID_STR;
    let isGiftWithPurchase = false;
    let displayPrice = Number(item.variantPrice || 0);

    if (isGiftProduct && cartSubtotal >= giftThresholdAED && giftProductInStock) {
      giftMarkedCount += 1;
      if (giftMarkedCount === 1) {
        isGiftWithPurchase = true;
        displayPrice = 0;
      }
    }

    const { unitPrice, itemSubtotal, productIdStr, ...rest } = item;
    return {
      ...rest,
      isGiftWithPurchase,
      price: String(displayPrice),
      variantPrice: String(displayPrice),
    };
  });

  let giftAdded = false;
  let promoMessage = null;

  if (cartSubtotal < giftThresholdAED) {
    promoMessage = `Add more items to your cart to reach AED ${giftThresholdAED} and become eligible for a free gift.`;
  } else if (giftProductInStock && gift) {
    const giftName = gift.product?.product?.name || 'Gift';
    promoMessage = `Thank you for shopping with us. As your order is AED ${giftThresholdAED} or more, you will receive ${giftName} as a gift.`;
    if (giftItemsInCart.length === 0) {
      giftAdded = true;
      const variants = Array.isArray(gift.product.variantsData) ? gift.product.variantsData : [];
      const selectedVariant = gift.product.giftVariantId
        ? variants.find((v) => v.id === gift.product.giftVariantId)
        : variants[0];
      const variantQty = selectedVariant ? Number(selectedVariant.qty) : 0;
      if (variantQty >= 1) {
        const p = gift.product.product || {};
        const firstImg = p?.images?.[0];
        const imgUrl = firstImg?.sizes?.original || firstImg?.url || p?.image?.url || '';
        cartWithGiftFlag.push({
          product: p?.id || gift.product._id?.toString() || '',
          quantity: 1,
          product_type_id: p?.product_type_id || null,
          image: imgUrl,
          name: p?.name || 'Gift',
          originalPrice: '0',
          productId: p?.id || '',
          totalAvailableQty: String(variantQty),
          variantId: selectedVariant?.id || gift.product._id?.toString() || '',
          variantName: selectedVariant?.name || 'Default',
          variantPrice: '0',
          isGiftWithPurchase: true,
          price: '0',
          category_id: null,
          category_name: null,
          fullProduct: gift.product,
        });
      }
    } else {
      giftAdded = cartWithGiftFlag.some((i) => i.isGiftWithPurchase);
    }
  }

  return {
    cartCount: cartWithGiftFlag.length,
    cart: cartWithGiftFlag,
    cartSubtotal: Math.round(cartSubtotal * 100) / 100,
    giftEligible: cartSubtotal >= giftThresholdAED,
    giftAdded,
    giftProductInStock,
    promoMessage,
  };
}

module.exports = { getCart };
