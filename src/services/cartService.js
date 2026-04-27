const Cart = require("../models/Cart");
const Category = require("../models/Category");
const Product = require("../models/Product");

const logger = require("../utilities/logger");
const GIFT_THRESHOLD_DEFAULT_AED = 400;
const GIFT_MIN_STOCK = 5;

async function getCategoryNameById(id) {
  try {
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });
    if (!categoryDoc) return "";
    const item = categoryDoc.search_categoriesList.find((cat) => cat.id === id);
    if (!item) return "";
    return item.name.split(/\s*\/\s*/)[0];
  } catch (error) {
    logger.error({ err: error }, "Error fetching category name:");
    return "";
  }
}

/**
 * Build an id→name map from the Category singleton in one query.
 * Returns an empty Map if the collection is empty or on error.
 */
async function buildCategoryMap() {
  try {
    const categoryDoc = await Category.findOne().select("search_categoriesList").lean();
    if (!categoryDoc || !Array.isArray(categoryDoc.search_categoriesList)) return new Map();
    return new Map(
      categoryDoc.search_categoriesList.map((cat) => [
        cat.id,
        cat.name.split(/\s*\/\s*/)[0],
      ])
    );
  } catch (error) {
    logger.error({ err: error }, "Error building category map:");
    return new Map();
  }
}

async function getGiftProductInfo() {
  const giftProduct = await Product.findOne({
    isGift: true,
    $or: [{ status: { $exists: false } }, { status: true }],
  })
    .select("totalQty product variantsData _id giftVariantId giftThreshold")
    .lean();

  if (!giftProduct) return null;

  const giftStock = giftProduct.totalQty ?? 0;
  const threshold =
    giftProduct.giftThreshold != null
      ? Number(giftProduct.giftThreshold)
      : GIFT_THRESHOLD_DEFAULT_AED;

  return {
    product: giftProduct,
    stock: giftStock,
    inStock: giftStock >= GIFT_MIN_STOCK,
    threshold,
    id: giftProduct._id?.toString() || "",
  };
}

/**
 * Get user's cart with enriched items.
 * @param {string} userId
 * @param {{ includeGiftLogic?: boolean }} options
 * @returns {Promise<object>} Cart data
 */
async function getCart(userId, options = {}) {
  const { includeGiftLogic = false } = options;

  // Inclusion projection: only the fields the Flutter app actually reads.
  // Cart/checkout use: product.id, product.productDetails.{name,images,description},
  // variantsData, totalQty. Everything else (variants, suppliers, composite_bom,
  // product_codes, attributes, webhook, etc.) is Lightspeed-internal and unused.
  const CART_PRODUCT_SELECT = "_id product.id product.name product.images product.description product.product_type_id variantsData totalQty";

  // Pin to primary — cart is always read immediately after a write (add/remove/qty change).
  // Reading from a secondary risks replication lag making the cart appear stale or empty.
  const cart = await Cart.findOne({ user: userId }).read('primary').populate("items.product", CART_PRODUCT_SELECT);

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

  // Build category map once (single DB query) instead of one query per cart item.
  const categoryMap = await buildCategoryMap();

  const enrichedItems = cart.items.map((item) => {
    const product = item.product?.product;
    const category_id = product?.product_type_id || null;
    const category_name = category_id ? (categoryMap.get(category_id) || null) : null;

    const unitPrice = Number(item.variantPrice || 0);
    const itemSubtotal = unitPrice * (item.quantity || 0);
    const productIdStr = item.product?._id?.toString() || "";

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

  // Gift logic (mobile)
  const cartSubtotal = enrichedItems.reduce(
    (sum, item) => sum + (item.itemSubtotal || 0),
    0
  );
  const gift = await getGiftProductInfo();
  const giftProductInStock = gift ? gift.inStock : false;
  const giftThresholdAED = gift ? gift.threshold : GIFT_THRESHOLD_DEFAULT_AED;
  const GIFT_PRODUCT_ID_STR = gift ? gift.id : "";

  const giftItemsInCart = enrichedItems.filter(
    (i) => i.productIdStr === GIFT_PRODUCT_ID_STR
  );

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
    const giftName = gift.product?.product?.name || "Gift";
    promoMessage = `Thank you for shopping with us. As your order is AED ${giftThresholdAED} or more, you will receive ${giftName} as a gift.`;
    if (giftItemsInCart.length === 0) {
      giftAdded = true;
      const variants = Array.isArray(gift.product.variantsData)
        ? gift.product.variantsData
        : [];
      const selectedVariant = gift.product.giftVariantId
        ? variants.find((v) => v.id === gift.product.giftVariantId)
        : variants[0];
      const variantQty = selectedVariant ? Number(selectedVariant.qty) : 0;
      if (variantQty >= 1) {
        const p = gift.product.product || {};
        const firstImg = p?.images?.[0];
        const imgUrl =
          firstImg?.sizes?.original || firstImg?.url || p?.image?.url || "";
        cartWithGiftFlag.push({
          product: p?.id || gift.product._id?.toString() || "",
          quantity: 1,
          product_type_id: p?.product_type_id || null,
          image: imgUrl,
          name: p?.name || "Gift",
          originalPrice: "0",
          productId: p?.id || "",
          totalAvailableQty: String(variantQty),
          variantId:
            selectedVariant?.id || gift.product._id?.toString() || "",
          variantName: selectedVariant?.name || "Default",
          variantPrice: "0",
          isGiftWithPurchase: true,
          price: "0",
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

/**
 * Add item to cart.
 * @param {string} userId
 * @param {object} itemData
 * @param {{ validateVariantQty?: boolean }} options
 */
async function addToCart(userId, itemData, options = {}) {
  const { validateVariantQty = false } = options;
  const {
    product_id,
    product_type_id,
    qty,
    p_image,
    p_name,
    p_originalPrice,
    p_id,
    p_totalAvailableQty,
    variantId,
    variantName,
    variantPrice,
  } = itemData;

  if (!product_id) throw { status: 400, message: "product_id is required" };
  const quantity = Number(qty) || 1;
  if (quantity < 1) throw { status: 400, message: "Valid quantity is required" };

  const product = await Product.findOne({
    _id: product_id,
    $or: [{ status: { $exists: false } }, { status: true }],
  });

  if (!product) throw { status: 404, message: "Product not found or not available" };

  if (!product.totalQty || product.totalQty < quantity) {
    throw {
      status: 400,
      message: `Insufficient quantity available. Only ${product.totalQty || 0} items available.`,
    };
  }

  if (validateVariantQty && p_totalAvailableQty && quantity > p_totalAvailableQty) {
    throw {
      status: 400,
      message: `Cannot add more than ${p_totalAvailableQty} items for this product.`,
    };
  }

  let cart = await Cart.findOne({ user: userId }).read('primary');

  const newItem = {
    product: product_id,
    product_type_id,
    quantity,
    image: p_image,
    name: p_name,
    originalPrice: p_originalPrice,
    productId: p_id,
    totalAvailableQty: p_totalAvailableQty,
    variantId,
    variantName,
    variantPrice,
  };

  if (!cart) {
    cart = new Cart({ user: userId, items: [newItem] });
  } else {
    const existing = cart.items.find(
      (i) => i.product.toString() === product_id && i.variantId === variantId
    );

    if (existing) {
      const newTotalQty = existing.quantity + quantity;
      if (newTotalQty > product.totalQty) {
        const remaining = product.totalQty - existing.quantity;
        throw {
          status: 400,
          message:
            remaining <= 0
              ? `You have reached the maximum available quantity of ${product.totalQty}.`
              : `Only ${remaining} more items left in stock.`,
          cartCount: cart.items.length,
          cart: cart.items,
        };
      }

      if (validateVariantQty && p_totalAvailableQty && newTotalQty > p_totalAvailableQty) {
        const remaining = p_totalAvailableQty - existing.quantity;
        throw {
          status: 400,
          message:
            remaining <= 0
              ? `You have reached the maximum available quantity of ${p_totalAvailableQty}.`
              : `Only ${remaining} more items left in stock.`,
        };
      }

      existing.quantity = newTotalQty;
    } else {
      cart.items.push(newItem);
    }
  }

  await cart.save();
  return { cartCount: cart.items.length, cart: cart.items };
}

/**
 * Remove item from cart.
 */
async function removeFromCart(userId, productId) {
  if (!productId) throw { status: 400, message: "product_id is required" };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  if (!cart) throw { status: 404, message: "Cart not found" };

  const originalLength = cart.items.length;
  cart.items = cart.items.filter((item) => item.product.toString() !== productId);

  if (cart.items.length === originalLength) {
    throw { status: 404, message: "Product not found in cart" };
  }

  await cart.save();
  return { cartCount: cart.items.length, cart: cart.items };
}

/**
 * Increase item quantity.
 */
async function increaseQty(userId, productId, qty, options = {}) {
  const { validateAvailableQty = false } = options;

  if (!productId || !qty || qty < 1)
    throw { status: 400, message: "product_id and valid qty are required" };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  const item = cart?.items.find((i) => i.product.toString() === productId);
  if (!item) throw { status: 404, message: "Product not found in cart" };

  if (validateAvailableQty) {
    const totalAvailableQty = item.totalAvailableQty || 0;
    if (item.quantity + qty > totalAvailableQty) {
      throw {
        status: 400,
        message: `Cannot increase quantity. Maximum available quantity is ${totalAvailableQty}.`,
      };
    }
  }

  item.quantity += qty;
  await cart.save();
  return { cart: cart.items };
}

/**
 * Decrease item quantity.
 */
async function decreaseQty(userId, productId, qty) {
  if (!productId || !qty || qty < 1)
    throw { status: 400, message: "product_id and valid qty are required" };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  const item = cart?.items.find((i) => i.product.toString() === productId);
  if (!item) throw { status: 404, message: "Product not found in cart" };

  let message;
  if (item.quantity > qty) {
    item.quantity -= qty;
    message = `Quantity decreased by ${qty}`;
  } else {
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    message = "Product removed from cart";
  }

  await cart.save();
  return { cart: cart.items, message };
}

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  increaseQty,
  decreaseQty,
  getCategoryNameById,
  getGiftProductInfo,
};
