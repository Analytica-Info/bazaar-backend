#!/usr/bin/env node
/* eslint-disable */
// Flutter/Dart API call extractor.
// Strategy: parse ApiEndpoints constants → resolve usages anywhere in lib/.
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || "../Bazaar-Mobile-App/lib");
const outFile = path.resolve(process.argv[3] || "docs/api-map/bazaar-mobile.json");

const EXCLUDE = ["build", ".dart_tool", ".gradle", "ios", "android", "Pods", ".git"];

function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (EXCLUDE.includes(e.name)) continue;
    const fp = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(fp);
    else if (e.name.endsWith(".dart")) yield fp;
  }
}

// 1. parse ApiEndpoints
const apiEndpointsFile = path.join(root, "data/services/api_endpoints.dart");
const endpointMap = {};
if (fs.existsSync(apiEndpointsFile)) {
  const src = fs.readFileSync(apiEndpointsFile, "utf8");
  // single-line const String x = '...'
  const re1 = /static\s+const\s+String\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re1.exec(src)) !== null) endpointMap[m[1]] = m[2];
  // Two-line: const String x =\n   '...'
  const re2 = /static\s+const\s+String\s+(\w+)\s*=\s*\n\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(src)) !== null) endpointMap[m[1]] = m[2];
}

// 2. extractor: find every Uri.parse("...${ApiEndpoints.X}...") and infer method nearby
const calls = [];

function inferMethodNear(src, idx) {
  // search prior 400 chars and next 400 for http.METHOD or .post(/.get(
  const back = src.slice(Math.max(0, idx - 400), idx);
  const fwd = src.slice(idx, idx + 600);
  const ctx = back + fwd;
  const m = ctx.match(/\bhttp\s*\.\s*(get|post|put|delete|patch)\b/i);
  if (m) return m[1].toUpperCase();
  // also look for await http.METHOD on previous line of caller
  return null;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

for (const fp of walk(root)) {
  const src = fs.readFileSync(fp, "utf8");
  // Pattern: ApiEndpoints.NAME
  const re = /ApiEndpoints\.(\w+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    let url = endpointMap[name];
    if (!url) continue;
    // Already starts with /
    url = url.split("?")[0].replace(/\/$/, "");
    const line = lineOf(src, m.index);
    const method = inferMethodNear(src, m.index) || "?";
    // capture jsonDecode field accesses in next 1200 chars
    const tail = src.slice(m.index, m.index + 1200);
    const fields = new Set();
    const fieldRe = /(?:jsonDecode\([^)]+\)|response\.data|data|json|res|body)\s*\[\s*['"]([a-zA-Z_]\w*)['"]\s*\]/g;
    let fm;
    while ((fm = fieldRe.exec(tail)) !== null) fields.add(fm[1]);
    calls.push({
      method,
      url,
      endpointConst: name,
      file: path.relative(root, fp),
      line,
      fields: [...fields],
    });
  }
}

// dedup by (method, url, file, line)
const key = (c) => `${c.method} ${c.url} ${c.file}:${c.line}`;
const seen = new Set();
const dedup = [];
for (const c of calls) {
  if (!seen.has(key(c))) {
    seen.add(key(c));
    dedup.push(c);
  }
}
fs.writeFileSync(outFile, JSON.stringify(dedup, null, 2));
console.log(`Wrote ${dedup.length} mobile calls (from ${Object.keys(endpointMap).length} endpoint constants) to ${outFile}`);
