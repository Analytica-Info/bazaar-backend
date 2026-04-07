const Cart = require("../../models/Cart");
const Category = require("../../models/Category");
const Product = require("../../models/Product");

exports.getCart = async (req, res) => {
  const user_id = req.user._id;
  try {
    const cart = await Cart.findOne({ user: user_id }).populate(
      "items.product"
    );

    if (!cart) {
      return res.status(200).json({ success: true, cartCount: 0, cart: [] });
    }

    const enrichedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.product.product;
        const category_id = product?.product_type_id || null;

        let category_name = null;
        if (category_id) {
          category_name = await getCategoryNameById(category_id);
        }

        return {
          ...item.toObject(),
          category_id,
          category_name,
        };
      })
    );

    res.status(200).json({
      success: true,
      cartCount: enrichedItems.length,
      cart: enrichedItems,
    });
  } catch (err) {
    console.error("Error fetching cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.addToCart = async (req, res) => {
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
  } = req.body;

  const user_id = req.user._id;

  if (!product_id) {
    return res
      .status(400)
      .json({ success: false, message: "product_id is required" });
  }

  try {
    const product = await Product.findById(product_id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let cart = await Cart.findOne({ user: user_id });
    const quantity = Number(qty) || 1;

    if (quantity > product.totalQty) {
      return res.status(400).json({
        success: false,
        message: `Cannot add more than ${product.totalQty} items for this product. Available quantity: ${product.totalQty}`,
      });
    }

    if (quantity > p_totalAvailableQty) {
      return res.status(400).json({
        success: false,
        message: `Cannot add more than ${p_totalAvailableQty} items for this product.`,
      });
    }

    const newItem = {
      product: product_id,
      product_type_id,
      quantity: quantity,
      image: p_image,
      name: p_name,
      originalPrice: p_originalPrice,
      productId: p_id,
      totalAvailableQty: p_totalAvailableQty,
      variantId: variantId,
      variantName: variantName,
      variantPrice: variantPrice,
    };

    if (!cart) {
      cart = new Cart({
        user: user_id,
        items: [newItem],
      });
    } else {
      const existingItemIndex = cart.items.findIndex(
        (i) => i.product.toString() === product_id && i.variantId === variantId
      );

      if (existingItemIndex !== -1) {
        const existingQty = cart.items[existingItemIndex].quantity;
        const newTotalQty = existingQty + quantity;

        if (newTotalQty > product.totalQty) {
          const remainingQty = product.totalQty - existingQty;
          if (remainingQty <= 0) {
            return res.status(400).json({
              success: false,
              message: `You have reached the maximum available quantity of ${product.totalQty}.`,
            });
          } else {
            return res.status(400).json({
              success: false,
              message: `Only ${remainingQty} more items left in stock.`,
            });
          }
        }

        const remainingQty = p_totalAvailableQty - existingQty;
        if (newTotalQty > p_totalAvailableQty) {
          if (remainingQty <= 0) {
            return res.status(400).json({
              success: false,
              message: `You have reached the maximum available quantity of ${p_totalAvailableQty}.`,
            });
          } else {
            return res.status(400).json({
              success: false,
              message: `Only ${remainingQty} more items left in stock.`,
            });
          }
        }

        cart.items[existingItemIndex].quantity = newTotalQty;
      } else {
        cart.items.push(newItem);
      }
    }

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Product added/updated in cart",
      cartCount: cart.items.length,
      cart: cart.items,
    });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.removeFromCart = async (req, res) => {
  const { product_id } = req.body;
  const user_id = req.user._id;

  if (!product_id) {
    return res
      .status(400)
      .json({ success: false, message: "product_id is required" });
  }

  try {
    const cart = await Cart.findOne({ user: user_id });
    if (!cart)
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });

    const originalLength = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.product.toString() !== product_id
    );

    if (cart.items.length === originalLength) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in cart" });
    }

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Product removed from cart",
      cartCount: cart.items.length,
      cart: cart.items,
    });
  } catch (err) {
    console.error("Error removing from cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.increaseCartQty = async (req, res) => {
  const { product_id, qty } = req.body;
  const user_id = req.user._id;

  if (!product_id || !qty || qty < 1) {
    return res.status(400).json({
      success: false,
      message: "product_id and valid qty are required",
    });
  }

  try {
    const cart = await Cart.findOne({ user: user_id });
    const item = cart?.items.find((i) => i.product.toString() === product_id);

    if (!item) {
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    // Assuming totalAvailableQty is accessible on item or product sub-document
    const totalAvailableQty = item.totalAvailableQty || 0; 

    if (item.quantity + qty > totalAvailableQty) {
      return res.status(400).json({
        success: false,
        message: `Cannot increase quantity. Maximum available quantity is ${totalAvailableQty}.`,
      });
    }

    item.quantity += qty;
    await cart.save();

    res.status(200).json({
      success: true,
      message: `Quantity increased by ${qty}`,
      cart: cart.items,
    });
  } catch (err) {
    console.error("Error increasing quantity:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.decreaseCartQty = async (req, res) => {
  const { product_id, qty } = req.body;
  const user_id = req.user._id;

  if (!product_id || !qty || qty < 1) {
    return res.status(400).json({
      success: false,
      message: "product_id and valid qty are required",
    });
  }

  try {
    const cart = await Cart.findOne({ user: user_id });
    const item = cart?.items.find((i) => i.product.toString() === product_id);

    if (!item) {
      return res.status(404).json({ success: false, message: "Product not found in cart" });
    }

    // Minimum quantity is 1, so error if try to decrease below 1 not removing
    if (item.quantity <= qty && item.quantity > 1) {
      return res.status(400).json({
        success: false,
        message: `Minimum quantity of 1 must be maintained for this product.`,
      });
    }

    if (item.quantity > qty) {
      item.quantity -= qty;
    } else {
      // If qty to reduce is equal or more than current quantity, remove product from cart
      cart.items = cart.items.filter((i) => i.product.toString() !== product_id);
    }

    await cart.save();

    res.status(200).json({
      success: true,
      message: item.quantity > qty ? `Quantity decreased by ${qty}` : "Product removed from cart",
      cart: cart.items,
    });
  } catch (err) {
    console.error("Error decreasing quantity:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


async function getCategoryNameById(id) {
  try {
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });

    if (!categoryDoc) {
      return res.status(404).json({ message: "Category ID not found" });
    }

    const item = categoryDoc.search_categoriesList.find((cat) => cat.id === id);

    if (!item) {
      return res
        .status(404)
        .json({ message: "ID found in doc but not in array" });
    }

    const mainCategory = item.name.split(/\s*\/\s*/)[0];
    return mainCategory;
  } catch (error) {
    console.error("Error fetching category name:", error);
    return "";
  }
}
