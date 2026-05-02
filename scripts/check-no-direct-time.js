#!/usr/bin/env node
/**
 * Guardrail: forbid direct time calls outside the clock seam and allowlist.
 *
 * Patterns flagged:
 *   new Date()          — empty-paren only (new Date(someArg) is fine — that's parsing)
 *   Date.now(           — direct ms-since-epoch
 *   setTimeout(         — raw timer (except where fine)
 *   setInterval(        — raw interval (except where fine)
 *
 * Allowlist — files that are permitted to use these directly:
 *   src/utilities/clock.js              (the seam itself)
 *   src/utilities/logger.js             (log timestamps must be real)
 *   src/utilities/backendLogger.js      (ditto)
 *   src/server.js                       (startup code)
 *   src/utilities/cache.js              (TTL arithmetic)
 *   src/utilities/activityLogger.js     (log timestamps)
 *   src/config/                         (redis keepalive, boot code)
 *   src/scripts/                        (one-shot migration scripts)
 *   src/workers/                        (background workers, queues)
 *
 * Services not yet migrated (PR5/PR6 will handle these):
 *   src/services/orderService.js        -- partially migrated; locale format calls remain
 *   src/services/checkoutService.js     -- partially migrated; year const + locale calls remain
 *   src/services/authService.js
 *   src/services/adminService.js
 *   src/services/notificationService.js
 *   src/services/emailConfigService.js
 *   src/services/giftProductService.js
 *   src/services/wishlistService.js
 *   src/services/shippingService.js
 *   src/services/roleService.js
 *   src/services/permissionService.js
 *   src/services/productSyncService.js
 *   src/services/bannerService.js
 *   src/services/cmsService.js
 *   src/services/contactService.js
 *   src/services/newsletterService.js
 *   src/services/payments/
 *
 * Run: node scripts/check-no-direct-time.js
 * Exit 1 on violations outside allowlist, exit 0 when clean.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');

// Files / directories that are explicitly allowed to call time APIs directly.
const ALLOW_PATTERNS = [
    // The seam itself
    /\/utilities\/clock\.js$/,
    // Real-time logging — must not be faked
    /\/utilities\/logger\.js$/,
    /\/utilities\/backendLogger\.js$/,
    /\/utilities\/activityLogger\.js$/,
    // Startup / config
    /\/server\.js$/,
    /\/config\//,
    // Scripts & workers (one-shot, not under test)
    /\/scripts\//,
    /\/workers\//,
    // Cache utility (TTL arithmetic is fine)
    /\/utilities\/cache\.js$/,
    // --- PR4 partial migrations (locale-format calls & year const remain) ---
    /\/services\/orderService\.js$/,
    /\/services\/checkoutService\.js$/,
    // --- PR-MOD-5 inherited: productService statusLogger has a real-time
    // log timestamp; product/sync/domain/lightspeedHelpers has a doc-comment
    // mention of new Date() (false positive — already uses clock.now()). ---
    /\/services\/product\/domain\/statusLogger\.js$/,
    /\/services\/product\/sync\/domain\/lightspeedHelpers\.js$/,
    // --- Not yet migrated — PR6 ---
    /\/services\/payments\//,
    // couponService: two toLocaleString calls in UAE10 path (external API branch, PR5)
    /\/services\/couponService\.js$/,
    // metricsService: t: new Date() in error log entry (real-time logging)
    /\/services\/metricsService\.js$/,
    // productService: timestamp for file log (real-time logging, not test-critical)
    /\/services\/productService\.js$/,
    // Controllers — PR5/PR6
    /\/controllers\//,
    // Helpers — PR5/PR6
    /\/helpers\//,
    // Middleware — PR5/PR6
    /\/middleware\//,
    // Models with pre-save hooks using Date.now() — PR5/PR6
    /\/models\//,
    // File upload utility — PR5/PR6
    /\/utilities\/fileUpload\.js$/,
];

// Patterns to flag. new Date() with empty parens only; Date.now(; setTimeout(; setInterval(
const RULES = [
    {
        re: /new Date\(\)/,
        message: 'Use clock.now() instead of new Date()',
    },
    {
        re: /\bDate\.now\(/,
        message: 'Use clock.nowMs() instead of Date.now()',
    },
    {
        re: /\bsetTimeout\(/,
        message: 'Use jest.useFakeTimers() in tests; for prod, add to allowlist if intentional',
    },
    {
        re: /\bsetInterval\(/,
        message: 'Use jest.useFakeTimers() in tests; for prod, add to allowlist if intentional',
    },
];

const violations = [];

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) {
            walk(fp);
        } else if (e.isFile() && fp.endsWith('.js')) {
            const rel = fp.replace(ROOT, '/src');
            if (ALLOW_PATTERNS.some((re) => re.test(rel))) continue;

            const src   = fs.readFileSync(fp, 'utf8');
            const lines = src.split('\n');

            lines.forEach((line, idx) => {
                // Skip comment lines
                if (/^\s*\/\//.test(line)) return;
                for (const { re, message } of RULES) {
                    if (re.test(line)) {
                        violations.push({
                            file: rel,
                            line: idx + 1,
                            content: line.trim(),
                            message,
                        });
                    }
                }
            });
        }
    }
}

walk(ROOT);

if (violations.length > 0) {
    console.error(`\n✖ Found ${violations.length} direct time call(s) outside the clock seam:\n`);
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    ${v.content}`);
        console.error(`    → ${v.message}\n`);
    }
    console.error(
        'Import clock from src/utilities/clock.js and use clock.now() / clock.nowMs().\n' +
        'To suppress a file temporarily, add its path to ALLOW_PATTERNS in this script.\n'
    );
    process.exit(1);
}

console.log(`✓ Clock seam guardrail: no direct time calls outside allowlist (${ALLOW_PATTERNS.length} allowlisted patterns).`);
process.exit(0);
