/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,

  collectCoverageFrom: [
    "src/services/**/*.js",
    "src/repositories/**/*.js",
    "src/controllers/**/*.js",
    "src/middleware/**/*.js",
    "src/helpers/**/*.js",
    "src/utilities/**/*.js",
    "src/utils/**/*.js",
    "!src/repositories/index.js",
    "!src/controllers/ecommerce/seedController.js",
  ],

  coverageThreshold: {
    // Global actuals after PR8 (jest threshold check): stmts=66.94%, branches=47.3%, funcs=66.48%, lines=67.71%
    // Note: jest threshold check values differ from coverage-summary.json (72.6%/58.78%/74.67%/73.41%)
    // because jest multi-project mode computes per-project coverage independently and the threshold
    // "global" check uses the lower single-project (unit) result, not the merged total.
    // PR8 adds v1 controller tests (18 ecommerce + 7 mobile + 2 shared controllers).
    // Thresholds set at PR8 jest-check actuals − 1pp to ratchet progress without false-failing CI.
    // PR9 merged-total actuals: lines=77.82%, stmts=76.88%, branches=61.55%, funcs=79.71%
    // Jest threshold check uses single-project (unit) actuals (lower): lines=72.4%, stmts=71.95%, branches=54.31%, funcs=75%
    // Thresholds ratcheted to jest-check actuals − 1pp.
    global: {
      lines: 71,
      statements: 70,
      branches: 53,
      functions: 74,
    },
    // --- PR7: services directory threshold (excl. payments/) ---
    // Actuals: lines=53.5%, branches=40.3%, funcs=56%, stmts=52.7%
    // The low values reflect that long async function bodies in checkoutService/orderService
    // (400-600 line functions) are not instrumented by Node.js 24 V8 despite being exercised.
    './src/services/': {
      lines: 52,
      statements: 51,
      branches: 38,
      functions: 54,
    },
    // --- PR9: publicController.js per-file threshold ---
    // Actuals: lines=80.24%, stmts=79.17%, branches=58.95%, funcs=76.85%
    // Thresholds at actual − 2pp.
    './src/controllers/ecommerce/publicController.js': {
      lines: 78,
      statements: 77,
      branches: 56,
      functions: 74,
    },
    // --- PR9: controllers/ecommerce/ directory threshold ---
    // Actuals: lines=86.65%, stmts=85.44%, branches=65.18%, funcs=86.50%
    // Thresholds at actual − 2pp.
    './src/controllers/ecommerce/': {
      lines: 84,
      statements: 83,
      branches: 63,
      functions: 84,
    },
    // --- Existing per-directory thresholds (unchanged from PR3/PR5) ---
    './src/services/payments/': {
      lines: 97,
      statements: 94,
      branches: 59,
      functions: 94,
    },
    './src/repositories/': {
      lines: 93,
      statements: 90,
      branches: 79,
      functions: 95,
    },
    './src/controllers/v2/': {
      lines: 62,
      statements: 62,
      branches: 46,
      functions: 62,
    },
    // --- New per-directory thresholds for PR6 surface ---
    // Actuals: middleware stmts=97.1%, branches=87.4%, funcs=90.9%, lines=97.1%
    './src/middleware/': {
      lines: 95,
      statements: 95,
      branches: 82,
      functions: 88,
    },
    // Actuals: utilities stmts=96.6%, branches=89.2%, funcs=96.9%, lines=98.7%
    './src/utilities/': {
      lines: 96,
      statements: 94,
      branches: 84,
      functions: 94,
    },
    // Actuals: utils stmts=100%, branches=100%, funcs=100%, lines=100%
    './src/utils/': {
      lines: 98,
      statements: 98,
      branches: 80,
      functions: 98,
    },
    // Actuals: helpers stmts=67.2%, branches=44.6%, funcs=63.9%, lines=67.2%
    './src/helpers/': {
      lines: 65,
      statements: 65,
      branches: 39,
      functions: 61,
    },
  },

  coverageReporters: ["text-summary", "lcov", "json-summary"],

  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testTimeout: 30000,
      testMatch: [
        "**/tests/v2/**/*.test.js",
        "**/tests/controllers/**/*.test.js",
        "**/tests/services/**/*.test.js",
        "**/tests/helpers/**/*.test.js",
        "**/tests/scripts/**/*.test.js",
        "**/tests/utilities/**/*.test.js",
        "**/tests/middleware/**/*.test.js",
        "**/tests/utils/**/*.test.js",
      ],
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      testTimeout: 30000,
      // Repositories use mongodb-memory-server via direct require('../setup') in each file
      testMatch: [
        "**/tests/repositories/**/*.test.js",
        "**/tests/integration/**/*.test.js",
      ],
    },
  ],
};
