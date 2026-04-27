/**
 * payload-audit.js
 *
 * Measures actual MongoDB document sizes for every hot consumer-facing query.
 * Connects directly to MongoDB — no Express server needed.
 *
 * Usage:
 *   node scripts/payload-audit.js
 *
 * Output: table of query → raw bytes → savings after projection
 */

require("dotenv").config();
const mongoose = require("mongoose");

// ─── helpers ────────────────────────────────────────────────────────────────

function bytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

function kb(n) {
  return (n / 1024).toFixed(1) + " KB";
}

function mb(n) {
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

function pct(before, after) {
  if (!before) return "N/A";
  const saved = ((before - after) / before) * 100;
  return saved.toFixed(0) + "% saved";
}

const rows = [];

function record(section, query, sampleSize, rawBytes, projectedBytes) {
  rows.push({ section, query, sampleSize, rawBytes, projectedBytes });
}

function printTable() {
  const COL = [45, 8, 14, 16, 13];
  const header = ["Query", "Samples", "Raw size", "Projected size", "Savings"];
  const sep = COL.map((w) => "─".repeat(w)).join("─┼─");

  console.log("\n" + "─".repeat(sep.length));
  console.log(header.map((h, i) => h.padEnd(COL[i])).join(" │ "));
  console.log(sep);

  let lastSection = "";
  for (const r of rows) {
    if (r.section !== lastSection) {
      console.log(`\n  ▸ ${r.section}`);
      lastSection = r.section;
    }
    const raw = r.rawBytes != null ? kb(r.rawBytes) : "—";
    const proj = r.projectedBytes != null ? kb(r.projectedBytes) : "—";
    const saving =
      r.rawBytes != null && r.projectedBytes != null
        ? pct(r.rawBytes, r.projectedBytes)
        : "—";
    const cols = [r.query, String(r.sampleSize), raw, proj, saving];
    console.log(cols.map((c, i) => String(c).padEnd(COL[i])).join(" │ "));
  }

  console.log("\n" + "─".repeat(sep.length));

  // totals
  const totalRaw = rows.reduce((s, r) => s + (r.rawBytes || 0), 0);
  const totalProj = rows.reduce((s, r) => s + (r.projectedBytes || 0), 0);
  console.log(`\n  Total raw payload modelled:       ${mb(totalRaw)}`);
  console.log(`  Total projected payload:          ${mb(totalProj)}`);
  console.log(`  Total savings:                    ${mb(totalRaw - totalProj)} (${pct(totalRaw, totalProj)})\n`);
}

// ─── LIST_EXCLUDE projection (matches productService LIST_EXCLUDE_SELECT) ───

const LIST_EXCLUDE = {
  "product.variants": 0,
  "product.product_codes": 0,
  "product.suppliers": 0,
  "product.composite_bom": 0,
  "product.tag_ids": 0,
  "product.attributes": 0,
  "product.account_code_sales": 0,
  "product.account_code_purchase": 0,
  "product.price_outlet": 0,
  "product.brand_id": 0,
  "product.deleted_at": 0,
  "product.version": 0,
  "product.created_at": 0,
  "product.updated_at": 0,
  "product.description": 0,
  webhook: 0,
  webhookTime: 0,
  __v: 0,
  updatedAt: 0,
};

const ANALYTICS_PROJECT = {
  "product.name": 1,
  "product.images": 1,
  discountedPrice: 1,
  originalPrice: 1,
};

const SKU_PROJECT = { "product.sku_number": 1 };

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB:", process.env.MONGO_URI.replace(/\/\/.*@/, "//***@"));

  const db = mongoose.connection.db;

  // ── 1. Product document sizes ─────────────────────────────────────────────

  const products = await db
    .collection("products")
    .find({ status: true })
    .limit(50)
    .toArray();

  if (products.length) {
    const rawTotal = products.reduce((s, p) => s + bytes(p), 0);
    const rawAvg = rawTotal / products.length;

    // Strip LIST_EXCLUDE fields in JS (same as projection)
    const excludeKeys = Object.keys(LIST_EXCLUDE);
    const stripped = products.map((p) => {
      const clone = JSON.parse(JSON.stringify(p));
      for (const key of excludeKeys) {
        const parts = key.split(".");
        if (parts.length === 1) {
          delete clone[parts[0]];
        } else {
          if (clone[parts[0]]) delete clone[parts[0]][parts[1]];
        }
      }
      return clone;
    });
    const projTotal = stripped.reduce((s, p) => s + bytes(p), 0);
    const projAvg = projTotal / stripped.length;

    // SKU only (for enrichOrdersWithDetails)
    const skuOnly = products.map((p) => ({ _id: p._id, product: { sku_number: p.product?.sku_number } }));
    const skuTotal = skuOnly.reduce((s, p) => s + bytes(p), 0);

    // Analytics projection
    const analyticsStripped = products.map((p) => ({
      _id: p._id,
      "product.name": p.product?.name,
      "product.images": p.product?.images,
      discountedPrice: p.discountedPrice,
      originalPrice: p.originalPrice,
    }));
    const analyticsTotal = analyticsStripped.reduce((s, p) => s + bytes(p), 0);

    record("Product document (avg per doc)", "Full document", products.length, rawAvg, null);
    record("Product document (avg per doc)", "LIST_EXCLUDE projection", products.length, rawAvg, projAvg);
    record("Product document (avg per doc)", "SKU only (enrichOrdersWithDetails)", products.length, rawAvg, skuTotal / products.length);
    record("Product document (avg per doc)", "Analytics (name+images+price)", products.length, rawAvg, analyticsTotal / products.length);
  }

  // ── 2. Cart — full payload simulation ────────────────────────────────────

  const carts = await db.collection("carts").find().limit(20).toArray();
  if (carts.length) {
    const cartProductIds = carts.flatMap((c) =>
      (c.items || []).map((i) => i.product).filter(Boolean)
    );
    const uniqueIds = [...new Set(cartProductIds.map(String))].slice(0, 100);
    const objectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));

    const cartProducts = await db
      .collection("products")
      .find({ _id: { $in: objectIds } })
      .toArray();

    if (cartProducts.length) {
      const rawTotal = cartProducts.reduce((s, p) => s + bytes(p), 0);
      const avgPerItem = rawTotal / cartProducts.length;
      const avgCartSize = carts.reduce((s, c) => s + (c.items || []).length, 0) / carts.length;

      // Projected (LIST_EXCLUDE)
      const excludeKeys = Object.keys(LIST_EXCLUDE);
      const stripped = cartProducts.map((p) => {
        const clone = JSON.parse(JSON.stringify(p));
        for (const key of excludeKeys) {
          const parts = key.split(".");
          if (parts.length === 1) delete clone[parts[0]];
          else if (clone[parts[0]]) delete clone[parts[0]][parts[1]];
        }
        return clone;
      });
      const projAvgPerItem = stripped.reduce((s, p) => s + bytes(p), 0) / stripped.length;

      record(
        "Cart (avg cart × avg items)",
        `Full product per cart item`,
        cartProducts.length,
        avgPerItem * avgCartSize,
        null
      );
      record(
        "Cart (avg cart × avg items)",
        `LIST_EXCLUDE projection`,
        cartProducts.length,
        avgPerItem * avgCartSize,
        projAvgPerItem * avgCartSize
      );
    }
  }

  // ── 3. Wishlist ───────────────────────────────────────────────────────────

  const wishlists = await db.collection("wishlists").find().limit(20).toArray();
  if (wishlists.length) {
    const wishlistProductIds = wishlists.flatMap((w) => (w.items || []).filter(Boolean));
    const uniqueIds = [...new Set(wishlistProductIds.map(String))].slice(0, 100);
    const objectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));

    const wishlistProducts = await db
      .collection("products")
      .find({ _id: { $in: objectIds } })
      .toArray();

    if (wishlistProducts.length) {
      const rawTotal = wishlistProducts.reduce((s, p) => s + bytes(p), 0);
      const avgPerItem = rawTotal / wishlistProducts.length;
      const avgWishlistSize =
        wishlists.reduce((s, w) => s + (w.items || []).length, 0) / wishlists.length;

      const excludeKeys = Object.keys(LIST_EXCLUDE);
      const stripped = wishlistProducts.map((p) => {
        const clone = JSON.parse(JSON.stringify(p));
        for (const key of excludeKeys) {
          const parts = key.split(".");
          if (parts.length === 1) delete clone[parts[0]];
          else if (clone[parts[0]]) delete clone[parts[0]][parts[1]];
        }
        return clone;
      });
      const projAvgPerItem = stripped.reduce((s, p) => s + bytes(p), 0) / stripped.length;

      record(
        "Wishlist (avg wishlist × avg items)",
        "Full product per item (old)",
        wishlistProducts.length,
        avgPerItem * avgWishlistSize,
        null
      );
      record(
        "Wishlist (avg wishlist × avg items)",
        "LIST_EXCLUDE projection (new)",
        wishlistProducts.length,
        avgPerItem * avgWishlistSize,
        projAvgPerItem * avgWishlistSize
      );
    }
  }

  // ── 4. Order list — enrichOrdersWithDetails ───────────────────────────────

  const orders = await db.collection("orders").find().limit(20).toArray();
  if (orders.length) {
    const orderIds = orders.map((o) => o._id);
    const details = await db
      .collection("orderdetails")
      .find({ order_id: { $in: orderIds } })
      .toArray();

    const productIdStrings = [...new Set(details.map((d) => d.product_id).filter(Boolean))];
    const productObjIds = productIdStrings.map((id) => {
      try { return new mongoose.Types.ObjectId(id); } catch { return null; }
    }).filter(Boolean);

    const orderProducts = await db
      .collection("products")
      .find({ _id: { $in: productObjIds } })
      .limit(100)
      .toArray();

    if (orderProducts.length) {
      const avgDetailsPerOrder = details.length / orders.length;
      const rawPerProduct = orderProducts.reduce((s, p) => s + bytes(p), 0) / orderProducts.length;
      const skuPerProduct = orderProducts.map((p) => ({ _id: p._id, "product.sku_number": p.product?.sku_number }));
      const skuAvg = skuPerProduct.reduce((s, p) => s + bytes(p), 0) / skuPerProduct.length;

      record(
        "Order list (20 orders, avg details/order)",
        "Full product per order detail (old)",
        orderProducts.length,
        rawPerProduct * avgDetailsPerOrder * orders.length,
        null
      );
      record(
        "Order list (20 orders, avg details/order)",
        "SKU only projection (new)",
        orderProducts.length,
        rawPerProduct * avgDetailsPerOrder * orders.length,
        skuAvg * avgDetailsPerOrder * orders.length
      );
    }
  }

  // ── 5. User reviews ───────────────────────────────────────────────────────

  const users = await db.collection("users").find().limit(5).toArray();
  for (const user of users.slice(0, 1)) {
    const userOrders = await db
      .collection("orders")
      .find({ $or: [{ userId: user._id }, { user_id: user._id }] })
      .limit(20)
      .toArray();

    if (userOrders.length) {
      const orderIds = userOrders.map((o) => o._id);
      const reviewDetails = await db
        .collection("orderdetails")
        .find({ order_id: { $in: orderIds } })
        .toArray();

      const productIdStrings = [...new Set(reviewDetails.map((d) => d.product_id).filter(Boolean))];
      const productObjIds = productIdStrings.map((id) => {
        try { return new mongoose.Types.ObjectId(id); } catch { return null; }
      }).filter(Boolean);

      if (productObjIds.length) {
        const reviewProducts = await db
          .collection("products")
          .find({ _id: { $in: productObjIds } })
          .toArray();

        const rawTotal = reviewProducts.reduce((s, p) => s + bytes(p), 0);
        const excludeKeys = Object.keys(LIST_EXCLUDE);
        const stripped = reviewProducts.map((p) => {
          const clone = JSON.parse(JSON.stringify(p));
          for (const key of excludeKeys) {
            const parts = key.split(".");
            if (parts.length === 1) delete clone[parts[0]];
            else if (clone[parts[0]]) delete clone[parts[0]][parts[1]];
          }
          return clone;
        });
        const projTotal = stripped.reduce((s, p) => s + bytes(p), 0);

        record("User reviews page", "Full products (old)", reviewProducts.length, rawTotal, null);
        record("User reviews page", "LIST_EXCLUDE projection (new)", reviewProducts.length, rawTotal, projTotal);
      }
    }
  }

  // ── 6. Notification detail — targetUsers population ───────────────────────

  const broadcastNotif = await db
    .collection("notifications")
    .findOne({ sendToAll: true, targetUsers: { $exists: true } });

  const allUsers = await db
    .collection("users")
    .find()
    .limit(500)
    .project({ name: 1, email: 1, phone: 1, fcmToken: 1 })
    .toArray();

  if (allUsers.length) {
    const fullUsers = await db.collection("users").find().limit(500).toArray();
    const fullTotal = fullUsers.reduce((s, u) => s + bytes(u), 0);
    const projTotal = allUsers.reduce((s, u) => s + bytes(u), 0);

    record("Notification detail (sendToAll)", "Full User.find() — old (all users)", allUsers.length, fullTotal, null);
    record("Notification detail (sendToAll)", "countDocuments + 500-cap sample (new)", allUsers.length, fullTotal, projTotal);
  }

  // ── 7. Flash sales — product load ─────────────────────────────────────────

  const flashProducts = await db
    .collection("products")
    .find({ sold: { $exists: true, $gt: 0 }, discountedPrice: { $exists: true, $gt: 0 } })
    .limit(2000)
    .toArray();

  if (flashProducts.length) {
    const rawTotal = flashProducts.reduce((s, p) => s + bytes(p), 0);
    const excludeKeys = Object.keys(LIST_EXCLUDE);
    const stripped = flashProducts.map((p) => {
      const clone = JSON.parse(JSON.stringify(p));
      for (const key of excludeKeys) {
        const parts = key.split(".");
        if (parts.length === 1) delete clone[parts[0]];
        else if (clone[parts[0]]) delete clone[parts[0]][parts[1]];
      }
      return clone;
    });
    const projTotal = stripped.reduce((s, p) => s + bytes(p), 0);

    record("Flash sales product load", `${flashProducts.length} docs — no limit (old)`, flashProducts.length, rawTotal, null);
    record("Flash sales product load", `Capped 2000 + LIST_EXCLUDE (new)`, flashProducts.length, rawTotal, projTotal);
  }

  // ── 8. Collection-level stats ──────────────────────────────────────────────

  console.log("\n\n  ▸ Collection sizes (MongoDB storageSize)\n");
  const collections = ["products", "orders", "orderdetails", "users", "carts", "wishlists", "notifications", "productviews", "reviews"];
  console.log("  Collection".padEnd(22) + "  Count".padEnd(12) + "  Avg doc size".padEnd(16) + "  Storage size");
  console.log("  " + "─".repeat(70));
  for (const col of collections) {
    try {
      const stats = await db.command({ collStats: col });
      const count = stats.count || 0;
      const avgDocSize = stats.avgObjSize ? kb(stats.avgObjSize) : "N/A";
      const storageSize = stats.storageSize ? mb(stats.storageSize) : "N/A";
      console.log(`  ${col.padEnd(20)}  ${String(count).padEnd(10)}  ${avgDocSize.padEnd(14)}  ${storageSize}`);
    } catch {
      console.log(`  ${col.padEnd(20)}  (error reading stats)`);
    }
  }

  printTable();

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
