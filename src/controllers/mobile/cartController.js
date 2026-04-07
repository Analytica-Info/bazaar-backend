const Cart = require("../../models/Cart");
const Category = require("../../models/Category");
const Product = require("../../models/Product");

const GIFT_THRESHOLD_DEFAULT_AED = 400;
const GIFT_MIN_STOCK = 5;

exports.getCart = async (req, res) => {
    const user_id = req.user._id;
    try {
        const cart = await Cart.findOne({ user: user_id }).populate("items.product");

        const giftProductQuery = {
            isGift: true,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
        };

        if (!cart) {
            const giftProduct = await Product.findOne(giftProductQuery)
                .select("totalQty product variantsData giftThreshold")
                .lean();
            const giftStock = giftProduct?.totalQty ?? 0;
            const thresholdAED = giftProduct?.giftThreshold != null ? Number(giftProduct.giftThreshold) : GIFT_THRESHOLD_DEFAULT_AED;
            return res.status(200).json({
                success: true,
                cartCount: 0,
                cart: [],
                cartSubtotal: 0,
                giftEligible: false,
                giftAdded: false,
                giftProductInStock: giftStock >= GIFT_MIN_STOCK,
                promoMessage: `Add more items to your cart to reach AED ${thresholdAED} and become eligible for a free gift.`,
            });
        }

        const enrichedItems = await Promise.all(
            cart.items.map(async (item) => {
                const product = item.product?.product;
                const category_id = product?.product_type_id || null;

                let category_name = null;
                if (category_id) {
                    category_name = await getCategoryNameById(category_id);
                }

                const unitPrice = Number(item.variantPrice || 0);
                const itemSubtotal = unitPrice * (item.quantity || 0);
                const productIdStr = item.product?._id?.toString?.() || "";

                return {
                    ...item.toObject(),
                    category_id,
                    category_name,
                    unitPrice,
                    itemSubtotal,
                    productIdStr,
                };
            })
        );

        const cartSubtotal = enrichedItems.reduce((sum, item) => sum + (item.itemSubtotal || 0), 0);
        const giftProduct = await Product.findOne(giftProductQuery)
            .select("totalQty product variantsData _id giftVariantId giftThreshold")
            .lean();
        const giftStock = giftProduct?.totalQty ?? 0;
        const giftProductInStock = giftStock >= GIFT_MIN_STOCK;
        const GIFT_PRODUCT_ID_STR = giftProduct?._id?.toString?.() || "";
        const giftThresholdAED = giftProduct?.giftThreshold != null ? Number(giftProduct.giftThreshold) : GIFT_THRESHOLD_DEFAULT_AED;

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
        } else if (giftProductInStock && giftProduct) {
            const giftName = giftProduct?.product?.name || "Gift";
            promoMessage = `Thank you for shopping with us. As your order is AED ${giftThresholdAED} or more, you will receive ${giftName} as a gift.`;
            if (giftItemsInCart.length === 0) {
                giftAdded = true;
                const variants = Array.isArray(giftProduct.variantsData) ? giftProduct.variantsData : [];
                const selectedVariant = giftProduct?.giftVariantId
                    ? variants.find((v) => v.id === giftProduct.giftVariantId)
                    : variants[0];
                const variantQty = selectedVariant ? Number(selectedVariant.qty) : 0;
                if (variantQty >= 1) {
                    const p = giftProduct.product || {};
                    const firstImg = p?.images?.[0];
                    const imgUrl = firstImg?.sizes?.original || firstImg?.url || p?.image?.url || "";
                    const giftLine = {
                        product: p?.id || giftProduct._id?.toString?.() || "",
                        quantity: 1,
                        product_type_id: p?.product_type_id || null,
                        image: imgUrl,
                        name: p?.name || "Gift",
                        originalPrice: "0",
                        productId: p?.id || "",
                        totalAvailableQty: String(variantQty),
                        variantId: selectedVariant?.id || giftProduct._id?.toString?.() || "",
                        variantName: selectedVariant?.name || "Default",
                        variantPrice: "0",
                        isGiftWithPurchase: true,
                        price: "0",
                        category_id: null,
                        category_name: null,
                        fullProduct: giftProduct,
                    };
                    cartWithGiftFlag.push(giftLine);
                }
            } else {
                giftAdded = cartWithGiftFlag.some((i) => i.isGiftWithPurchase);
            }
        }

        res.status(200).json({
            success: true,
            cartCount: cartWithGiftFlag.length,
            cart: cartWithGiftFlag,
            cartSubtotal: Math.round(cartSubtotal * 100) / 100,
            giftEligible: cartSubtotal >= giftThresholdAED,
            giftAdded,
            giftProductInStock,
            promoMessage,
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
        variantPrice
    } = req.body;

    const user_id = req.user._id;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    if (!qty || qty < 1) {
        return res.status(400).json({ success: false, message: "Valid quantity is required" });
    }

    try {
        const product = await Product.findOne({
            _id: product_id,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ]
        });

        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found or not available" 
            });
        }

        if (!product.totalQty || product.totalQty < qty) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient quantity available. Only ${product.totalQty || 0} items available.` 
            });
        }

        let cart = await Cart.findOne({ user: user_id });

        const newItem = {
            product: product_id,
            product_type_id: product_type_id,
            quantity: qty,
            image: p_image,
            name: p_name,
            originalPrice: p_originalPrice,
            productId: p_id,
            totalAvailableQty: p_totalAvailableQty,
            variantId: variantId,
            variantName: variantName,
            variantPrice: variantPrice
        };

        if (!cart) {
            cart = new Cart({
                user: user_id,
                items: [newItem]
            });
        } else {
            const exists = cart.items.find(
                i =>
                    i.product.toString() === product_id &&
                    i.variantId === variantId
            );

            if (exists) {
                const newTotalQty = exists.quantity + qty;
                if (newTotalQty > product.totalQty) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot add more items. Only ${product.totalQty - exists.quantity} more items available.`,
                        cartCount: cart.items.length,
                        cart: cart.items
                    });
                }
                exists.quantity = newTotalQty;
            } else {
                cart.items.push(newItem);
            }
        }

        await cart.save();

        res.status(200).json({
            success: true,
            message: "Product added to cart",
            cartCount: cart.items.length,
            cart: cart.items
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
        return res.status(400).json({ success: false, message: "product_id is required" });
    }
  
    try {
        const cart = await Cart.findOne({ user: user_id });
        if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });
    
        const originalLength = cart.items.length;
        cart.items = cart.items.filter(item => item.product.toString() !== product_id);
    
        if (cart.items.length === originalLength) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }
    
        await cart.save();
    
        res.status(200).json({
            success: true,
            message: "Product removed from cart",
            cartCount: cart.items.length,
            cart: cart.items
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
        return res.status(400).json({ success: false, message: "product_id and valid qty are required" });
    }
  
    try {
        const cart = await Cart.findOne({ user: user_id });
        const item = cart?.items.find(i => i.product.toString() === product_id);
    
        if (!item) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }
    
        item.quantity += qty;
        await cart.save();
    
        res.status(200).json({
            success: true,
            message: `Quantity increased by ${qty}`,
            cart: cart.items
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
        return res.status(400).json({ success: false, message: "product_id and valid qty are required" });
    }
  
    try {
        const cart = await Cart.findOne({ user: user_id });
        const item = cart?.items.find(i => i.product.toString() === product_id);
    
        if (!item) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }
    
        if (item.quantity > qty) {
            item.quantity -= qty;
        } else {
            cart.items = cart.items.filter(i => i.product.toString() !== product_id);
        }
    
        await cart.save();
    
        res.status(200).json({
            success: true,
            message: item.quantity > qty ? `Quantity decreased by ${qty}` : "Product removed from cart",
            cart: cart.items
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
        return res.status(404).json({ message: "ID found in doc but not in array" });
    }

    const mainCategory = item.name.split(/\s*\/\s*/)[0];
    return mainCategory;

    } catch (error) {
        console.error("Error fetching category name:", error);
        return '';
    }
};