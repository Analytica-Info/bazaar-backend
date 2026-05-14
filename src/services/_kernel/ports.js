'use strict';

/**
 * Kernel port definitions (JSDoc-only).
 *
 * This file is a documentation artifact and JSDoc anchor.
 * It exports an empty object at runtime — no logic runs here.
 *
 * All adapters in this project must implement the interface documented below.
 * Services depend on these interfaces, not on concrete implementations.
 *
 * @module _kernel/ports
 */

/**
 * Generic repository over an entity T.
 *
 * @template T
 * @typedef {Object} Repository
 * @property {(filter?: object) => Promise<T[]>}           findAll    - Return all matching entities.
 * @property {(id: string) => Promise<T|null>}             findById   - Find by primary key; null on miss.
 * @property {(data: Partial<T>) => Promise<T>}            create     - Persist a new entity and return it.
 * @property {(id: string, data: Partial<T>) => Promise<T|null>} update - Update and return; null if not found.
 * @property {(id: string) => Promise<boolean>}            delete     - Delete by id; true on success.
 */

/**
 * Clock seam — wraps Date/time so tests can freeze time.
 * Matches the existing src/utilities/clock.js shape.
 *
 * @typedef {Object} Clock
 * @property {() => Date}   now    - Current date/time as a Date object.
 * @property {() => number} nowMs  - Current time as milliseconds since epoch.
 * @property {() => Date}   today  - Start of today at UTC midnight as a Date object.
 */

/**
 * Cache port — async key/value store with TTL and pattern-delete.
 * Implementations must degrade gracefully on backend unavailability
 * (no method should throw to the caller).
 *
 * @typedef {Object} Cache
 * @property {(key: string) => Promise<any>}                          get        - Retrieve a cached value; undefined on miss.
 * @property {(key: string, value: any, ttlSeconds?: number) => Promise<boolean>} set - Store a value with TTL.
 * @property {(key: string) => Promise<number>}                       del        - Delete one key; returns count deleted.
 * @property {(pattern: string) => Promise<number>}                   delPattern - Delete all keys matching a glob pattern.
 * @property {(key: string, ttlSeconds: number, loader: () => Promise<any>) => Promise<any>} getOrSet - Get or compute-and-cache.
 */

/**
 * Structured logger interface.
 * Matches the pino logger shape used throughout the codebase.
 *
 * @typedef {Object} Logger
 * @property {(obj: object|string, msg?: string) => void} info  - Informational message.
 * @property {(obj: object|string, msg?: string) => void} warn  - Warning message.
 * @property {(obj: object|string, msg?: string) => void} error - Error message.
 * @property {(obj: object|string, msg?: string) => void} debug - Debug message.
 */

/**
 * Payment provider port.
 * Matches the PaymentProvider base class in src/services/payments/PaymentProvider.js.
 *
 * @typedef {Object} PaymentProvider
 * @property {string} name - Provider identifier (e.g. "stripe", "tabby", "nomod").
 * @property {(params: {
 *   referenceId: string,
 *   amount: number,
 *   currency?: string,
 *   discount?: number,
 *   items: Array<{name: string, quantity: number, price: number}>,
 *   shippingCost?: number,
 *   customer?: {name: string, email: string, phone?: string},
 *   successUrl: string,
 *   failureUrl: string,
 *   cancelledUrl?: string,
 *   metadata?: object,
 * }) => Promise<{id: string, redirectUrl: string|null, raw: object}>} createCheckout
 * @property {(sessionId: string) => Promise<{id: string, status: string, paid: boolean, amount: number, currency: string, raw: object}>} verifyPayment
 * @property {(sessionId: string, params: {amount: number, reason?: string, referenceId?: string}) => Promise<{refundId: string, status: string, amount: number, raw: object}>} refund
 * @property {(payload: object, headers: object) => Promise<{event: string, sessionId: string, status: string, raw: object}>} handleWebhook
 */

/**
 * OAuth token verifier port.
 * Used by auth use-cases to validate third-party identity tokens (Google, Apple, etc.).
 *
 * @typedef {Object} OAuthVerifier
 * @property {(token: string) => Promise<{email: string, name: string, sub: string, [key: string]: any}>} verifyToken
 *   Verify the token and return the decoded claims.
 *   Throws an UnauthorizedError if the token is invalid or expired.
 */

/**
 * Email sender port.
 *
 * @typedef {Object} EmailSender
 * @property {(options: {to: string, subject: string, html: string, text?: string}) => Promise<void>} send
 *   Send an email. Throws an UpstreamError on delivery failure.
 */

module.exports = {};
