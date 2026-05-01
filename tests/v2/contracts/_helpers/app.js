/**
 * Builds a minimal Express app mounting the v2 router.
 * All controllers and services must be mocked by the caller before requiring this.
 * Auth middleware is stubbed to inject a fake req.user.
 */
const express = require("express");
const cookieParser = require("cookie-parser");

/**
 * Build and return the Express app.
 * Call this AFTER all jest.mock() declarations are in place.
 */
function buildApp() {
  // Auth middleware is mocked globally in each contract test file.
  const v2Router = require("../../../../src/routes/v2");
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/v2", v2Router);
  return app;
}

module.exports = { buildApp };
