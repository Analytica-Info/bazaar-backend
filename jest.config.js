/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,

  collectCoverageFrom: [
    "src/services/**/*.js",
    "src/repositories/**/*.js",
    "src/controllers/v2/**/*.js",
    "src/middleware/**/*.js",
    "src/helpers/**/*.js",
    "src/utilities/**/*.js",
    "src/utils/**/*.js",
    "!src/repositories/index.js",
  ],

  coverageThreshold: {
    // Global actuals after PR6 (coverage-summary): stmts=65.4%, branches=52.2%, funcs=70.5%, lines=66.1%
    // Jest per-project threshold enforcement uses single-project numbers, not the combined
    // coverage-summary total. Unit project alone reports ~61% stmts. Thresholds set at
    // unit-project actuals − 1pp to lock progress without false-failing CI.
    global: {
      lines: 61,
      statements: 60,
      branches: 48,
      functions: 64,
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
