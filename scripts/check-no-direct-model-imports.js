#!/usr/bin/env node
/**
 * Guardrail: forbid direct `../models/` imports outside the repository layer.
 *
 * Runs as a CI step / npm script. Exits non-zero if any file outside the
 * allowlist imports a model directly. Use this until the codebase has a
 * full ESLint configuration with `no-restricted-imports`.
 *
 * Allowlist (legitimate places to import models directly):
 *   - src/repositories/**            (the layer that owns Mongoose access)
 *   - src/scripts/**                 (one-shot scripts, seeds, migrations)
 *   - migrations/**                  (data migrations)
 *   - src/tests/**                   (in-tree test files)
 *
 * Anywhere else, services / controllers / middleware / helpers / utilities
 * must consume `require('src/repositories')` and call repo methods.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const ALLOW_PATTERNS = [
    /\/repositories\//,
    /\/scripts\//,
    /\/tests\//,
];

const PATTERN = /require\(\s*['"]\.\.(?:\/\.\.)?\/models\/[^'"]+['"]/;

let offenders = [];

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) {
            walk(fp);
        } else if (e.isFile() && fp.endsWith('.js')) {
            const rel = fp.replace(ROOT, '/src');
            if (ALLOW_PATTERNS.some((re) => re.test(rel))) continue;
            const src = fs.readFileSync(fp, 'utf8');
            const lines = src.split('\n');
            lines.forEach((line, idx) => {
                if (PATTERN.test(line)) {
                    offenders.push({ file: rel, line: idx + 1, content: line.trim() });
                }
            });
        }
    }
}

walk(ROOT);

if (offenders.length > 0) {
    console.error(`\n✖ Found ${offenders.length} direct model import(s) outside the repository layer:\n`);
    for (const o of offenders) {
        console.error(`  ${o.file}:${o.line}`);
        console.error(`    ${o.content}`);
    }
    console.error(`\nImport via src/repositories instead. See docs/architecture/repository-layer.md.\n`);
    process.exit(1);
}

console.log('✓ Repository layer guardrail: no direct model imports outside allowlist.');
process.exit(0);
