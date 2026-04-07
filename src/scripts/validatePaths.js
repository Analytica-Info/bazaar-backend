/**
 * Validates all require() paths in src/ resolve to existing files.
 * Run: node src/scripts/validatePaths.js
 */
const path = require("path");
const fs = require("fs");

function checkRequires(dir) {
  const issues = [];
  const files = [];

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        walk(path.join(d, entry.name));
      } else if (entry.name.endsWith(".js")) {
        files.push(path.join(d, entry.name));
      }
    }
  }
  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const requires = content.match(/require\(['"]\.\.?\/[^'"]+['"]\)/g) || [];
    for (const req of requires) {
      const match = req.match(/require\(['"]([^'"]+)['"]\)/);
      if (!match) continue;
      const reqPath = match[1];
      const resolved = path.resolve(path.dirname(file), reqPath);
      if (
        !fs.existsSync(resolved) &&
        !fs.existsSync(resolved + ".js") &&
        !fs.existsSync(resolved + ".json") &&
        !fs.existsSync(path.join(resolved, "index.js"))
      ) {
        issues.push(`${path.relative(dir, file)} -> ${reqPath}`);
      }
    }
  }
  return issues;
}

const srcDir = path.join(__dirname, "..");
const issues = checkRequires(srcDir);

if (issues.length === 0) {
  const fileCount = (function countJs(d) {
    let c = 0;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== "node_modules") c += countJs(path.join(d, e.name));
      else if (e.name.endsWith(".js")) c++;
    }
    return c;
  })(srcDir);
  console.log(`All ${fileCount} files have valid require paths.`);
  process.exit(0);
} else {
  console.error(`BROKEN PATHS (${issues.length}):`);
  issues.forEach((i) => console.error(`  ${i}`));
  process.exit(1);
}
