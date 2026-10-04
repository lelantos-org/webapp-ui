// Every `var(--token)` must resolve to a declared custom property. The browser
// drops a declaration with an undeclared token without any build error.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";

/// Custom properties set from JavaScript, so no stylesheet declares them.
const SET_IN_JS = new Set(["--rcpt-h"]);

/** @param {string} dir @returns {Generator<string>} */
function* cssFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* cssFiles(path);
    else if (entry.endsWith(".css")) yield path;
  }
}

const files = [...cssFiles(SRC)];

// A declaration in any stylesheet counts, so component-local properties are valid.
const declared = new Set(SET_IN_JS);
for (const file of files) {
  for (const match of readFileSync(file, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
    if (match[1]) declared.add(match[1]);
  }
}

/** @type {string[]} */
const offences = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const match of line.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      const name = match[1];
      if (name && !declared.has(name)) {
        offences.push(`  ${file}:${i + 1}\n    ${name} is not declared`);
      }
    }
  });
}

if (offences.length > 0) {
  console.error(`${offences.length} undeclared CSS custom propert(ies):\n`);
  console.error(offences.join("\n"));
  process.exit(1);
}

console.log(`check:css-tokens — ${files.length} stylesheet(s), every var() resolves.`);
