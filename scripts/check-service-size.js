#!/usr/bin/env node
'use strict';

/**
 * check-service-size.js
 *
 * Walks src/services/**\/*.js and enforces per-file LOC limits.
 *
 * Rules:
 *   - Facade files  (<name>Service.js at top level): ≤ 120 LOC
 *   - All other service files (use-cases/, domain/, adapters/, shared/, _kernel/): ≤ 300 LOC
 *
 * Exits 1 if any violation is found; prints a clear message per violation.
 *
 * Exception list (files that were accepted before this guardrail was added):
 *   These files exceed the normal limit for legitimate reasons (documented below).
 *   Keep this list TINY — each entry requires a justification comment.
 */

const fs = require('fs');
const path = require('path');

// ─── Exception list ──────────────────────────────────────────────────────────
// Format: { file: 'relative path from repo root', limit: <accepted LOC>, reason: '...' }
const EXCEPTIONS = [
  // ── PR-MOD-2 / PR-MOD-3 accepted files ───────────────────────────────────
  {
    file: 'src/services/order/domain/emailTemplates.js',
    limit: 700,
    reason: 'PR-MOD-2: large multi-platform HTML email template; accepted pre-guardrail',
  },
  {
    file: 'src/services/checkout/use-cases/createOrderAndSendEmails.js',
    limit: 450,
    reason: 'PR-MOD-3: orchestrates order creation + multi-email dispatch; accepted pre-guardrail',
  },
  // ── Existing large files not yet modularized (pre-PR-MOD-8 backlog) ───────
  // These are candidates for a future "small services" PR.
  {
    file: 'src/services/bankPromoCodeService.js',
    limit: 200,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/cartService.js',
    limit: 450,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/checkout/shared/inventory.js',
    limit: 400,
    reason: 'PR-MOD-3: complex inventory orchestration; accepted pre-guardrail',
  },
  {
    file: 'src/services/contactService.js',
    limit: 500,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/metricsService.js',
    limit: 320,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/newsletterService.js',
    limit: 400,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/notificationService.js',
    limit: 450,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/order/adapters/pendingPayment.js',
    limit: 500,
    reason: 'PR-MOD-2: complex pending-payment polling adapter; accepted pre-guardrail',
  },
  {
    file: 'src/services/order/shared/quantities.js',
    limit: 450,
    reason: 'PR-MOD-2: shared order-quantity logic; accepted pre-guardrail',
  },
  {
    file: 'src/services/order/use-cases/createStripeCheckoutSession.js',
    limit: 600,
    reason: 'PR-MOD-2: Stripe checkout session builder; accepted pre-guardrail',
  },
  {
    file: 'src/services/permissionService.js',
    limit: 160,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/product/sync/domain/lightspeedFetchers.js',
    limit: 510,
    reason: 'PR-MOD-5: Lightspeed sync fetch domain; accepted pre-guardrail',
  },
  {
    file: 'src/services/shippingService.js',
    limit: 450,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
  {
    file: 'src/services/userService.js',
    limit: 520,
    reason: 'Legacy monolith — not in scope for MOD-1..8; follow-up PR planned',
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────
const SERVICES_DIR = path.join(__dirname, '..', 'src', 'services');
const FACADE_LIMIT = 120;   // <name>Service.js top-level facades
const MODULE_LIMIT = 300;   // all other service files

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

function isFacade(relPath) {
  // Matches src/services/fooService.js — exactly one level deep with *Service.js suffix
  const parts = relPath.replace(/\\/g, '/').split('/');
  // parts: ['src', 'services', 'fooService.js']
  return parts.length === 3 && parts[2].endsWith('Service.js');
}

function findExceptionLimit(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const ex = EXCEPTIONS.find(e => normalized.endsWith(e.file.replace(/\\/g, '/')));
  return ex ? ex.limit : null;
}

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const repoRoot = path.join(__dirname, '..');
const allFiles = walkDir(SERVICES_DIR);

const violations = [];

for (const filePath of allFiles) {
  const relPath = path.relative(repoRoot, filePath);
  const loc = countLines(filePath);

  const exceptionLimit = findExceptionLimit(relPath);
  if (exceptionLimit !== null) {
    if (loc > exceptionLimit) {
      violations.push({ relPath, loc, limit: exceptionLimit, limitType: 'exception-cap' });
    }
    continue;
  }

  const limit = isFacade(relPath) ? FACADE_LIMIT : MODULE_LIMIT;
  const limitType = isFacade(relPath) ? 'facade' : 'module';

  if (loc > limit) {
    violations.push({ relPath, loc, limit, limitType });
  }
}

if (violations.length === 0) {
  console.log(`[check-service-size] OK — all ${allFiles.length} service files within LOC limits.`);
  process.exit(0);
} else {
  console.error(`[check-service-size] FAILED — ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.relPath}:${v.loc} > ${v.limit} (limit_type: ${v.limitType})`);
  }
  console.error('\nFix: split the file or add a justified exception to EXCEPTIONS in scripts/check-service-size.js');
  process.exit(1);
}
