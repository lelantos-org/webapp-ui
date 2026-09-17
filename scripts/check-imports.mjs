// Module-boundary checks Biome cannot express:
//   1. `vi.mock` / `import()` / `typeof import()` paths resolve, and cross-feature ones name the barrel.
//   2. References that leave their module use the `@/` alias.
//   3. Flows are imported only by src/flows/loaders.ts, dynamically.
//   4. No import cycles between features.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SRC = "src";
const LOADERS = join(SRC, "flows", "loaders.ts");

/**
 * @param {string} dir
 * @returns {Generator<string>}
 */
function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) yield path;
  }
}

/**
 * The module a path belongs to: `features/x`, `flows/x`, `shared/x`, or the
 * top-level directory (`app`, `config`, `test`, and `flows` for the loaders).
 * @param {string} path
 */
function moduleOf(path) {
  const parts = relative(SRC, path).split(sep);
  if (["features", "flows", "shared"].includes(parts[0] ?? "") && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? "";
}

/** @param {string} base */
function resolveFile(base) {
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return undefined;
}

/** @typedef {"static" | "dynamic" | "mock" | "typeof"} Kind */

/**
 * Every local specifier in a file, with how it is used.
 * @param {string} source
 * @returns {{ spec: string, kind: Kind, line: number }[]}
 */
function references(source) {
  /** @type {{ spec: string, kind: Kind, line: number }[]} */
  const hits = [];
  const at = (/** @type {number} */ index) => source.slice(0, index).split("\n").length;
  const patterns = /** @type {const} */ ([
    ["static", /(?:^|\n)\s*(?:import|export)\b[^;"]*?\bfrom\s*"([^"]+)"/g],
    ["static", /(?:^|\n)\s*import\s*"([^"]+)"/g],
    ["typeof", /typeof\s+import\(\s*"([^"]+)"\s*\)/g],
    ["dynamic", /(?<!typeof\s+)\bimport\(\s*"([^"]+)"\s*\)/g],
    ["mock", /\bvi\.(?:mock|doMock|unmock)\(\s*"([^"]+)"/g],
  ]);
  for (const [kind, re] of patterns) {
    for (const m of source.matchAll(re)) {
      const spec = m[1] ?? "";
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        hits.push({ spec, kind, line: at(m.index + m[0].lastIndexOf(`"${spec}"`)) });
      }
    }
  }
  return hits;
}

/** @type {string[]} */
const offences = [];
const report = (/** @type {string} */ where, /** @type {string} */ msg) =>
  offences.push(`  ${where}\n    ${msg}`);

/** Feature → features it references (production files only), with one example site. */
/** @type {Map<string, Map<string, string>>} */
const featureEdges = new Map();

for (const file of sourceFiles(SRC)) {
  const from = moduleOf(file);
  const isTest = /\.(test|spec)\.tsx?$/.test(file) || from === "test";
  for (const { spec, kind, line } of references(readFileSync(file, "utf8"))) {
    const where = `${file}:${line}`;
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : resolve(dirname(file), spec);
    const resolved = resolveFile(base);
    if (!resolved) {
      if (kind === "mock" || kind === "typeof") report(where, `${spec} does not resolve`);
      continue;
    }
    const target = relative(process.cwd(), resolved);
    const to = moduleOf(target);
    if (to === from) continue;

    // 2. crossings use the alias
    if (spec.startsWith(".") && file !== LOADERS) {
      report(where, `${spec} leaves ${from} for ${to} — use the "@/" alias`);
    }

    // 1. what Biome cannot see must also go through the barrel
    if (kind !== "static" && to.startsWith("features/") && target !== join(SRC, to, "index.ts")) {
      report(where, `${spec} reaches into ${to} — use its barrel "@/${to}"`);
    }

    // 3. flows only through the loaders, dynamically
    if (to.startsWith("flows/")) {
      if (file !== LOADERS)
        report(where, `${spec}: only src/flows/loaders.ts may reference a flow`);
      else if (kind !== "dynamic") report(where, `${spec}: loaders must import a flow dynamically`);
    }

    // 4. collected here, checked below
    if (!isTest && from.startsWith("features/") && to.startsWith("features/")) {
      const edges = featureEdges.get(from) ?? new Map();
      if (!edges.has(to)) edges.set(to, where);
      featureEdges.set(from, edges);
    }
  }
}

// 4. no cycles between features: a depth-first search reporting each back edge.
/** @type {Map<string, "open" | "done">} */
const state = new Map();
/** @type {string[]} */
const stack = [];
/** @param {string} feature */
function visit(feature) {
  state.set(feature, "open");
  stack.push(feature);
  for (const [next, where] of featureEdges.get(feature) ?? []) {
    if (state.get(next) === "open") {
      const cycle = [...stack.slice(stack.indexOf(next)), next].join(" → ");
      report(where, `feature import cycle: ${cycle}`);
    } else if (!state.has(next)) {
      visit(next);
    }
  }
  stack.pop();
  state.set(feature, "done");
}
for (const feature of featureEdges.keys()) if (!state.has(feature)) visit(feature);

if (offences.length > 0) {
  console.error(`${offences.length} module-boundary offence(s):\n`);
  console.error(offences.join("\n"));
  process.exit(1);
}

console.log("imports: module boundaries hold");
