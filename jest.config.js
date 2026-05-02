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
    // PR10 merged-total actuals: lines=81.51%, stmts=80.48%, branches=64.95%, funcs=82.99%
    // PR11 merged-total actuals: lines=85.38%, stmts=84.31%, branches=71.71%, funcs=83.90%
    // PR12 merged-total actuals: lines=87.21%, stmts=86.11%, branches=74.11%, funcs=85.27%
    // Jest threshold check uses single-project (unit) actuals (lower) — ratcheted to actual − 1pp.
    global: {
      lines: 81,
      statements: 80,
      branches: 58,
      functions: 77,
    },
    // --- PR7: services directory threshold (excl. payments/) ---
    // PR11 actuals: authService 94.98%, checkoutService 84.73%, orderService 80.26%
    // PR12 actuals: productSyncService 93.6%, adminService 82.73%, productService 80.14%
    // Directory actuals improved significantly; thresholds raised at actual − 2pp for lagging files.
    './src/services/': {
      lines: 54,
      statements: 53,
      branches: 40,
      functions: 56,
    },
    // --- PR12: per-file thresholds for 3 target services ---
    // productSyncService: lines=93.6%, branches=72.98%
    './src/services/productSyncService.js': {
      lines: 91,
      statements: 90,
      branches: 70,
      functions: 76,
    },
    // adminService: lines=82.73%, branches=73.22%
    './src/services/adminService.js': {
      lines: 80,
      statements: 78,
      branches: 71,
      functions: 68,
    },
    // productService: lines=80.14%, branches=71.1%
    './src/services/productService.js': {
      lines: 78,
      statements: 75,
      branches: 69,
      functions: 77,
    },
    // --- PR11: per-file thresholds for 3 target service files ---
    // authService: lines=94.98%, branches=89.37%, funcs=100%, stmts=95.14%
    './src/services/authService.js': {
      lines: 93,
      statements: 93,
      branches: 87,
      functions: 98,
    },
    // checkoutService: lines=84.73%, branches=73.95%, funcs=72%, stmts=83.25%
    './src/services/checkoutService.js': {
      lines: 82,
      statements: 81,
      branches: 71,
      functions: 70,
    },
    // orderService: lines=80.26%, branches=67.12%, funcs=76.19%, stmts=79.79%
    './src/services/orderService.js': {
      lines: 78,
      statements: 77,
      branches: 65,
      functions: 74,
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
    // PR10 actuals: v2 controllers lines~95%, stmts~94%, branches~80%, funcs~95%
    './src/controllers/v2/': {
      lines: 78,
      statements: 78,
      branches: 60,
      functions: 78,
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
    // Actuals after PR10: helpers lines=92.25% (sendPushNotification), overall dir higher
    './src/helpers/': {
      lines: 75,
      statements: 75,
      branches: 55,
      functions: 70,
    },
    // --- PR10: per-file thresholds for 6 target files ---
    // Actual − 2pp
    './src/controllers/mobile/productController.js': {
      lines: 95,
      statements: 94,
      branches: 84,
      functions: 95,
    },
    './src/controllers/mobile/authController.js': {
      lines: 89,
      statements: 89,
      branches: 68,
      functions: 85,
    },
    './src/helpers/sendPushNotification.js': {
      lines: 90,
      statements: 89,
      branches: 77,
      functions: 78,
    },
    './src/controllers/mobile/smartCategoriesController.js': {
      lines: 93,
      statements: 93,
      branches: 78,
      functions: 93,
    },
    './src/controllers/v2/mobile/authController.js': {
      lines: 98,
      statements: 98,
      branches: 95,
      functions: 98,
    },
    './src/controllers/v2/web/authController.js': {
      lines: 98,
      statements: 98,
      branches: 81,
      functions: 98,
    },
    // --- PR10: per-directory ratchets ---
    // controllers/mobile/ actuals: lines~93%, stmts~92%, branches~72%, funcs~92%
    './src/controllers/mobile/': {
      lines: 80,
      statements: 80,
      branches: 65,
      functions: 80,
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
