const pino = require("pino");

// Pino redaction paths — applied recursively to every log object's keys.
// Critical to keep this list tight: paths must match the shape of values we
// actually log. Axios-error objects nest secrets deeply.
//
// Verified by 2026-05-18 incident: AbstractAPI's `api_key` was serialized in
// plaintext on every email-validation failure because pino dumped the full
// axios `error.config.params`. Same risk applies to Authorization headers
// from any axios-based provider client (Tabby, Stripe, Nomod, Lightspeed).
const REDACT_PATHS = [
  // Axios error/response shapes
  '*.config.params.api_key',
  '*.config.params.apiKey',
  '*.config.headers.Authorization',
  '*.config.headers.authorization',
  '*.request._header',
  '*.request._redirectable._options.headers.Authorization',
  '*.request._redirectable._options.headers.authorization',
  '*.request._redirectable._currentUrl',
  // Generic top-level keys
  'password',
  'token',
  'jwt',
  'api_key',
  'apiKey',
  'authorization',
  'Authorization',
  // Common nested config keys
  '*.api_key',
  '*.apiKey',
  '*.authorization',
  '*.Authorization',
];

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
});

module.exports = logger;
