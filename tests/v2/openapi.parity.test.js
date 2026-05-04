/**
 * OpenAPI parity guard — tests/v2/openapi.parity.test.js
 *
 * Fails CI when:
 *   - A v2 route exists in code but has no OpenAPI path entry.
 *   - An OpenAPI path entry exists but no v2 route backs it.
 *
 * How it works:
 *   1. Walk src/routes/v2/**\/*.js and extract (method, expressPath) tuples
 *      from router.METHOD() / router.route() calls via a regex pass.
 *   2. Parse docs/openapi/v2.yaml and extract (method, openApiPath) tuples
 *      from the `paths` block, normalising {param} → :param.
 *   3. Diff the two sets and report clearly.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert an OpenAPI path like /orders/address/{addressId}/set-primary
 *  to Express style /orders/address/:addressId/set-primary */
function openApiPathToExpress(p) {
  return p.replace(/\{([^}]+)\}/g, ":$1");
}

/** Normalise both sides to a comparable key: "METHOD /path/lower" */
function key(method, routePath) {
  return `${method.toUpperCase()} ${routePath.toLowerCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extract routes from source files
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_DIR = path.resolve(__dirname, "../../src/routes/v2");
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function extractRoutesFromFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const results = [];

  // Match: router.METHOD('path', ...) or router.METHOD("/path", ...)
  const methodPattern = new RegExp(
    `router\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
    "gi"
  );
  let match;
  while ((match = methodPattern.exec(src)) !== null) {
    results.push({ method: match[1].toUpperCase(), path: match[2] });
  }

  return results;
}

function getAllRouteFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllRouteFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function extractAllCodeRoutes() {
  const files = getAllRouteFiles(ROUTE_DIR);
  const routes = new Set();
  for (const file of files) {
    for (const r of extractRoutesFromFile(file)) {
      routes.add(key(r.method, r.path));
    }
  }
  return routes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Extract paths from OpenAPI spec
// ─────────────────────────────────────────────────────────────────────────────

const SPEC_PATH = path.resolve(__dirname, "../../docs/openapi/v2.yaml");

function extractSpecRoutes() {
  const spec = yaml.load(fs.readFileSync(SPEC_PATH, "utf8"));
  const routes = new Set();

  for (const [rawPath, pathItem] of Object.entries(spec.paths || {})) {
    const expressPath = openApiPathToExpress(rawPath);
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) {
        routes.add(key(method, expressPath));
      }
    }
  }
  return routes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("OpenAPI parity guard", () => {
  let codeRoutes;
  let specRoutes;

  beforeAll(() => {
    codeRoutes = extractAllCodeRoutes();
    specRoutes = extractSpecRoutes();
  });

  test("spec file exists and is valid YAML", () => {
    expect(fs.existsSync(SPEC_PATH)).toBe(true);
    expect(() => yaml.load(fs.readFileSync(SPEC_PATH, "utf8"))).not.toThrow();
  });

  test("every v2 route in code has an OpenAPI spec entry", () => {
    const missing = [...codeRoutes].filter((r) => !specRoutes.has(r));

    if (missing.length > 0) {
      console.error(
        "\nRoutes without OpenAPI entry:\n" +
          missing.map((r) => `  - ${r}`).join("\n") +
          "\n\nAdd these paths to docs/openapi/v2.yaml."
      );
    }

    expect(missing).toHaveLength(0);
  });

  test("every OpenAPI spec entry has a backing v2 route in code", () => {
    const extra = [...specRoutes].filter((r) => !codeRoutes.has(r));

    if (extra.length > 0) {
      console.error(
        "\nOpenAPI entries without a backing route:\n" +
          extra.map((r) => `  - ${r}`).join("\n") +
          "\n\nRemove these paths from docs/openapi/v2.yaml or add the route."
      );
    }

    expect(extra).toHaveLength(0);
  });

  test("no duplicate operationIds in spec", () => {
    const spec = yaml.load(fs.readFileSync(SPEC_PATH, "utf8"));
    const ids = [];
    for (const pathItem of Object.values(spec.paths || {})) {
      for (const method of HTTP_METHODS) {
        if (pathItem[method]?.operationId) {
          ids.push(pathItem[method].operationId);
        }
      }
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      console.error("\nDuplicate operationIds:\n" + dupes.map((d) => `  - ${d}`).join("\n"));
    }
    expect(dupes).toHaveLength(0);
  });
});
