#!/usr/bin/env node
/* eslint-disable */
// PR14: Backend route extractor.
// Walks src/routes/**/*.js, infers (method, fullPath, controller, file).
// Captures res.json() shape keys via regex over controller files.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(ROOT, "src/routes");
const SERVER_FILE = path.join(ROOT, "src/server.js");

// Map: route module relative path → mount prefix (manually derived from server.js inspection).
const MOUNTS = [
  // ecommerce (admin/user web v1)
  { prefix: "/admin", file: "ecommerce/adminRoutes.js" },
  { prefix: "/admin/roles", file: "ecommerce/roleRoutes.js" },
  { prefix: "/admin/permissions", file: "ecommerce/permissionRoutes.js" },
  { prefix: "/admin", file: "ecommerce/emailRoutes.js" },
  { prefix: "/user", file: "ecommerce/userRoutes.js" },
  { prefix: "/user", file: "ecommerce/orderRoutes.js" },
  { prefix: "/webhook", file: "ecommerce/webhooksRoutes.js" },
  { prefix: "", file: "ecommerce/publicRoutes.js" },
  { prefix: "", file: "ecommerce/wishlistRoutes.js" },
  { prefix: "/cart", file: "ecommerce/cartRoutes.js" },
  { prefix: "", file: "ecommerce/bannerImages.js" },
  { prefix: "", file: "ecommerce/seedRoutes.js" },
  // mobile v1
  { prefix: "/api/auth", file: "mobile/authRoutes.js" },
  { prefix: "/api/products", file: "mobile/productRoutes.js" },
  { prefix: "/api/wishlist", file: "mobile/wishlistRoutes.js" },
  { prefix: "/api/cart", file: "mobile/cartRoutes.js" },
  { prefix: "/api/order", file: "mobile/orderRoutes.js" },
  { prefix: "/api/notification", file: "mobile/notificationRoutes.js" },
  { prefix: "/api", file: "mobile/couponsRoutes.js" },
  { prefix: "/api", file: "mobile/publicRoutes.js" },
  { prefix: "/api", file: "mobile/bannerImages.js" },
  { prefix: "/api/mobile", file: "mobile/configRoutes.js" },
];

const ROUTE_RE = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;

function extractFromRouter(filePath, prefix, version) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, "utf8");
  const out = [];
  let m;
  while ((m = ROUTE_RE.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const subPath = m[2];
    const fullPath = (prefix + subPath).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    // Look for controller call in surrounding 400 chars after the match
    const tail = src.slice(m.index, m.index + 800);
    const ctrlMatch = tail.match(/,\s*([a-zA-Z_$][\w$]*)\s*\)/);
    const controller = ctrlMatch ? ctrlMatch[1] : null;
    out.push({
      method,
      path: fullPath,
      controller,
      file: path.relative(ROOT, filePath),
      version,
    });
  }
  return out;
}

const routes = [];

// v1 ecommerce + mobile
for (const m of MOUNTS) {
  const fp = path.join(ROUTES_DIR, m.file);
  const version = m.file.startsWith("mobile/") ? "v1-mobile" : "v1-ecommerce";
  routes.push(...extractFromRouter(fp, m.prefix, version));
}

// v2: walk index files for sub-mounts
const V2_INDEX = path.join(ROUTES_DIR, "v2/index.js");
const v2IdxSrc = fs.readFileSync(V2_INDEX, "utf8");
// router.use("/web", webRouter); router.use("/", sharedRouter); etc.
const V2_USE_RE = /router\.use\(\s*['"`]([^'"`]*)['"`]\s*,\s*([\w$]+)/g;
let um;
const v2SubMounts = [];
while ((um = V2_USE_RE.exec(v2IdxSrc)) !== null) {
  v2SubMounts.push({ subPrefix: um[1], varName: um[2] });
}
// v2 sub-router files: web, mobile, shared all under v2/<scope>/index.js mounting nested route files
// Use a controller→route extractor: also need to capture controller method (e.g., authCtrl.register)
const ROUTE_RE_FULL = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]([\s\S]*?)\)\s*;/g;
function extractV2Index(filePath, prefix, scope) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, "utf8");
  const out = [];
  let m;
  while ((m = ROUTE_RE_FULL.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const subPath = m[2];
    const fullPath = (prefix + subPath).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    // last identifier in tail is the handler (often Ctrl.method)
    const tail = m[3];
    const handlerMatch = [...tail.matchAll(/([\w$]+\.[\w$]+|[\w$]+)\s*$/g)];
    const lastIdent = tail.match(/([\w$]+(?:\.[\w$]+)?)\s*\)?\s*;?\s*$/);
    const controller = lastIdent ? lastIdent[1] : null;
    out.push({
      method,
      path: fullPath,
      controller,
      file: path.relative(ROOT, filePath),
      version: "v2",
      scope,
    });
  }
  return out;
}
routes.push(...extractV2Index(path.join(ROUTES_DIR, "v2/web/index.js"), "/v2", "web"));
routes.push(...extractV2Index(path.join(ROUTES_DIR, "v2/mobile/index.js"), "/v2", "mobile"));
routes.push(...extractV2Index(path.join(ROUTES_DIR, "v2/shared/index.js"), "/v2", "shared"));

// server.js inline routes
const serverSrc = fs.readFileSync(SERVER_FILE, "utf8");
const APP_ROUTE_RE = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
let am;
while ((am = APP_ROUTE_RE.exec(serverSrc)) !== null) {
  routes.push({
    method: am[1].toUpperCase(),
    path: am[2],
    controller: "inline",
    file: "src/server.js",
    version: am[2].startsWith("/v2") ? "v2" : am[2].startsWith("/api") ? "v1-mobile" : "shared",
  });
}

// Deduplicate
const key = (r) => `${r.method} ${r.path}`;
const seen = new Map();
for (const r of routes) {
  if (!seen.has(key(r))) seen.set(key(r), r);
}
const dedup = [...seen.values()].sort((a, b) => key(a).localeCompare(key(b)));

// Infer response shape keys from controller files (best-effort)
function inferShape(controllerName) {
  if (!controllerName || controllerName === "inline") return [];
  const methodOnly = controllerName.includes(".") ? controllerName.split(".").pop() : controllerName;
  const re = new RegExp(`(?:const|exports\\.|module\\.exports\\.|async\\s+function|function)\\s*${methodOnly}\\b|${methodOnly}\\s*[:=]\\s*(?:async\\s*)?\\(`);
  const ctrlRoot = path.join(ROOT, "src/controllers");
  const stack = [ctrlRoot];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) stack.push(fp);
      else if (e.name.endsWith(".js")) {
        const src = fs.readFileSync(fp, "utf8");
        if (re.test(src)) {
          // capture res.json calls and key sets
          const keys = new Set();
          const jsonRe = /res\.(?:status\(\d+\)\s*\.)?json\(\s*\{([^}]{0,800})\}/g;
          let jm;
          while ((jm = jsonRe.exec(src)) !== null) {
            const body = jm[1];
            const keyRe = /(?:^|[,{\s])([a-zA-Z_][\w]*)\s*:/g;
            let km;
            while ((km = keyRe.exec(body)) !== null) keys.add(km[1]);
          }
          return { file: path.relative(ROOT, fp), keys: [...keys].slice(0, 25) };
        }
      }
    }
  }
  return null;
}

const enriched = dedup.map((r) => {
  const shape = inferShape(r.controller);
  return {
    method: r.method,
    path: r.path,
    version: r.version,
    controller: r.controller,
    file: r.file,
    controller_file: shape ? shape.file : null,
    response_shape_keys: shape ? shape.keys : [],
  };
});

const out = path.join(ROOT, "docs/api-map/backend-routes.json");
fs.writeFileSync(out, JSON.stringify(enriched, null, 2));
console.log(`Wrote ${enriched.length} backend routes to ${out}`);
const byVer = enriched.reduce((acc, r) => ((acc[r.version] = (acc[r.version] || 0) + 1), acc), {});
console.log("by version:", byVer);
