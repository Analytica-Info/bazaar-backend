const cartService = require("../../services/cartService");

exports.getCart = async (req, res) => {
  try {
    const result = await cartService.getCart(req.user._id, { includeGiftLogic: true });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Error fetching cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const result = await cartService.addToCart(req.user._id, req.body, {
      validateVariantQty: false,
    });
    res.status(200).json({ success: true, message: "Product added to cart", ...result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message, cartCount: err.cartCount, cart: err.cart });
    }
    console.error("Error adding to cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const result = await cartService.removeFromCart(req.user._id, req.body.product_id);
    res.status(200).json({ success: true, message: "Product removed from cart", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Error removing from cart:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.increaseCartQty = async (req, res) => {
  try {
    const result = await cartService.increaseQty(req.user._id, req.body.product_id, req.body.qty, {
      validateAvailableQty: false,
    });
    res.status(200).json({ success: true, message: `Quantity increased by ${req.body.qty}`, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Error increasing quantity:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.decreaseCartQty = async (req, res) => {
  try {
    const result = await cartService.decreaseQty(req.user._id, req.body.product_id, req.body.qty);
    res.status(200).json({ success: true, message: result.message, cart: result.cart });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Error decreasing quantity:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
