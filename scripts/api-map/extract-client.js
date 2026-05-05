#!/usr/bin/env node
/* eslint-disable */
// Generic JS/JSX client API call extractor (web + admin).
// Usage: node extract-client.js <root> <out.json>
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);

const EXCLUDE = ["node_modules", "dist", "build", "coverage", ".git", "ios", "android"];

function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (EXCLUDE.includes(e.name)) continue;
    const fp = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(fp);
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) yield fp;
  }
}

const calls = [];
const CALL_RE = /(?:axios|axiosInstance|api)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*([`'"])((?:\\\\.|(?!\2).)*)\2/g;
// Also catch axios({ method: "...", url: "..." }) — skipped for simplicity.

for (const fp of walk(root)) {
  let src;
  try {
    src = fs.readFileSync(fp, "utf8");
  } catch {
    continue;
  }
  let m;
  while ((m = CALL_RE.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    let url = m[3];
    const dynamic = /\$\{|\+/.test(url);
    // strip query string
    url = url.split("?")[0];
    // index of match
    const lineNo = src.slice(0, m.index).split("\n").length;
    // capture nearby response field accesses (next 600 chars)
    const tail = src.slice(m.index, m.index + 600);
    const fields = new Set();
    const fieldRe = /\b(?:res|response|data|result)\s*\.\s*data\s*\.\s*([a-zA-Z_]\w*)/g;
    let fm;
    while ((fm = fieldRe.exec(tail)) !== null) fields.add(fm[1]);
    // destructured: const { x, y } = response.data
    const destructRe = /const\s*\{\s*([^}]+)\s*\}\s*=\s*(?:res|response)\s*\.\s*data\b/g;
    let dm;
    while ((dm = destructRe.exec(tail)) !== null) {
      dm[1].split(",").forEach((k) => {
        const key = k.trim().split(/[:\s=]/)[0];
        if (key && /^[a-zA-Z_]\w*$/.test(key)) fields.add(key);
      });
    }
    calls.push({
      method,
      url,
      dynamic,
      file: path.relative(root, fp),
      line: lineNo,
      fields: [...fields],
    });
  }
}

// Dedup by (method, url, file, line)
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
console.log(`Wrote ${dedup.length} calls from ${root} to ${outFile}`);
