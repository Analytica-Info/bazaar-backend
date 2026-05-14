#!/usr/bin/env node
/**
 * Smoke test script — hits live v2 endpoints and verifies envelope shapes.
 *
 * Usage:
 *   node scripts/smoke.js
 *   node scripts/smoke.js --base-url https://staging.example.com
 *   SMOKE_USER=user@example.com SMOKE_PASS=secret node scripts/smoke.js
 *
 * Environment variables (all optional):
 *   SMOKE_BASE_URL   — base URL override (default: http://localhost:3000)
 *   SMOKE_USER       — email for authenticated flow
 *   SMOKE_PASS       — password for authenticated flow
 *   SMOKE_TIMEOUT_MS — per-request timeout in ms (default: 5000)
 *
 * Returns:
 *   exit code 0 — all checks passed
 *   exit code 1 — one or more checks failed
 */

const http = require("http");
const https = require("https");

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i++;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));

const BASE_URL = cliArgs.baseUrl || process.env.SMOKE_BASE_URL || "http://localhost:3000";
const TIMEOUT_MS = parseInt(process.env.SMOKE_TIMEOUT_MS || "5000", 10);
const SMOKE_USER = process.env.SMOKE_USER || "";
const SMOKE_PASS = process.env.SMOKE_PASS || "";

const results = [];
let passed = 0;
let failed = 0;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const isHttps = url.startsWith("https");
    const client = isHttps ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { "Content-Type": "application/json", ...headers },
      timeout: TIMEOUT_MS,
    };

    const req = client.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request ${method} ${path} timed out after ${TIMEOUT_MS}ms`));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const get = (path, headers = {}) => request("GET", path, { headers });
const post = (path, body, headers = {}) => request("POST", path, { body, headers });

// ─── Assertion helpers ───────────────────────────────────────────────────────

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    results.push({ name, ok: false, detail });
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Validate that a response body has the v2 envelope shape.
 * Accepts both success and error envelopes (success field must be boolean).
 */
function checkEnvelope(name, body) {
  check(
    `${name} — envelope has boolean 'success' field`,
    typeof body === "object" && body !== null && typeof body.success === "boolean",
    `got: ${JSON.stringify(body).slice(0, 120)}`
  );
}

// ─── Probe sections ───────────────────────────────────────────────────────────

async function probeHealth() {
  console.log("\n── Health probes ──────────────────────────────────────────");

  // /healthz — liveness probe
  try {
    const { status, body } = await get("/healthz");
    check("/healthz returns 200", status === 200, `got ${status}`);
    check("/healthz body.status === ok", body.status === "ok", `got ${JSON.stringify(body)}`);
  } catch (err) {
    check("/healthz reachable", false, err.message);
  }

  // /readyz — readiness probe
  try {
    const { status, body } = await get("/readyz");
    check("/readyz returns 2xx or 503", status === 200 || status === 503, `got ${status}`);
    check("/readyz body has status field", typeof body.status === "string", `got ${JSON.stringify(body)}`);
    check("/readyz body has checks.mongodb", body.checks && body.checks.mongodb !== undefined, `got ${JSON.stringify(body)}`);
  } catch (err) {
    check("/readyz reachable", false, err.message);
  }

  // /health — legacy health check
  try {
    const { body } = await get("/health");
    check("/health body has uptime", typeof body.uptime === "number", `got ${JSON.stringify(body)}`);
    check("/health body has database", typeof body.database === "string", `got ${JSON.stringify(body)}`);
  } catch (err) {
    check("/health reachable", false, err.message);
  }
}

async function probePublicV2Endpoints() {
  console.log("\n── Public v2 endpoints (no auth required) ─────────────────");

  // /v2/user/profile — unauthenticated → 401 with envelope
  try {
    const { status, body } = await get("/v2/user/profile");
    check("/v2/user/profile unauthenticated returns 401", status === 401, `got ${status}`);
    checkEnvelope("/v2/user/profile", body);
  } catch (err) {
    check("/v2/user/profile reachable", false, err.message);
  }

  // /v2/products — product listing (public read)
  try {
    const { status, body } = await get("/v2/products");
    check("/v2/products returns 200 or 401", status === 200 || status === 401, `got ${status}`);
    if (status === 200) {
      checkEnvelope("/v2/products", body);
    }
  } catch (err) {
    check("/v2/products reachable", false, err.message);
  }
}

async function probeAuthenticatedFlow() {
  if (!SMOKE_USER || !SMOKE_PASS) {
    console.log("\n── Authenticated flow skipped (set SMOKE_USER + SMOKE_PASS to enable) ──");
    return;
  }

  console.log("\n── Authenticated flow ──────────────────────────────────────");

  // Step 1: Login
  let authToken = "";
  try {
    const { status, body } = await post("/v2/auth/login", {
      email: SMOKE_USER,
      password: SMOKE_PASS,
    });
    check("POST /v2/auth/login returns 200", status === 200, `got ${status}`);
    checkEnvelope("POST /v2/auth/login", body);
    authToken = body.data?.accessToken || body.data?.token || "";
    check("POST /v2/auth/login returns access token", !!authToken, "no token in response");
  } catch (err) {
    check("POST /v2/auth/login reachable", false, err.message);
    return; // Can't proceed without token
  }

  if (!authToken) return;

  const authHeaders = { Authorization: `Bearer ${authToken}` };

  // Step 2: GET /v2/user/profile
  try {
    const { status, body } = await get("/v2/user/profile", authHeaders);
    check("GET /v2/user/profile (authenticated) returns 200", status === 200, `got ${status}`);
    checkEnvelope("GET /v2/user/profile (authenticated)", body);
  } catch (err) {
    check("GET /v2/user/profile (authenticated) reachable", false, err.message);
  }

  // Step 3: GET /v2/cart
  try {
    const { status, body } = await get("/v2/cart", authHeaders);
    check("GET /v2/cart (authenticated) returns 200", status === 200, `got ${status}`);
    checkEnvelope("GET /v2/cart (authenticated)", body);
  } catch (err) {
    check("GET /v2/cart (authenticated) reachable", false, err.message);
  }

  // Step 4: GET /v2/orders
  try {
    const { status, body } = await get("/v2/orders", authHeaders);
    check("GET /v2/orders (authenticated) returns 200", status === 200, `got ${status}`);
    checkEnvelope("GET /v2/orders (authenticated)", body);
  } catch (err) {
    check("GET /v2/orders (authenticated) reachable", false, err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runChecks() {
  console.log(`\nSmoke test against: ${BASE_URL}`);

  await probeHealth();
  await probePublicV2Endpoints();
  await probeAuthenticatedFlow();
}

runChecks()
  .then(() => {
    console.log(`\n${"─".repeat(55)}`);
    console.log(`Smoke results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error("\nSome smoke checks failed. See details above.");
      process.exit(1);
    } else {
      console.log("\nAll smoke checks passed.");
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error("Smoke script crashed:", err);
    process.exit(1);
  });
