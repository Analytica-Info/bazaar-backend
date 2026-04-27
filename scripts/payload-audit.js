/**
 * payload-audit.js
 *
 * Measures actual MongoDB document sizes for every hot consumer-facing query.
 * Connects directly to MongoDB — no Express server needed.
 *
 * Usage:
 *   node scripts/payload-audit.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("../src/utilities/logger");

// ─── helpers ────────────────────────────────────────────────────────────────

function bytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

function kb(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

function mb(n) {
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function savedPct(before, after) {
  if (!before) return "N/A";
  return `${(((before - after) / before) * 100).toFixed(0)}%`;
}

const rows = [];

function record(section, query, sampleSize, rawBytes, projectedBytes) {
  rows.push({ section, query, sampleSize, rawBytes, projectedBytes });
}

function printResults() {
  // Emit each row as a structured log entry so pino-pretty renders it cleanly
  const sections = [...new Set(rows.map((r) => r.section))];

  for (const section of sections) {
    const sectionRows = rows.filter((r) => r.section === section);
    for (const r of sectionRows) {
      logger.info(
        {
          section: r.section,
          query: r.query,
          samples: r.sampleSize,
          rawSize: r.rawBytes != null ? kb(r.rawBytes) : null,
          projectedSize: r.projectedBytes != null ? kb(r.projectedBytes) : null,
          saved: r.rawBytes != null && r.projectedBytes != null
            ? savedPct(r.rawBytes, r.projectedBytes)
            : null,
        },
        "payload-audit row"
      );
    }
  }

  const totalRaw = rows.reduce((s, r) => s + (r.rawBytes || 0), 0);
  const totalProj = rows.reduce((s, r) => s + (r.projectedBytes || 0), 0);

  logger.info(
    {
      totalRaw: mb(totalRaw),
      totalProjected: mb(totalProj),
      totalSaved: mb(totalRaw - totalProj),
      savedPct: savedPct(totalRaw, totalProj),
    },
    "payload-audit totals"
  );
}

// ─── LIST_EXCLUDE fields (mirrors LIST_EXCLUDE_SELECT in productService) ────

const LIST_EXCLUDE_KEYS = [
  "product.variants", "product.product_codes", "product.suppliers",
  "product.composite_bom", "product.tag_ids", "product.attributes",
  "product.account_code_sales", "product.account_code_purchase",
  "product.price_outlet", "product.brand_id", "product.deleted_at",
  "product.version", "product.created_at", "product.updated_at",
  "product.description", "webhook", "webhookTime", "__v", "updatedAt",
];

function applyListExclude(doc) {
  const clone = JSON.parse(JSON.stringify(doc));
  for (const key of LIST_EXCLUDE_KEYS) {
    const parts = key.split(".");
    if (parts.length === 1) {
      delete clone[parts[0]];
    } else if (clone[parts[0]]) {
      delete clone[parts[0]][parts[1]];
    }
  }
  return clone;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info(
    { uri: process.env.MONGO_URI.replace(/\/\/.*@/, "//***@") },
    "Connected to MongoDB"
  );

  const db = mongoose.connection.db;

  // ── 1. Product document sizes ─────────────────────────────────────────────

  const products = await db.collection("products").find({ status: true }).limit(50).toArray();

  if (products.length) {
    const rawAvg = products.reduce((s, p) => s + bytes(p), 0) / products.length;
    const projAvg = products.map(applyListExclude).reduce((s, p) => s + bytes(p), 0) / products.length;
    const skuAvg = products
      .map((p) => ({ _id: p._id, product: { sku_number: p.product?.sku_number } }))
      .reduce((s, p) => s + bytes(p), 0) / products.length;
    const analyticsAvg = products
      .map((p) => ({ _id: p._id, name: p.product?.name, images: p.product?.images, discountedPrice: p.discountedPrice, originalPrice: p.originalPrice }))
      .reduce((s, p) => s + bytes(p), 0) / products.length;

    record("Product document (avg per doc)", "Full document", products.length, rawAvg, null);
    record("Product document (avg per doc)", "LIST_EXCLUDE projection", products.length, rawAvg, projAvg);
    record("Product document (avg per doc)", "SKU only (enrichOrdersWithDetails)", products.length, rawAvg, skuAvg);
    record("Product document (avg per doc)", "Analytics (name+images+price)", products.length, rawAvg, analyticsAvg);
  }

  // ── 2. Cart payload simulation ────────────────────────────────────────────

  const carts = await db.collection("carts").find().limit(20).toArray();
  if (carts.length) {
    const cartProductIds = [...new Set(
      carts.flatMap((c) => (c.items || []).map((i) => i.product).filter(Boolean)).map(String)
    )].slice(0, 100).map((id) => new mongoose.Types.ObjectId(id));

    const cartProducts = await db.collection("products").find({ _id: { $in: cartProductIds } }).toArray();
    if (cartProducts.length) {
      const avgCartSize = carts.reduce((s, c) => s + (c.items || []).length, 0) / carts.length;
      const rawAvg = cartProducts.reduce((s, p) => s + bytes(p), 0) / cartProducts.length;
      const projAvg = cartProducts.map(applyListExclude).reduce((s, p) => s + bytes(p), 0) / cartProducts.length;

      record("Cart (avg items per cart)", "Full product per item (old)", cartProducts.length, rawAvg * avgCartSize, null);
      record("Cart (avg items per cart)", "LIST_EXCLUDE projection (new)", cartProducts.length, rawAvg * avgCartSize, projAvg * avgCartSize);
    }
  }

  // ── 3. Wishlist payload simulation ───────────────────────────────────────

  const wishlists = await db.collection("wishlists").find().limit(20).toArray();
  if (wishlists.length) {
    const wishlistProductIds = [...new Set(
      wishlists.flatMap((w) => (w.items || []).filter(Boolean)).map(String)
    )].slice(0, 100).map((id) => new mongoose.Types.ObjectId(id));

    const wishlistProducts = await db.collection("products").find({ _id: { $in: wishlistProductIds } }).toArray();
    if (wishlistProducts.length) {
      const avgSize = wishlists.reduce((s, w) => s + (w.items || []).length, 0) / wishlists.length;
      const rawAvg = wishlistProducts.reduce((s, p) => s + bytes(p), 0) / wishlistProducts.length;
      const projAvg = wishlistProducts.map(applyListExclude).reduce((s, p) => s + bytes(p), 0) / wishlistProducts.length;

      record("Wishlist (avg items per wishlist)", "Full product per item (old)", wishlistProducts.length, rawAvg * avgSize, null);
      record("Wishlist (avg items per wishlist)", "LIST_EXCLUDE projection (new)", wishlistProducts.length, rawAvg * avgSize, projAvg * avgSize);
    }
  }

  // ── 4. Order enrichment — product SKU fetch ───────────────────────────────

  const orders = await db.collection("orders").find().limit(20).toArray();
  if (orders.length) {
    const details = await db.collection("orderdetails")
      .find({ order_id: { $in: orders.map((o) => o._id) } })
      .toArray();

    const productObjIds = [...new Set(details.map((d) => d.product_id).filter(Boolean))]
      .map((id) => { try { return new mongoose.Types.ObjectId(id); } catch { return null; } })
      .filter(Boolean);

    const orderProducts = await db.collection("products").find({ _id: { $in: productObjIds } }).limit(100).toArray();
    if (orderProducts.length) {
      const avgDetailsPerOrder = details.length / orders.length;
      const rawAvg = orderProducts.reduce((s, p) => s + bytes(p), 0) / orderProducts.length;
      const skuAvg = orderProducts
        .map((p) => ({ _id: p._id, "product.sku_number": p.product?.sku_number }))
        .reduce((s, p) => s + bytes(p), 0) / orderProducts.length;

      record("Order list (20 orders)", "Full product per detail (old)", orderProducts.length, rawAvg * avgDetailsPerOrder * orders.length, null);
      record("Order list (20 orders)", "SKU only projection (new)", orderProducts.length, rawAvg * avgDetailsPerOrder * orders.length, skuAvg * avgDetailsPerOrder * orders.length);
    }
  }

  // ── 5. Notification detail — user population ──────────────────────────────

  const fullUsers = await db.collection("users").find().limit(500).toArray();
  const projUsers = await db.collection("users").find().limit(500)
    .project({ name: 1, email: 1, phone: 1 }).toArray();

  if (fullUsers.length) {
    const fullTotal = fullUsers.reduce((s, u) => s + bytes(u), 0);
    const projTotal = projUsers.reduce((s, u) => s + bytes(u), 0);
    record("Notification detail (sendToAll, 500 users)", "Full User.find() (old)", fullUsers.length, fullTotal, null);
    record("Notification detail (sendToAll, 500 users)", "Capped 500 + name/email/phone (new)", projUsers.length, fullTotal, projTotal);
  }

  // ── 6. Flash sales — product load ─────────────────────────────────────────

  const flashProducts = await db.collection("products")
    .find({ sold: { $exists: true, $gt: 0 }, discountedPrice: { $exists: true, $gt: 0 } })
    .limit(2000).toArray();

  if (flashProducts.length) {
    const rawTotal = flashProducts.reduce((s, p) => s + bytes(p), 0);
    const projTotal = flashProducts.map(applyListExclude).reduce((s, p) => s + bytes(p), 0);
    record("Flash sales", `${flashProducts.length} docs — no limit (old)`, flashProducts.length, rawTotal, null);
    record("Flash sales", `Capped 2000 + LIST_EXCLUDE (new)`, flashProducts.length, rawTotal, projTotal);
  }

  // ── 7. Collection-level stats ─────────────────────────────────────────────

  const collections = ["products", "orders", "orderdetails", "users", "carts", "wishlists", "notifications", "productviews", "reviews"];
  for (const col of collections) {
    try {
      const stats = await db.command({ collStats: col });
      logger.info(
        {
          collection: col,
          count: stats.count,
          avgDocSize: stats.avgObjSize ? kb(stats.avgObjSize) : "N/A",
          storageSize: stats.storageSize ? mb(stats.storageSize) : "N/A",
        },
        "collection-stats"
      );
    } catch (err) {
      logger.warn({ collection: col, err: err.message }, "collection-stats error");
    }
  }

  // ── 8. Print results ──────────────────────────────────────────────────────

  printResults();

  await mongoose.disconnect();
  logger.info("payload-audit complete");
}

run().catch((err) => {
  logger.error({ err }, "payload-audit failed");
  process.exit(1);
});
