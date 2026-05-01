/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,

  collectCoverageFrom: [
    "src/services/**/*.js",
    "src/repositories/**/*.js",
    "src/controllers/v2/**/*.js",
    "!src/repositories/index.js",
  ],

  coverageThreshold: {
    global: {
      lines: 48,
      statements: 47,
      branches: 36,
      functions: 50,
    },
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
